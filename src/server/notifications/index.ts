import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import { parseNotificationPrefs, type NotificationPrefs } from "@/lib/settings";
import { localMinutes, fromLocalDateTime, dayKey, addDays } from "@/lib/format";
import { withSystem } from "../db";
import { publish } from "../realtime";
import { enqueue } from "../jobs/queue";
import { renderEmail, sendEmail } from "./email";
import { sendPush } from "./push";

export interface NotifyInput {
  teamId: string;
  userIds: (string | null | undefined)[];
  /** Typically the actor – people are not notified about their own actions. */
  excludeUserId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  priority?: number | null;
  taskId?: string | null;
  messageId?: string | null;
}

const EVENT_PREF: Partial<Record<NotificationType, keyof NotificationPrefs["events"]>> = {
  TASK_ASSIGNED: "taskAssigned",
  MESSAGE_ASSIGNED: "taskAssigned",
  TASK_COMMENT: "comments",
  TASK_STATUS: "statusChanges",
  PRIORITY_ESCALATED: "escalations",
  ESCALATED_TO_DIRECTOR: "escalations",
  DEADLINE_SOON: "deadlines",
  TASK_OVERDUE: "deadlines",
  MESSAGE_WAITING: "waitingMessages",
  MESSAGE_URGENT: "escalations",
};

/** Types that are delivered by e-mail/push regardless of the priority threshold. */
const ALWAYS_DELIVER: NotificationType[] = ["TASK_ASSIGNED", "MESSAGE_ASSIGNED", "ESCALATED_TO_DIRECTOR"];

/**
 * Create in-app notifications, push them over the realtime channel and schedule
 * e-mail / web-push delivery according to each recipient's preferences.
 */
export async function notify(input: NotifyInput): Promise<string[]> {
  const ids = [...new Set(input.userIds.filter((id): id is string => Boolean(id)))].filter((id) => id !== input.excludeUserId);
  if (ids.length === 0) return [];

  const created = await withSystem(async (db) => {
    const users = await db.user.findMany({
      where: { id: { in: ids }, teamId: input.teamId, isActive: true },
      select: { id: true, notificationPrefs: true },
    });
    const out: { id: string; userId: string }[] = [];
    for (const u of users) {
      const prefs = parseNotificationPrefs(u.notificationPrefs);
      const eventKey = EVENT_PREF[input.type];
      if (eventKey && !prefs.events[eventKey]) continue;
      const n = await db.notification.create({
        data: {
          teamId: input.teamId,
          userId: u.id,
          type: input.type,
          title: input.title.slice(0, 300),
          body: input.body?.slice(0, 1000) ?? null,
          link: input.link ?? null,
          priority: input.priority ?? null,
          taskId: input.taskId ?? null,
          messageId: input.messageId ?? null,
        },
        select: { id: true, userId: true },
      });
      out.push(n);
    }
    return out;
  });

  if (created.length > 0) {
    await publish({
      type: "notification",
      teamId: input.teamId,
      userIds: created.map((c) => c.userId),
      title: input.title,
      body: input.body,
      link: input.link,
      priority: input.priority,
    });
    for (const n of created) await enqueue("notification.deliver", { notificationId: n.id });
  }
  return created.map((c) => c.id);
}

export function inQuietHours(now: Date, prefs: NotificationPrefs): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const start = toMin(prefs.quietStart);
  const end = toMin(prefs.quietEnd);
  const m = localMinutes(now);
  if (start === end) return false;
  return start > end ? m >= start || m < end : m >= start && m < end;
}

/** Next moment (UTC) when the recipient's quiet hours end. */
export function quietHoursEnd(now: Date, prefs: NotificationPrefs): Date {
  const today = fromLocalDateTime(`${dayKey(now)}T${prefs.quietEnd}`)!;
  if (today.getTime() > now.getTime()) return today;
  return fromLocalDateTime(`${dayKey(addDays(now, 1))}T${prefs.quietEnd}`)!;
}

/** Deliver one notification by e-mail and/or web push (idempotent). */
export async function deliverNotification(notificationId: string): Promise<{ email: boolean; push: boolean; deferred?: boolean }> {
  const n = await withSystem((db) =>
    db.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true, name: true, isActive: true, notificationPrefs: true } } },
    }),
  );
  if (!n || !n.user.isActive) return { email: false, push: false };
  const prefs = parseNotificationPrefs(n.user.notificationPrefs);
  const now = new Date();

  const level = n.priority ?? 3;
  const always = ALWAYS_DELIVER.includes(n.type);
  const wantEmail =
    prefs.email && !n.emailedAt && (always || level <= prefs.emailMinPriority || (n.type === "BRIEFING_READY" && prefs.dailyBriefingEmail));
  const wantPush = prefs.push && !n.pushedAt && (always || level <= prefs.pushMinPriority || n.type === "BRIEFING_READY");
  if (!wantEmail && !wantPush) return { email: false, push: false };

  if (inQuietHours(now, prefs)) {
    const until = quietHoursEnd(now, prefs);
    await withSystem((db) => db.notification.update({ where: { id: n.id }, data: { deferredUntil: until } }));
    return { email: false, push: false, deferred: true };
  }

  let emailed = false;
  let pushed = false;
  if (wantEmail) {
    // Claim the e-mail atomically so concurrent workers never send twice.
    const claimed = await withSystem((db) =>
      db.notification.updateMany({ where: { id: n.id, emailedAt: null }, data: { emailedAt: now } }),
    );
    if (claimed.count === 1) {
      try {
        emailed = await sendEmail(
          n.user.email,
          (n.priority ? `[P${n.priority}] ` : "") + n.title,
          renderEmail({ title: n.title, body: n.body, link: n.link, priority: n.priority }),
          `${n.title}\n\n${n.body ?? ""}`,
        );
      } catch (err) {
        await withSystem((db) => db.notification.update({ where: { id: n.id }, data: { emailedAt: null } }));
        throw err;
      }
    }
  }
  if (wantPush) {
    const claimed = await withSystem((db) =>
      db.notification.updateMany({ where: { id: n.id, pushedAt: null }, data: { pushedAt: now } }),
    );
    if (claimed.count === 1) pushed = (await sendPush(n.userId, { title: n.title, body: n.body, link: n.link, tag: n.type })) > 0;
  }
  if (n.deferredUntil) await withSystem((db) => db.notification.update({ where: { id: n.id }, data: { deferredUntil: null } }));
  return { email: emailed, push: pushed };
}

/** Deliver notifications that were postponed by quiet hours. */
export async function flushDeferredNotifications(): Promise<number> {
  const due = await withSystem((db) =>
    db.notification.findMany({ where: { deferredUntil: { lte: new Date() } }, select: { id: true }, take: 200 }),
  );
  for (const n of due) await deliverNotification(n.id);
  return due.length;
}
