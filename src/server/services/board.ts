import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import { calendarDaysBetween } from "@/lib/format";
import type { BriefingStats } from "@/lib/ai-types";
import type { BoardData, BoardItem } from "@/lib/dto";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { messageScope, taskScope } from "./scopes";
import { taskListInclude, toUserRef, userRefSelect } from "./tasks";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Unified "work items" for the Priority Board: open tasks plus open inbound
 * messages that are not already represented by an open task.
 */
export async function getBoard(db: Db, user: SessionUser, opts: { mineOnly?: boolean } = {}): Promise<BoardData> {
  const now = new Date();
  const seesAll = can(user.role, "tasks:read:all") && !opts.mineOnly;

  const taskWhere: Prisma.TaskWhereInput[] = [taskScope(user), { status: { not: "DONE" } }];
  if (!seesAll) taskWhere.push({ assignees: { some: { userId: user.id } } });
  const messageWhere: Prisma.MessageWhereInput[] = [
    messageScope(user),
    { direction: "INBOUND", status: { in: ["UNREAD", "WAITING_REPLY"] } },
    { tasks: { none: { status: { not: "DONE" } } } },
  ];
  if (!seesAll) messageWhere.push({ OR: [{ ownerId: user.id }, { assigneeId: user.id }] });

  // Sequential on purpose: queries inside one transaction share a single connection.
  const tasks = await db.task.findMany({
      where: { AND: taskWhere },
      include: { ...taskListInclude, sourceMessage: { select: { id: true, channel: true, senderName: true, subject: true, aiSummary: true } } },
      orderBy: [{ priority: "asc" }, { deadline: { sort: "asc", nulls: "last" } }],
      take: 250,
    });
  const messages = await db.message.findMany({
      where: { AND: messageWhere },
      include: { owner: { select: userRefSelect }, assignee: { select: userRefSelect } },
      orderBy: [{ priority: "asc" }, { receivedAt: "desc" }],
      take: 250,
    });

  const items: BoardItem[] = [
    ...tasks.map(
      (t): BoardItem => ({
        kind: "task",
        id: t.id,
        title: t.title,
        summary: t.sourceMessage?.aiSummary ?? t.description,
        aiGenerated: Boolean(t.sourceMessage?.aiSummary),
        priority: t.priority,
        basePriority: t.basePriority,
        escalated: t.priority < t.basePriority,
        deadline: iso(t.deadline),
        createdAt: t.createdAt.toISOString(),
        status: t.status,
        channel: t.sourceMessage?.channel ?? null,
        people: t.assignees.map((a) => toUserRef(a.user)),
        clientName: t.clientName,
        needsDirectorAttention: t.needsDirectorAttention,
      }),
    ),
    ...messages.map(
      (m): BoardItem => ({
        kind: "message",
        id: m.id,
        title: m.subject ? `${m.senderName ?? m.senderContact} – ${m.subject}` : `${m.senderName ?? m.senderContact}`,
        summary: m.aiSummary ?? m.preview,
        aiGenerated: Boolean(m.aiSummary),
        priority: m.priority,
        basePriority: m.basePriority,
        escalated: m.priority < m.basePriority,
        deadline: iso(m.aiDeadline),
        createdAt: m.receivedAt.toISOString(),
        status: m.status,
        channel: m.channel,
        people: [m.assignee ?? m.owner].filter(Boolean).map((u) => toUserRef(u!)),
        clientName: m.senderName,
        needsDirectorAttention: false,
      }),
    ),
  ];

  items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
    const dbb = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
    if (da !== dbb) return da - dbb;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as BoardData["counts"];
  for (const i of items) counts[i.priority as 1 | 2 | 3 | 4 | 5] += 1;

  const stats: BriefingStats = {
    critical: counts[1],
    escalated: items.filter((i) => i.escalated).length,
    waitingMessages: messages.length,
    overdue: tasks.filter((t) => t.deadline && t.deadline < now).length,
    dueToday: tasks.filter((t) => t.deadline && t.deadline >= now && calendarDaysBetween(now, t.deadline) === 0).length,
    openTasks: tasks.length,
  };

  return { items, counts, stats };
}
