import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Channel, MessageStatus } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { applyManualPriority, clampPriority, computeTaskPriority, waitingDays, priorityMeta } from "@/lib/priority";
import { buildSearchText, searchTerms } from "@/lib/search-text";
import { formatDateTime } from "@/lib/format";
import { makePreview } from "@/lib/utils";
import type { AIDeadline, AIReplySuggestion, AISentiment, AITaskSuggestion } from "@/lib/ai-types";
import type { MessageCounts, MessageDetail, MessageListItem } from "@/lib/dto";
import type { AssignMessageInput, MessageListQuery, MessageUpdateInput } from "@/lib/validation";
import type { Db, Effects } from "../db";
import type { SessionUser } from "../session";
import { badRequest, forbidden, notFound } from "../errors";
import { notify } from "../notifications";
import { publish } from "../realtime";
import { features } from "../env";
import { messageScope, taskScope } from "./scopes";
import { loadRules } from "./team-settings";
import { toHistoryDTO, toUserRef, userRefSelect } from "./tasks";

const listInclude = {
  owner: { select: userRefSelect },
  assignee: { select: userRefSelect },
  _count: { select: { tasks: { where: { status: { not: "DONE" } } } } },
} satisfies Prisma.MessageInclude;

type MessageWithList = Prisma.MessageGetPayload<{ include: typeof listInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const OPEN: MessageStatus[] = ["UNREAD", "WAITING_REPLY"];

function toListItem(m: MessageWithList, now = new Date()): MessageListItem {
  const attachments = Array.isArray(m.attachments) ? m.attachments : [];
  return {
    id: m.id,
    channel: m.channel,
    direction: m.direction,
    senderName: m.senderName,
    senderContact: m.senderContact,
    subject: m.subject,
    preview: m.preview,
    receivedAt: m.receivedAt.toISOString(),
    status: m.status,
    priority: m.priority,
    basePriority: m.basePriority,
    escalated: m.priority < m.basePriority,
    starred: m.starred,
    aiStatus: m.aiStatus,
    aiSummary: m.aiSummary,
    aiSentiment: (m.aiSentiment as AISentiment | null) ?? null,
    owner: m.owner ? toUserRef(m.owner) : null,
    assignee: m.assignee ? toUserRef(m.assignee) : null,
    hasAttachments: attachments.length > 0,
    waitingDays: OPEN.includes(m.status) ? waitingDays(m.receivedAt, now) : 0,
    openTaskCount: m._count.tasks,
  };
}

function viewFilter(user: SessionUser, view: MessageListQuery["view"]): Prisma.MessageWhereInput {
  switch (view) {
    case "unread":
      return { status: "UNREAD" };
    case "waiting":
      return { status: { in: OPEN } };
    case "high":
      return { status: { not: "RESOLVED" }, priority: { lte: 2 } };
    case "assigned":
      return { status: "ASSIGNED" };
    case "resolved":
      return { status: "RESOLVED" };
    case "starred":
      return { starred: true };
    case "mine":
      return { OR: [{ assigneeId: user.id }, { ownerId: user.id }] };
    default:
      return {};
  }
}

export async function listMessages(
  db: Db,
  user: SessionUser,
  query: MessageListQuery,
): Promise<{ items: MessageListItem[]; counts: MessageCounts; nextCursor: string | null }> {
  const base: Prisma.MessageWhereInput[] = [messageScope(user), { direction: "INBOUND" }];
  for (const term of searchTerms(query.q ?? "")) base.push({ searchText: { contains: term } });
  if (query.assigneeId) base.push({ assigneeId: query.assigneeId });

  const and = [...base, viewFilter(user, query.view)];
  if (query.channel !== "ALL") and.push({ channel: query.channel });
  if (query.maxPriority) and.push({ priority: { lte: query.maxPriority } });

  const orderBy: Prisma.MessageOrderByWithRelationInput[] =
    query.sort === "oldest"
      ? [{ receivedAt: "asc" }, { id: "asc" }]
      : query.sort === "priority"
        ? [{ priority: "asc" }, { receivedAt: "desc" }, { id: "desc" }]
        : [{ receivedAt: "desc" }, { id: "desc" }];

  const rows = await db.message.findMany({
    where: { AND: and },
    include: listInclude,
    orderBy,
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;

  // Counters for the filter chips (respect search + scope, not the active view/channel).
  const grouped = await db.message.groupBy({ by: ["status", "channel"], where: { AND: base }, _count: { _all: true } });
  const high = await db.message.count({ where: { AND: [...base, { status: { not: "RESOLVED" }, priority: { lte: 2 } }] } });
  const starred = await db.message.count({ where: { AND: [...base, { starred: true }] } });
  const counts: MessageCounts & { starred: number } = {
    all: 0,
    unread: 0,
    waiting: 0,
    highPriority: high,
    assigned: 0,
    resolved: 0,
    starred,
    byChannel: { EMAIL: 0, WHATSAPP: 0, SMS: 0, IMESSAGE: 0, INTERNAL: 0 },
  };
  for (const g of grouped) {
    const n = g._count._all;
    counts.all += n;
    counts.byChannel[g.channel] += n;
    if (g.status === "UNREAD") counts.unread += n;
    if (OPEN.includes(g.status)) counts.waiting += n;
    if (g.status === "ASSIGNED") counts.assigned += n;
    if (g.status === "RESOLVED") counts.resolved += n;
  }

  const now = new Date();
  return { items: page.map((m) => toListItem(m, now)), counts, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export interface ReplyCapability {
  canSend: boolean;
  via: string;
  note: string | null;
}

export function replyCapability(
  channel: Channel,
  integration: { type: string; status: string; credentials: string | null } | null,
): ReplyCapability {
  const active = integration && integration.status === "ACTIVE";
  if (channel === "EMAIL") {
    if (active && (integration.type === "GOOGLE" || integration.type === "MICROSOFT")) {
      return { canSend: true, via: integration.type === "GOOGLE" ? "Gmail" : "Outlook", note: null };
    }
    return { canSend: false, via: "manual", note: "Schránka není připojena – odpověď se uloží do historie a zkopíruje do schránky." };
  }
  if (channel === "WHATSAPP") {
    if (active && integration.type === "WHATSAPP" && integration.credentials) return { canSend: true, via: "WhatsApp Business", note: null };
    return { canSend: false, via: "manual", note: "WhatsApp Business API není nakonfigurováno – odpověď zkopírujte a odešlete z telefonu." };
  }
  if (channel === "SMS" && features.twilio) return { canSend: true, via: "SMS (Twilio)", note: null };
  if (channel === "SMS" || channel === "IMESSAGE") {
    return { canSend: false, via: "manual", note: "SMS/iMessage odpovědi odesílejte z telefonu – text zkopírujeme do schránky." };
  }
  return { canSend: false, via: "manual", note: null };
}

export async function getMessage(db: Db, user: SessionUser, id: string): Promise<MessageDetail> {
  const m = await db.message.findFirst({
    where: { AND: [{ id }, messageScope(user)] },
    include: {
      ...listInclude,
      integration: { select: { type: true, status: true, credentials: true } },
      priorityHistory: { include: { changedBy: { select: userRefSelect } }, orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!m) throw notFound("Zpráva");

  const thread = m.threadKey
      ? await db.message.findMany({
          where: { AND: [{ threadKey: m.threadKey, teamId: user.teamId }, messageScope(user)] },
          orderBy: { receivedAt: "asc" },
          take: 30,
          select: { id: true, direction: true, channel: true, senderName: true, content: true, receivedAt: true },
        })
      : [];
  const tasks = await db.task.findMany({
      where: { AND: [{ sourceMessageId: m.id }, taskScope(user)] },
      include: { assignees: { include: { user: { select: userRefSelect } } } },
      orderBy: { createdAt: "asc" },
    });

  const attachments = Array.isArray(m.attachments) ? (m.attachments as MessageDetail["attachments"]) : [];
  const isDirector = can(user.role, "messages:assign");
  return {
    ...toListItem(m),
    content: m.content,
    recipient: m.recipient,
    attachments,
    autoEscalate: m.autoEscalate,
    aiIntent: m.aiIntent,
    aiTopics: m.aiTopics,
    aiSuggestedPriority: m.aiSuggestedPriority,
    aiPriorityReason: m.aiPriorityReason,
    aiDeadline: iso(m.aiDeadline),
    aiTasks: (Array.isArray(m.aiTasks) ? m.aiTasks : []) as unknown as AITaskSuggestion[],
    aiDeadlines: (Array.isArray(m.aiDeadlines) ? m.aiDeadlines : []) as unknown as AIDeadline[],
    aiReplies: (Array.isArray(m.aiReplies) ? m.aiReplies : []) as unknown as AIReplySuggestion[],
    aiModel: m.aiModel,
    aiProcessedAt: iso(m.aiProcessedAt),
    readAt: iso(m.readAt),
    repliedAt: iso(m.repliedAt),
    resolvedAt: iso(m.resolvedAt),
    thread: thread.map((t) => ({
      id: t.id,
      direction: t.direction,
      channel: t.channel,
      senderName: t.senderName,
      content: t.content,
      receivedAt: t.receivedAt.toISOString(),
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: iso(t.deadline),
      assignees: t.assignees.map((a) => toUserRef(a.user)),
    })),
    history: m.priorityHistory.map(toHistoryDTO),
    reply: replyCapability(m.channel, m.integration),
    permissions: {
      canAssign: isDirector,
      canReply: can(user.role, "messages:reply"),
      canChangePriority: can(user.role, "priority:override"),
    },
  };
}

export async function updateMessage(db: Db, user: SessionUser, id: string, input: MessageUpdateInput, fx: Effects): Promise<MessageListItem> {
  const m = await db.message.findFirst({ where: { AND: [{ id }, messageScope(user)] } });
  if (!m) throw notFound("Zpráva");
  if (input.assigneeId !== undefined && !can(user.role, "messages:assign")) throw forbidden("Zprávy může přiřazovat pouze ředitel.");
  if (input.priority !== undefined && !can(user.role, "priority:override")) throw forbidden();

  const now = new Date();
  const data: Prisma.MessageUpdateInput = {};
  if (input.starred !== undefined) data.starred = input.starred;
  if (input.status !== undefined && input.status !== m.status) {
    data.status = input.status;
    if (input.status === "RESOLVED") data.resolvedAt = now;
    if (input.status !== "UNREAD" && !m.readAt) data.readAt = now;
    if (input.status === "UNREAD") data.readAt = null;
  }
  if (input.priority !== undefined) {
    const rules = await loadRules(db, user.teamId);
    const manual = applyManualPriority(input.priority, m.aiDeadline, now, rules, input.keepEscalation ?? true);
    data.basePriority = manual.basePriority;
    data.priority = manual.priority;
    data.autoEscalate = manual.autoEscalate;
    if (manual.priority !== m.priority) {
      await db.priorityHistory.create({
        data: {
          teamId: user.teamId,
          messageId: m.id,
          oldPriority: m.priority,
          newPriority: manual.priority,
          reason: (input.priorityReason?.trim() || "Ruční změna priority") + (manual.pausedEscalation ? " · automatické zvyšování pozastaveno" : ""),
          source: "MANUAL",
          changedById: user.id,
        },
      });
    }
  }
  let newAssignee: string | null = null;
  if (input.assigneeId !== undefined) {
    if (input.assigneeId) {
      const assignee = await db.user.findFirst({ where: { id: input.assigneeId, teamId: user.teamId, isActive: true }, select: { id: true } });
      if (!assignee) throw badRequest("Vybraný člen týmu neexistuje.");
      newAssignee = assignee.id !== m.assigneeId ? assignee.id : null;
      data.assignee = { connect: { id: assignee.id } };
      if (m.status !== "RESOLVED") data.status = "ASSIGNED";
    } else {
      data.assignee = { disconnect: true };
    }
  }

  const updated = await db.message.update({ where: { id: m.id }, data, include: listInclude });
  if (newAssignee) {
    fx.add(() =>
      notify({
        teamId: user.teamId,
        userIds: [newAssignee],
        excludeUserId: user.id,
        type: "MESSAGE_ASSIGNED",
        title: `Přiřazena zpráva od ${updated.senderName ?? updated.senderContact}`,
        body: updated.aiSummary ?? updated.preview,
        link: `/inbox?message=${updated.id}`,
        priority: updated.priority,
        messageId: updated.id,
      }),
    );
  }
  fx.add(() => publish({ type: "messages.changed", teamId: user.teamId, messageIds: [updated.id] }));
  return toListItem(updated, now);
}

/** "Assign task" from a message: creates a task with the message as its source. */
export async function assignMessage(db: Db, user: SessionUser, id: string, input: AssignMessageInput, fx: Effects) {
  if (!can(user.role, "messages:assign")) throw forbidden("Zprávy může přiřazovat pouze ředitel.");
  const m = await db.message.findFirst({ where: { AND: [{ id }, messageScope(user)] } });
  if (!m) throw notFound("Zpráva");

  const assignees = await db.user.findMany({
    where: { id: { in: input.assigneeIds }, teamId: user.teamId, isActive: true },
    select: { id: true, name: true },
  });
  if (assignees.length !== new Set(input.assigneeIds).size) throw badRequest("Vybraný člen týmu neexistuje nebo je neaktivní.");

  const now = new Date();
  const rules = await loadRules(db, user.teamId);
  const deadline = input.deadline ? new Date(input.deadline) : null;
  const base = clampPriority(input.priority);
  const computed = computeTaskPriority({ basePriority: base, deadline, autoEscalate: true, status: "NEW" }, now, rules);

  const task = await db.task.create({
    data: {
      teamId: user.teamId,
      title: input.title,
      description: input.description || m.aiSummary || makePreview(m.content, 500),
      clientName: m.senderName,
      basePriority: base,
      priority: computed.priority,
      deadline,
      creatorId: user.id,
      sourceMessageId: m.id,
      searchText: buildSearchText(input.title, input.description, m.senderName),
      assignees: { create: assignees.map((a) => ({ userId: a.id, assignedById: user.id })) },
    },
  });
  await db.priorityHistory.create({
    data: { teamId: user.teamId, taskId: task.id, newPriority: base, reason: "Úkol vytvořen ze zprávy", source: "MANUAL", changedById: user.id },
  });
  if (computed.priority < base && computed.reason) {
    await db.priorityHistory.create({
      data: { teamId: user.teamId, taskId: task.id, oldPriority: base, newPriority: computed.priority, reason: computed.reason, source: "AUTO" },
    });
  }
  if (input.comment) {
    await db.comment.create({ data: { teamId: user.teamId, taskId: task.id, authorId: user.id, body: input.comment } });
  }
  await db.message.update({
    where: { id: m.id },
    data: { assigneeId: assignees[0].id, status: m.status === "RESOLVED" ? "RESOLVED" : "ASSIGNED", readAt: m.readAt ?? now },
  });

  const meta = priorityMeta(computed.priority);
  fx.add(() =>
    notify({
      teamId: user.teamId,
      userIds: assignees.map((a) => a.id),
      excludeUserId: user.id,
      type: "TASK_ASSIGNED",
      title: `Nový úkol: ${task.title}`,
      body: [
        `Přiřadil(a) ${user.name} · ${meta.code} ${meta.label}`,
        deadline ? `Termín: ${formatDateTime(deadline)}` : null,
        `Zpráva od: ${m.senderName ?? m.senderContact}`,
        input.comment ? `„${input.comment}“` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      link: `/my-tasks?task=${task.id}`,
      priority: computed.priority,
      taskId: task.id,
    }),
  );
  fx.add(() => publish({ type: "tasks.changed", teamId: user.teamId, taskIds: [task.id] }));
  fx.add(() => publish({ type: "messages.changed", teamId: user.teamId, messageIds: [m.id] }));
  return { taskId: task.id };
}

/** Load what is needed to send a reply (access check happens here). */
export async function prepareReply(db: Db, user: SessionUser, id: string) {
  if (!can(user.role, "messages:reply")) throw forbidden();
  const m = await db.message.findFirst({
    where: { AND: [{ id }, messageScope(user)] },
    include: { integration: true },
  });
  if (!m) throw notFound("Zpráva");
  return m;
}

export async function recordReply(
  db: Db,
  user: SessionUser,
  original: { id: string; channel: Channel; threadKey: string | null; senderContact: string; subject: string | null; integrationId: string | null },
  text: string,
  sent: { externalId: string | null; via: string },
  resolve: boolean,
  fx: Effects,
) {
  const now = new Date();
  const reply = await db.message.create({
    data: {
      teamId: user.teamId,
      ownerId: user.id,
      integrationId: original.integrationId,
      channel: original.channel,
      direction: "OUTBOUND",
      externalId: sent.externalId,
      threadKey: original.threadKey,
      senderName: user.name,
      senderContact: user.email,
      recipient: original.senderContact,
      subject: original.subject ? (original.subject.startsWith("Re:") ? original.subject : `Re: ${original.subject}`) : null,
      content: text,
      preview: makePreview(text),
      receivedAt: now,
      status: "RESOLVED",
      basePriority: 5,
      priority: 5,
      aiStatus: "SKIPPED",
      readAt: now,
      resolvedAt: now,
      searchText: buildSearchText(text),
      metadata: { sentVia: sent.via },
    },
  });
  await db.message.update({
    where: { id: original.id },
    data: {
      repliedAt: now,
      readAt: now,
      ...(resolve ? { status: "RESOLVED", resolvedAt: now } : { status: "WAITING_REPLY" }),
    },
  });
  fx.add(() => publish({ type: "messages.changed", teamId: user.teamId, messageIds: [original.id, reply.id] }));
  return { id: reply.id, sentVia: sent.via };
}
