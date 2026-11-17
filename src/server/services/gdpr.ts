import "server-only";
import { can } from "@/lib/permissions";
import { normalizeForSearch } from "@/lib/search-text";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { badRequest, forbidden } from "../errors";

/** Art. 15/20 GDPR – machine-readable export of the user's personal data. */
export async function exportUserData(db: Db, user: SessionUser) {
  // Sequential: all queries share the transaction's single connection.
  const profile = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, name: true, email: true, role: true, title: true, phone: true, capacity: true, notificationPrefs: true, lastLoginAt: true, createdAt: true },
  });
  const assigned = await db.task.findMany({
    where: { assignees: { some: { userId: user.id } } },
    select: { id: true, title: true, description: true, status: true, priority: true, deadline: true, createdAt: true },
  });
  const created = await db.task.findMany({ where: { creatorId: user.id }, select: { id: true, title: true, status: true, priority: true, deadline: true, createdAt: true } });
  const comments = await db.comment.findMany({ where: { authorId: user.id }, select: { id: true, taskId: true, body: true, createdAt: true } });
  const notifications = await db.notification.findMany({ where: { userId: user.id }, select: { id: true, type: true, title: true, body: true, readAt: true, createdAt: true } });
  const messages = await db.message.findMany({
    where: { OR: [{ ownerId: user.id }, { assigneeId: user.id }] },
    select: { id: true, channel: true, direction: true, senderName: true, senderContact: true, subject: true, content: true, receivedAt: true, status: true },
  });
  const assistant = await db.assistantMessage.findMany({ where: { userId: user.id }, select: { role: true, content: true, createdAt: true } });
  const events = await db.calendarEvent.findMany({ where: { userId: user.id }, select: { title: true, startAt: true, endAt: true, location: true, description: true } });
  const briefings = await db.briefing.findMany({ where: { userId: user.id }, select: { day: true, content: true } });
  const audit = await db.auditLog.findMany({ where: { actorId: user.id }, select: { action: true, entityType: true, entityId: true, createdAt: true, ip: true } });
  return {
    exportedAt: new Date().toISOString(),
    format: "priority-agent/gdpr-export@1",
    profile,
    tasks: { assigned, created },
    comments,
    notifications,
    messages,
    assistantConversation: assistant,
    calendarEvents: events,
    briefings,
    auditTrail: audit,
  };
}

/**
 * Art. 17 GDPR – erase the user's account. Personal data is removed or anonymised;
 * business records (tasks, client communication) stay with the firm but are no
 * longer linked to identifiable personal data of the employee.
 */
export async function eraseOwnAccount(db: Db, user: SessionUser) {
  if (user.role === "DIRECTOR") {
    const directors = await db.user.count({ where: { teamId: user.teamId, role: "DIRECTOR", isActive: true } });
    if (directors <= 1) throw badRequest("Jste jediný ředitel týmu – nejprve jmenujte jiného ředitele.");
  }
  const successor = await db.user.findFirst({
    where: { teamId: user.teamId, role: "DIRECTOR", isActive: true, id: { not: user.id } },
    select: { id: true },
  });
  if (successor) await db.task.updateMany({ where: { creatorId: user.id }, data: { creatorId: successor.id } });
  await db.notification.deleteMany({ where: { userId: user.id } });
  await db.pushSubscription.deleteMany({ where: { userId: user.id } });
  await db.assistantMessage.deleteMany({ where: { userId: user.id } });
  await db.briefing.deleteMany({ where: { userId: user.id } });
  await db.calendarEvent.deleteMany({ where: { userId: user.id } });
  await db.integration.deleteMany({ where: { userId: user.id } });
  await db.user.update({
    where: { id: user.id },
    data: {
      name: "Smazaný uživatel",
      email: `deleted-${user.id}@invalid.local`,
      passwordHash: null,
      phone: null,
      title: null,
      isActive: false,
      icsToken: null,
      notificationPrefs: {},
    },
  });
}

/** Right to be forgotten for a CLIENT: remove all communication from a contact. */
export async function eraseContactData(db: Db, user: SessionUser, contact: string, confirm: boolean) {
  if (!can(user.role, "privacy:erase-contact")) throw forbidden();
  const needle = normalizeForSearch(contact).replace(/\s+/g, "");
  if (needle.length < 5) throw badRequest("Zadejte celý e-mail nebo telefonní číslo.");
  const messages = await db.message.findMany({
    where: { teamId: user.teamId, OR: [{ senderContact: { equals: contact.trim(), mode: "insensitive" } }, { recipient: { contains: contact.trim(), mode: "insensitive" } }] },
    select: { id: true, senderName: true },
  });
  const ids = messages.map((m) => m.id);
  const tasks = await db.task.count({ where: { sourceMessageId: { in: ids } } });
  if (!confirm) return { messages: ids.length, linkedTasks: tasks, erased: false };

  await db.task.updateMany({
    where: { sourceMessageId: { in: ids } },
    data: { clientName: null, description: "[Údaje klienta odstraněny na žádost – GDPR]" },
  });
  await db.message.deleteMany({ where: { id: { in: ids } } });
  return { messages: ids.length, linkedTasks: tasks, erased: true };
}
