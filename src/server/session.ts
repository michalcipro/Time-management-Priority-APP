import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./db";
import { can, homePathFor, type Permission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  teamId: string;
  title: string | null;
  avatarColor: string | null;
  capacity: number;
  managerId: string | null;
}

/**
 * The signed-in user, re-validated against the database on every request
 * (deactivated users and role changes take effect immediately).
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      teamId: true,
      title: true,
      avatarColor: true,
      capacity: true,
      managerId: true,
      isActive: true,
    },
  });
  if (!user || !user.isActive) return null;
  const { isActive: _isActive, ...rest } = user;
  return rest;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Page guard: redirects users without the permission to their home page. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(homePathFor(user.role));
  return user;
}
