import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/permissions";
import type { SessionUser } from "../session";

/**
 * Prisma `where` scopes mirroring the PostgreSQL RLS policies. Applying them in
 * the service layer keeps the API correct even when the app connects with a role
 * that bypasses RLS (e.g. the table owner).
 */
type Scoped = Pick<SessionUser, "id" | "teamId" | "role">;

const NOTHING = "__no_access__";

export function messageScope(user: Scoped): Prisma.MessageWhereInput {
  if (can(user.role, "messages:read:all")) return { teamId: user.teamId };
  if (user.role === "ADMIN") return { id: NOTHING };
  return {
    teamId: user.teamId,
    OR: [
      { ownerId: user.id },
      { assigneeId: user.id },
      { tasks: { some: { assignees: { some: { userId: user.id } } } } },
    ],
  };
}

export function taskScope(user: Scoped): Prisma.TaskWhereInput {
  if (can(user.role, "tasks:read:all")) return { teamId: user.teamId };
  if (user.role === "ADMIN") return { id: NOTHING };
  return {
    teamId: user.teamId,
    OR: [{ creatorId: user.id }, { assignees: { some: { userId: user.id } } }],
  };
}

export function calendarScope(user: Scoped): Prisma.CalendarEventWhereInput {
  if (user.role === "DIRECTOR") return { teamId: user.teamId };
  return { teamId: user.teamId, userId: user.id };
}
