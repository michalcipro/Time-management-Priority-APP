import "server-only";
import { computeMessagePriority, computeTaskPriority, priorityMeta, waitingDays, pluralDays } from "@/lib/priority";
import { rulesFromSettings, parseTeamSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { withSystem } from "../db";
import { notify } from "../notifications";
import { publish } from "../realtime";

/**
 * Background priority recalculation (runs every 15 minutes).
 *
 * - Tasks: effective priority follows the time left until the deadline (P5 → P1)
 *   and "remind me" moments; never de-escalates automatically.
 * - Messages: unanswered inbound messages gain urgency while they wait and when an
 *   extracted deadline approaches → proactive alerts ("čeká 4 dny, priorita zvýšena").
 * - Overdue tasks notify assignees and the creator once.
 *
 * Updates are conditional on the previously read priority (optimistic concurrency),
 * so concurrent runs never double-escalate or duplicate history entries.
 */
export async function recalculatePriorities(now = new Date()) {
  const stats = { tasksEscalated: 0, messagesEscalated: 0, overdueNotified: 0 };
  const teams = await withSystem((db) => db.team.findMany({ select: { id: true, settings: true } }));

  for (const team of teams) {
    const rules = rulesFromSettings(parseTeamSettings(team.settings));
    const directors = await withSystem((db) =>
      db.user.findMany({ where: { teamId: team.id, role: "DIRECTOR", isActive: true }, select: { id: true } }),
    ).then((rows) => rows.map((r) => r.id));
    const changedTasks: string[] = [];
    const changedMessages: string[] = [];

    // ── Tasks ──
    const tasks = await withSystem((db) =>
      db.task.findMany({
        where: { teamId: team.id, status: { not: "DONE" }, autoEscalate: true, OR: [{ deadline: { not: null } }, { remindAt: { not: null } }] },
        select: {
          id: true,
          title: true,
          priority: true,
          basePriority: true,
          deadline: true,
          remindAt: true,
          autoEscalate: true,
          status: true,
          creatorId: true,
          assignees: { select: { userId: true } },
        },
      }),
    );
    for (const t of tasks) {
      const target = computeTaskPriority(t, now, rules);
      if (target.priority >= t.priority || !target.reason) continue;
      const applied = await withSystem(async (db) => {
        const res = await db.task.updateMany({ where: { id: t.id, priority: t.priority }, data: { priority: target.priority, lastEscalatedAt: now } });
        if (res.count !== 1) return false;
        await db.priorityHistory.create({
          data: { teamId: team.id, taskId: t.id, oldPriority: t.priority, newPriority: target.priority, reason: target.reason!, source: "AUTO" },
        });
        return true;
      });
      if (!applied) continue;
      stats.tasksEscalated++;
      changedTasks.push(t.id);
      if (target.priority <= rules.notifyAtOrAbove) {
        await notify({
          teamId: team.id,
          userIds: [...t.assignees.map((a) => a.userId), t.creatorId],
          type: "PRIORITY_ESCALATED",
          title: `${t.title}: ${priorityMeta(t.priority).code} → ${priorityMeta(target.priority).code}`,
          body: `${target.reason}.${t.deadline ? ` Termín: ${formatDateTime(t.deadline)}.` : ""}`,
          link: `/tasks?task=${t.id}`,
          priority: target.priority,
          taskId: t.id,
        });
      }
    }

    // ── Overdue tasks (notify once) ──
    const overdue = await withSystem((db) =>
      db.task.findMany({
        where: { teamId: team.id, status: { not: "DONE" }, deadline: { lt: now }, overdueNotifiedAt: null },
        select: { id: true, title: true, deadline: true, creatorId: true, priority: true, assignees: { select: { userId: true, user: { select: { name: true } } } } },
      }),
    );
    for (const t of overdue) {
      const claimed = await withSystem((db) => db.task.updateMany({ where: { id: t.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } }));
      if (claimed.count !== 1) continue;
      stats.overdueNotified++;
      changedTasks.push(t.id);
      await notify({
        teamId: team.id,
        userIds: [...t.assignees.map((a) => a.userId), t.creatorId, ...directors],
        type: "TASK_OVERDUE",
        title: `Úkol po termínu: ${t.title}`,
        body: `Termín vypršel ${formatDateTime(t.deadline!)}. Řeší: ${t.assignees.map((a) => a.user.name).join(", ") || "nikdo"}.`,
        link: `/tasks?task=${t.id}`,
        priority: 1,
        taskId: t.id,
      });
    }

    // ── Messages waiting for a reply ──
    const messages = await withSystem((db) =>
      db.message.findMany({
        where: { teamId: team.id, direction: "INBOUND", status: { in: ["UNREAD", "WAITING_REPLY"] }, autoEscalate: true, priority: { gt: 1 } },
        select: {
          id: true,
          senderName: true,
          senderContact: true,
          priority: true,
          basePriority: true,
          receivedAt: true,
          repliedAt: true,
          status: true,
          autoEscalate: true,
          aiDeadline: true,
          direction: true,
          ownerId: true,
          assigneeId: true,
          aiSummary: true,
        },
      }),
    );
    for (const m of messages) {
      const target = computeMessagePriority({ ...m, receivedAt: m.repliedAt ?? m.receivedAt }, now, rules);
      if (target.priority >= m.priority || !target.reason) continue;
      const applied = await withSystem(async (db) => {
        const res = await db.message.updateMany({ where: { id: m.id, priority: m.priority }, data: { priority: target.priority, lastEscalatedAt: now } });
        if (res.count !== 1) return false;
        await db.priorityHistory.create({
          data: { teamId: team.id, messageId: m.id, oldPriority: m.priority, newPriority: target.priority, reason: target.reason!, source: "AUTO" },
        });
        return true;
      });
      if (!applied) continue;
      stats.messagesEscalated++;
      changedMessages.push(m.id);
      const days = waitingDays(m.repliedAt ?? m.receivedAt, now);
      const who = m.senderName ?? m.senderContact;
      await notify({
        teamId: team.id,
        userIds: [m.assigneeId ?? m.ownerId, ...(target.priority <= 2 ? directors : [])],
        type: "MESSAGE_WAITING",
        title:
          days > 0
            ? `Zpráva od ${who} čeká ${days} ${pluralDays(days)} – priorita zvýšena na ${priorityMeta(target.priority).code}`
            : `Zpráva od ${who}: priorita zvýšena na ${priorityMeta(target.priority).code}`,
        body: m.aiSummary ?? target.reason,
        link: `/inbox?message=${m.id}`,
        priority: target.priority,
        messageId: m.id,
      });
    }

    if (changedTasks.length) await publish({ type: "tasks.changed", teamId: team.id, taskIds: changedTasks });
    if (changedMessages.length) await publish({ type: "messages.changed", teamId: team.id, messageIds: changedMessages });
  }
  return stats;
}

/**
 * Re-apply (possibly changed) prioritisation rules to all open items of a team.
 * Unlike the scheduled run this may also LOWER priorities – it is an explicit
 * decision by the director – and every change is logged.
 */
export async function reapplyRules(teamId: string, now = new Date()): Promise<{ tasks: number; messages: number }> {
  const result = { tasks: 0, messages: 0 };
  const team = await withSystem((db) => db.team.findUnique({ where: { id: teamId }, select: { settings: true } }));
  const rules = rulesFromSettings(parseTeamSettings(team?.settings));

  await withSystem(async (db) => {
    const tasks = await db.task.findMany({
      where: { teamId, status: { not: "DONE" }, autoEscalate: true },
      select: { id: true, priority: true, basePriority: true, deadline: true, remindAt: true, autoEscalate: true, status: true },
    });
    for (const t of tasks) {
      const target = computeTaskPriority(t, now, rules);
      if (target.priority === t.priority) continue;
      await db.task.update({ where: { id: t.id }, data: { priority: target.priority } });
      await db.priorityHistory.create({
        data: { teamId, taskId: t.id, oldPriority: t.priority, newPriority: target.priority, reason: "Změna pravidel prioritizace", source: "SYSTEM" },
      });
      result.tasks++;
    }
    const messages = await db.message.findMany({
      where: { teamId, direction: "INBOUND", status: { in: ["UNREAD", "WAITING_REPLY"] }, autoEscalate: true },
      select: { id: true, priority: true, basePriority: true, receivedAt: true, repliedAt: true, status: true, autoEscalate: true, aiDeadline: true, direction: true },
    });
    for (const m of messages) {
      const target = computeMessagePriority({ ...m, receivedAt: m.repliedAt ?? m.receivedAt }, now, rules);
      if (target.priority === m.priority) continue;
      await db.message.update({ where: { id: m.id }, data: { priority: target.priority } });
      await db.priorityHistory.create({
        data: { teamId, messageId: m.id, oldPriority: m.priority, newPriority: target.priority, reason: "Změna pravidel prioritizace", source: "SYSTEM" },
      });
      result.messages++;
    }
  });

  await publish({ type: "tasks.changed", teamId, taskIds: [] });
  await publish({ type: "messages.changed", teamId, messageIds: [] });
  return result;
}
