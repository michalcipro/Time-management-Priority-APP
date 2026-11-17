import "server-only";
import type { NotificationDTO } from "@/lib/dto";
import type { Db } from "../db";
import type { SessionUser } from "../session";

export async function listNotifications(db: Db, user: SessionUser, opts: { unreadOnly?: boolean; limit?: number } = {}) {
  const items = await db.notification.findMany({
    where: { userId: user.id, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 40,
  });
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  return {
    unread,
    items: items.map(
      (n): NotificationDTO => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        priority: n.priority,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      }),
    ),
  };
}

export async function markNotificationsRead(db: Db, user: SessionUser, ids: string[] | "all") {
  const result = await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
