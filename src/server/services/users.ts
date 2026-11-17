import "server-only";
import bcrypt from "bcryptjs";
import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { notificationPrefsSchema, parseNotificationPrefs, type NotificationPrefs } from "@/lib/settings";
import { colorFor } from "@/lib/utils";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import { randomToken } from "../crypto";

const adminSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  phone: true,
  capacity: true,
  isActive: true,
  avatarColor: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export async function listUsersAdmin(db: Db, actor: SessionUser) {
  if (!can(actor.role, "users:manage")) throw forbidden();
  const users = await db.user.findMany({ where: { teamId: actor.teamId }, select: adminSelect, orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }] });
  return users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }));
}

export async function createUser(
  db: Db,
  actor: SessionUser,
  input: { name: string; email: string; role: Role; title?: string | null; phone?: string | null; capacity: number; password: string },
) {
  if (!can(actor.role, "users:manage")) throw forbidden();
  if (input.role === "DIRECTOR" && actor.role !== "DIRECTOR") throw forbidden("Ředitele může vytvořit pouze ředitel.");
  const exists = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (exists) throw conflict("Uživatel s tímto e-mailem již existuje.");
  const director = await db.user.findFirst({ where: { teamId: actor.teamId, role: "DIRECTOR", isActive: true }, select: { id: true } });
  const user = await db.user.create({
    data: {
      teamId: actor.teamId,
      name: input.name,
      email: input.email,
      role: input.role,
      title: input.title || null,
      phone: input.phone || null,
      capacity: input.capacity,
      passwordHash: await bcrypt.hash(input.password, 12),
      avatarColor: colorFor(input.email),
      managerId: input.role === "ADVISOR" ? director?.id ?? null : null,
      icsToken: randomToken(18),
    },
    select: adminSelect,
  });
  return { ...user, lastLoginAt: null, createdAt: user.createdAt.toISOString() };
}

export async function updateUser(
  db: Db,
  actor: SessionUser,
  id: string,
  input: { name?: string; role?: Role; title?: string | null; phone?: string | null; capacity?: number; isActive?: boolean; password?: string },
) {
  if (!can(actor.role, "users:manage")) throw forbidden();
  const target = await db.user.findFirst({ where: { id, teamId: actor.teamId } });
  if (!target) throw notFound("Uživatel");
  if ((input.role === "DIRECTOR" || target.role === "DIRECTOR") && actor.role !== "DIRECTOR" && input.role !== undefined) {
    throw forbidden("Roli ředitele může měnit pouze ředitel.");
  }
  if (id === actor.id && (input.isActive === false || (input.role && input.role !== actor.role))) {
    throw badRequest("Nemůžete deaktivovat ani změnit roli sami sobě.");
  }
  const removesDirector = target.role === "DIRECTOR" && ((input.role && input.role !== "DIRECTOR") || input.isActive === false);
  if (removesDirector) {
    const directors = await db.user.count({ where: { teamId: actor.teamId, role: "DIRECTOR", isActive: true } });
    if (directors <= 1) throw badRequest("Tým musí mít alespoň jednoho aktivního ředitele.");
  }
  const user = await db.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      title: input.title === undefined ? undefined : input.title || null,
      phone: input.phone === undefined ? undefined : input.phone || null,
      capacity: input.capacity,
      isActive: input.isActive,
      ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {}),
    },
    select: adminSelect,
  });
  return { ...user, lastLoginAt: user.lastLoginAt?.toISOString() ?? null, createdAt: user.createdAt.toISOString() };
}

export async function getProfile(db: Db, user: SessionUser) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, name: true, email: true, role: true, title: true, phone: true, capacity: true, avatarColor: true, notificationPrefs: true, icsToken: true },
  });
  return { ...u, notificationPrefs: parseNotificationPrefs(u.notificationPrefs) };
}

export async function updateProfile(
  db: Db,
  user: SessionUser,
  input: { name?: string; title?: string | null; phone?: string | null; currentPassword?: string; newPassword?: string },
) {
  let passwordHash: string | undefined;
  if (input.newPassword) {
    const current = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!current.passwordHash || !(await bcrypt.compare(input.currentPassword ?? "", current.passwordHash))) {
      throw badRequest("Současné heslo není správné.");
    }
    passwordHash = await bcrypt.hash(input.newPassword, 12);
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      title: input.title === undefined ? undefined : input.title || null,
      phone: input.phone === undefined ? undefined : input.phone || null,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });
  return getProfile(db, user);
}

export async function updateNotificationPrefs(db: Db, user: SessionUser, raw: unknown): Promise<NotificationPrefs> {
  const current = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
  const merged = { ...parseNotificationPrefs(current.notificationPrefs), ...(raw as object) };
  const prefs = notificationPrefsSchema.parse(merged);
  await db.user.update({ where: { id: user.id }, data: { notificationPrefs: prefs } });
  return prefs;
}

export async function regenerateIcsToken(db: Db, user: SessionUser): Promise<string> {
  const token = randomToken(18);
  await db.user.update({ where: { id: user.id }, data: { icsToken: token } });
  return token;
}
