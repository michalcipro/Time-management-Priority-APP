import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TaskStatus } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { applyManualPriority, clampPriority, computeTaskPriority, priorityMeta } from "@/lib/priority";
import { buildSearchText, searchTerms } from "@/lib/search-text";
import { addDays, formatDateTime } from "@/lib/format";
import { TASK_STATUS_LABELS } from "@/lib/labels";
import type { TaskCreateInput, TaskListQuery, TaskUpdateInput } from "@/lib/validation";
import type { CommentDTO, PriorityHistoryDTO, TaskDetail, TaskListItem, UserRef } from "@/lib/dto";
import type { Db, Effects } from "../db";
import type { SessionUser } from "../session";
import { ApiError, badRequest, forbidden, notFound } from "../errors";
import { notify } from "../notifications";
import { publish } from "../realtime";
import { taskScope, messageScope } from "./scopes";
import { loadRules } from "./team-settings";

export const userRefSelect = { id: true, name: true, title: true, avatarColor: true, role: true } satisfies Prisma.UserSelect;

export const taskListInclude = {
  creator: { select: userRefSelect },
  assignees: {
    include: { user: { select: userRefSelect }, assignedBy: { select: { role: true } } },
    orderBy: { assignedAt: "asc" },
  },
  sourceMessage: { select: { id: true, channel: true, senderName: true, subject: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

type TaskWithList = Prisma.TaskGetPayload<{ include: typeof taskListInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toUserRef(u: { id: string; name: string; title: string | null; avatarColor: string | null; role: UserRef["role"] }): UserRef {
  return { id: u.id, name: u.name, title: u.title, avatarColor: u.avatarColor, role: u.role };
}

export function toTaskListItem(t: TaskWithList): TaskListItem {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    clientName: t.clientName,
    status: t.status,
    priority: t.priority,
    basePriority: t.basePriority,
    autoEscalate: t.autoEscalate,
    escalated: t.priority < t.basePriority,
    deadline: iso(t.deadline),
    remindAt: iso(t.remindAt),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    completedAt: iso(t.completedAt),
    needsDirectorAttention: t.needsDirectorAttention,
    assignedByDirector: t.assignees.some((a) => a.assignedBy?.role === "DIRECTOR") || t.creator.role === "DIRECTOR",
    creator: toUserRef(t.creator),
    assignees: t.assignees.map((a) => toUserRef(a.user)),
    commentCount: t._count.comments,
    sourceMessage: t.sourceMessage,
  };
}

export function toHistoryDTO(h: Prisma.PriorityHistoryGetPayload<{ include: { changedBy: { select: typeof userRefSelect } } }>): PriorityHistoryDTO {
  return {
    id: h.id,
    oldPriority: h.oldPriority,
    newPriority: h.newPriority,
    reason: h.reason,
    source: h.source,
    createdAt: h.createdAt.toISOString(),
    changedBy: h.changedBy ? toUserRef(h.changedBy) : null,
  };
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function listTasks(db: Db, user: SessionUser, query: TaskListQuery): Promise<TaskListItem[]> {
  const and: Prisma.TaskWhereInput[] = [taskScope(user)];

  if (query.scope === "mine") and.push({ assignees: { some: { userId: user.id } } });
  else if (query.scope === "created") and.push({ creatorId: user.id });
  else if (!can(user.role, "tasks:read:all")) and.push({ assignees: { some: { userId: user.id } } });

  if (query.assigneeId) and.push({ assignees: { some: { userId: query.assigneeId } } });
  if (query.status === "open") and.push({ status: { not: "DONE" } });
  else if (query.status !== "all") and.push({ status: query.status });
  if (query.maxPriority) and.push({ priority: { lte: query.maxPriority } });
  if (query.overdue === "true") and.push({ deadline: { lt: new Date() }, status: { not: "DONE" } });
  if (query.attention === "true") and.push({ needsDirectorAttention: true });
  for (const term of searchTerms(query.q ?? "")) and.push({ searchText: { contains: term } });

  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    query.sort === "deadline"
      ? [{ deadline: { sort: "asc", nulls: "last" } }, { priority: "asc" }]
      : query.sort === "created"
        ? [{ createdAt: "desc" }]
        : query.sort === "updated"
          ? [{ updatedAt: "desc" }]
          : [{ priority: "asc" }, { deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];

  const rows = await db.task.findMany({ where: { AND: and }, include: taskListInclude, orderBy, take: query.limit });
  const items = rows.map(toTaskListItem);

  // "The director outranks the team": at equal priority, tasks from the director come first.
  if (query.sort === "priority" && query.scope === "mine" && user.role !== "DIRECTOR") {
    items.sort((a, b) => {
      if (a.status === "DONE" && b.status !== "DONE") return 1;
      if (b.status === "DONE" && a.status !== "DONE") return -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.assignedByDirector !== b.assignedByDirector) return a.assignedByDirector ? -1 : 1;
      return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    });
  }
  return items;
}

function taskPermissions(user: SessionUser, task: { creatorId: string; assignees: { userId: string }[] }) {
  const isDirector = can(user.role, "tasks:update:any");
  const isCreator = task.creatorId === user.id;
  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  return {
    isDirector,
    isCreator,
    isAssignee,
    canEdit: isDirector || isCreator,
    canChangeStatus: isDirector || isCreator || isAssignee,
    canAssign: can(user.role, "tasks:assign"),
    canDelete: can(user.role, "tasks:delete"),
    canOverridePriority: can(user.role, "priority:override") && (isDirector || isCreator || isAssignee),
    canComment: isDirector || isCreator || isAssignee,
    canEscalate: !isDirector && (isAssignee || isCreator),
  };
}

export async function getTask(db: Db, user: SessionUser, id: string): Promise<TaskDetail> {
  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    include: {
      ...taskListInclude,
      comments: { include: { author: { select: userRefSelect } }, orderBy: { createdAt: "asc" } },
      priorityHistory: { include: { changedBy: { select: userRefSelect } }, orderBy: { createdAt: "desc" }, take: 50 },
      sourceMessage: {
        select: { id: true, channel: true, senderName: true, senderContact: true, subject: true, preview: true, aiSummary: true, receivedAt: true },
      },
    },
  });
  if (!task) throw notFound("Úkol");
  const perms = taskPermissions(user, task);

  return {
    ...toTaskListItem(task as unknown as TaskWithList),
    sourceMessage: task.sourceMessage
      ? { id: task.sourceMessage.id, channel: task.sourceMessage.channel, senderName: task.sourceMessage.senderName, subject: task.sourceMessage.subject }
      : null,
    comments: task.comments.map(
      (c): CommentDTO => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: toUserRef(c.author) }),
    ),
    history: task.priorityHistory.map(toHistoryDTO),
    source: task.sourceMessage
      ? {
          id: task.sourceMessage.id,
          channel: task.sourceMessage.channel,
          senderName: task.sourceMessage.senderName,
          senderContact: task.sourceMessage.senderContact,
          subject: task.sourceMessage.subject,
          preview: task.sourceMessage.preview,
          aiSummary: task.sourceMessage.aiSummary,
          receivedAt: task.sourceMessage.receivedAt.toISOString(),
        }
      : null,
    permissions: {
      canEdit: perms.canEdit,
      canChangeStatus: perms.canChangeStatus,
      canAssign: perms.canAssign,
      canDelete: perms.canDelete,
      canOverridePriority: perms.canOverridePriority,
      canComment: perms.canComment,
      canEscalate: perms.canEscalate,
    },
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

async function validateAssignees(db: Db, user: SessionUser, assigneeIds: string[]): Promise<{ id: string; name: string }[]> {
  if (assigneeIds.length === 0) return [];
  const others = assigneeIds.filter((a) => a !== user.id);
  if (others.length > 0 && !can(user.role, "tasks:assign")) throw forbidden("Úkoly může přiřazovat ostatním pouze ředitel.");
  const users = await db.user.findMany({
    where: { id: { in: assigneeIds }, teamId: user.teamId, isActive: true },
    select: { id: true, name: true },
  });
  if (users.length !== new Set(assigneeIds).size) throw badRequest("Vybraný člen týmu neexistuje nebo je neaktivní.");
  return users;
}

export async function createTask(db: Db, user: SessionUser, input: TaskCreateInput, fx: Effects): Promise<TaskListItem> {
  if (!can(user.role, "tasks:create")) throw forbidden();
  const assigneeIds = input.assigneeIds.length > 0 ? input.assigneeIds : [user.id];
  const assignees = await validateAssignees(db, user, assigneeIds);

  if (input.sourceMessageId) {
    const visible = await db.message.findFirst({ where: { AND: [{ id: input.sourceMessageId }, messageScope(user)] }, select: { id: true } });
    if (!visible) throw notFound("Zpráva");
  }

  const now = new Date();
  const rules = await loadRules(db, user.teamId);
  const deadline = input.deadline ? new Date(input.deadline) : null;
  const remindAt = input.remindInDays ? addDays(now, input.remindInDays) : null;
  const base = clampPriority(input.priority);
  const computed = computeTaskPriority({ basePriority: base, deadline, remindAt, autoEscalate: input.autoEscalate, status: "NEW" }, now, rules);

  const task = await db.task.create({
    data: {
      teamId: user.teamId,
      title: input.title,
      description: input.description || null,
      clientName: input.clientName || null,
      basePriority: base,
      priority: computed.priority,
      autoEscalate: input.autoEscalate,
      deadline,
      remindAt,
      creatorId: user.id,
      sourceMessageId: input.sourceMessageId || null,
      searchText: buildSearchText(input.title, input.description, input.clientName),
      assignees: { create: assignees.map((a) => ({ userId: a.id, assignedById: user.id })) },
    },
    include: taskListInclude,
  });

  await db.priorityHistory.create({
    data: { teamId: user.teamId, taskId: task.id, newPriority: base, reason: "Úkol vytvořen", source: "MANUAL", changedById: user.id },
  });
  if (computed.priority < base && computed.reason) {
    await db.priorityHistory.create({
      data: { teamId: user.teamId, taskId: task.id, oldPriority: base, newPriority: computed.priority, reason: computed.reason, source: "AUTO" },
    });
  }
  if (input.comment) {
    await db.comment.create({ data: { teamId: user.teamId, taskId: task.id, authorId: user.id, body: input.comment } });
  }

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
  return toTaskListItem(task);
}

export async function updateTask(db: Db, user: SessionUser, id: string, input: TaskUpdateInput, fx: Effects): Promise<TaskListItem> {
  const task = await db.task.findFirst({
    where: { AND: [{ id }, taskScope(user)] },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) throw notFound("Úkol");
  const perms = taskPermissions(user, task);

  const editsCore =
    input.title !== undefined ||
    input.description !== undefined ||
    input.clientName !== undefined ||
    input.deadline !== undefined ||
    input.remindAt !== undefined;
  if (editsCore && !perms.canEdit) throw forbidden("Upravit úkol může jen jeho autor nebo ředitel.");
  if ((input.status !== undefined || input.autoEscalate !== undefined || input.needsDirectorAttention !== undefined) && !perms.canChangeStatus) {
    throw forbidden();
  }
  if (input.priority !== undefined && !perms.canOverridePriority) throw forbidden("Prioritu tohoto úkolu nemůžete měnit.");
  if (input.assigneeIds !== undefined && !perms.canAssign) throw forbidden("Přiřazovat úkoly může pouze ředitel.");

  const now = new Date();
  const rules = await loadRules(db, user.teamId);
  const data: Prisma.TaskUpdateInput = {};
  const history: Omit<Prisma.PriorityHistoryCreateManyInput, "teamId" | "taskId">[] = [];

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.clientName !== undefined) data.clientName = input.clientName || null;

  const deadline = input.deadline !== undefined ? (input.deadline ? new Date(input.deadline) : null) : task.deadline;
  const remindAt = input.remindAt !== undefined ? (input.remindAt ? new Date(input.remindAt) : null) : task.remindAt;
  if (input.deadline !== undefined) {
    data.deadline = deadline;
    data.overdueNotifiedAt = null;
  }
  if (input.remindAt !== undefined) data.remindAt = remindAt;

  let base = task.basePriority;
  let autoEscalate = input.autoEscalate ?? task.autoEscalate;
  let priority = task.priority;

  if (input.priority !== undefined) {
    const manual = applyManualPriority(input.priority, deadline, now, rules, input.keepEscalation ?? true);
    base = manual.basePriority;
    priority = manual.priority;
    autoEscalate = manual.autoEscalate;
    if (priority !== task.priority || base !== task.basePriority) {
      history.push({
        oldPriority: task.priority,
        newPriority: priority,
        reason:
          (input.priorityReason?.trim() || "Ruční změna priority") +
          (manual.pausedEscalation ? " · automatické zvyšování pozastaveno" : ""),
        source: "MANUAL",
        changedById: user.id,
      });
    }
  } else if (input.deadline !== undefined || input.remindAt !== undefined || input.autoEscalate !== undefined) {
    const computed = computeTaskPriority({ basePriority: base, deadline, remindAt, autoEscalate, status: input.status ?? task.status }, now, rules);
    if (computed.priority !== task.priority) {
      history.push({
        oldPriority: task.priority,
        newPriority: computed.priority,
        reason: input.deadline !== undefined ? `Změna termínu${computed.reason ? ` – ${computed.reason.toLowerCase()}` : ""}` : computed.reason ?? "Přepočet priority",
        source: "SYSTEM",
        changedById: user.id,
      });
      priority = computed.priority;
    }
  }
  data.basePriority = base;
  data.priority = priority;
  data.autoEscalate = autoEscalate;
  if (priority < task.priority) data.lastEscalatedAt = now;

  let statusChanged: TaskStatus | null = null;
  if (input.status !== undefined && input.status !== task.status) {
    data.status = input.status;
    data.completedAt = input.status === "DONE" ? now : null;
    if (input.status === "DONE") data.needsDirectorAttention = false;
    statusChanged = input.status;
  }
  if (input.needsDirectorAttention !== undefined) data.needsDirectorAttention = input.needsDirectorAttention;

  let addedAssignees: string[] = [];
  if (input.assigneeIds !== undefined) {
    const validated = await validateAssignees(db, user, input.assigneeIds);
    const current = new Set(task.assignees.map((a) => a.userId));
    const next = new Set(validated.map((v) => v.id));
    addedAssignees = [...next].filter((u) => !current.has(u));
    const removed = [...current].filter((u) => !next.has(u));
    if (removed.length) await db.taskAssignee.deleteMany({ where: { taskId: task.id, userId: { in: removed } } });
    if (addedAssignees.length) {
      await db.taskAssignee.createMany({ data: addedAssignees.map((u) => ({ taskId: task.id, userId: u, assignedById: user.id })) });
    }
  }

  if (data.title !== undefined || data.description !== undefined || data.clientName !== undefined) {
    data.searchText = buildSearchText(
      (data.title as string | undefined) ?? task.title,
      data.description !== undefined ? (data.description as string | null) : task.description,
      data.clientName !== undefined ? (data.clientName as string | null) : task.clientName,
    );
  }

  const updated = await db.task.update({ where: { id: task.id }, data, include: taskListInclude });
  if (history.length) {
    await db.priorityHistory.createMany({ data: history.map((h) => ({ ...h, teamId: user.teamId, taskId: task.id })) });
  }

  const participants = [updated.creatorId, ...updated.assignees.map((a) => a.userId)];
  if (statusChanged) {
    const directors = statusChanged === "DONE" ? await directorIds(db, user.teamId) : [];
    fx.add(() =>
      notify({
        teamId: user.teamId,
        userIds: [...participants, ...directors],
        excludeUserId: user.id,
        type: "TASK_STATUS",
        title: `${updated.title}: ${TASK_STATUS_LABELS[statusChanged!]}`,
        body: `${user.name} změnil(a) stav úkolu na „${TASK_STATUS_LABELS[statusChanged!]}“.`,
        link: `/tasks?task=${updated.id}`,
        priority: updated.priority,
        taskId: updated.id,
      }),
    );
  }
  if (addedAssignees.length) {
    fx.add(() =>
      notify({
        teamId: user.teamId,
        userIds: addedAssignees,
        excludeUserId: user.id,
        type: "TASK_ASSIGNED",
        title: `Nový úkol: ${updated.title}`,
        body: `Přiřadil(a) ${user.name} · ${priorityMeta(updated.priority).code}`,
        link: `/my-tasks?task=${updated.id}`,
        priority: updated.priority,
        taskId: updated.id,
      }),
    );
  }
  if (input.priority !== undefined && updated.priority !== task.priority) {
    fx.add(() =>
      notify({
        teamId: user.teamId,
        userIds: participants,
        excludeUserId: user.id,
        type: "PRIORITY_ESCALATED",
        title: `${updated.title}: P${task.priority} → P${updated.priority}`,
        body: `${user.name} změnil(a) prioritu.${input.priorityReason ? ` Důvod: ${input.priorityReason}` : ""}`,
        link: `/tasks?task=${updated.id}`,
        priority: updated.priority,
        taskId: updated.id,
      }),
    );
  }
  fx.add(() => publish({ type: "tasks.changed", teamId: user.teamId, taskIds: [updated.id] }));
  return toTaskListItem(updated);
}

export async function deleteTask(db: Db, user: SessionUser, id: string, fx: Effects): Promise<void> {
  if (!can(user.role, "tasks:delete")) throw forbidden();
  const task = await db.task.findFirst({ where: { AND: [{ id }, taskScope(user)] }, select: { id: true } });
  if (!task) throw notFound("Úkol");
  await db.task.delete({ where: { id } });
  fx.add(() => publish({ type: "tasks.changed", teamId: user.teamId, taskIds: [id] }));
}

export async function addComment(db: Db, user: SessionUser, taskId: string, body: string, fx: Effects): Promise<CommentDTO> {
  const task = await db.task.findFirst({
    where: { AND: [{ id: taskId }, taskScope(user)] },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) throw notFound("Úkol");
  const comment = await db.comment.create({
    data: { teamId: user.teamId, taskId, authorId: user.id, body },
    include: { author: { select: userRefSelect } },
  });
  fx.add(() =>
    notify({
      teamId: user.teamId,
      userIds: [task.creatorId, ...task.assignees.map((a) => a.userId)],
      excludeUserId: user.id,
      type: "TASK_COMMENT",
      title: `${user.name} okomentoval(a): ${task.title}`,
      body: body.length > 280 ? body.slice(0, 279) + "…" : body,
      link: `/tasks?task=${task.id}`,
      taskId: task.id,
    }),
  );
  fx.add(() => publish({ type: "tasks.changed", teamId: user.teamId, taskIds: [task.id] }));
  return { id: comment.id, body: comment.body, createdAt: comment.createdAt.toISOString(), author: toUserRef(comment.author) };
}

/** Advisor asks the director for help ("communicate back to the director"). */
export async function escalateToDirector(db: Db, user: SessionUser, taskId: string, note: string, fx: Effects): Promise<void> {
  const task = await db.task.findFirst({
    where: { AND: [{ id: taskId }, taskScope(user)] },
    include: { assignees: { select: { userId: true } } },
  });
  if (!task) throw notFound("Úkol");
  const perms = taskPermissions(user, task);
  if (!perms.canEscalate) throw new ApiError(400, "Tento úkol nelze eskalovat.", "bad_request");

  await db.task.update({ where: { id: taskId }, data: { needsDirectorAttention: true } });
  await db.comment.create({ data: { teamId: user.teamId, taskId, authorId: user.id, body: `🔺 Žádost o pomoc ředitele: ${note}` } });
  const directors = await directorIds(db, user.teamId);
  fx.add(() =>
    notify({
      teamId: user.teamId,
      userIds: directors,
      excludeUserId: user.id,
      type: "ESCALATED_TO_DIRECTOR",
      title: `${user.name} žádá o pomoc: ${task.title}`,
      body: note,
      link: `/tasks?task=${task.id}`,
      priority: task.priority,
      taskId: task.id,
    }),
  );
  fx.add(() => publish({ type: "tasks.changed", teamId: user.teamId, taskIds: [task.id] }));
}

export async function directorIds(db: Db, teamId: string): Promise<string[]> {
  const rows = await db.user.findMany({ where: { teamId, role: "DIRECTOR", isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}
