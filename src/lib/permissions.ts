/**
 * Role-based access control – the permission matrix (isomorphic).
 *
 * Enforced in three layers:
 *  1. Database – PostgreSQL Row-Level Security (prisma/migrations/*_rls_policies)
 *  2. API      – services check `can()` and apply query scopes (src/server/scopes.ts)
 *  3. UI       – navigation and actions are hidden when `can()` is false
 */
import type { Role } from "@/generated/prisma/enums";

export type Permission =
  | "messages:read:all"
  | "messages:assign"
  | "messages:reply"
  | "tasks:read:all"
  | "tasks:create"
  | "tasks:assign"
  | "tasks:update:any"
  | "tasks:delete"
  | "priority:override"
  | "team:view"
  | "board:view"
  | "rules:manage"
  | "ai:configure"
  | "ai:use"
  | "users:manage"
  | "integrations:manage:team"
  | "integrations:connect:own"
  | "audit:view"
  | "privacy:erase-contact";

const DIRECTOR: Permission[] = [
  "messages:read:all",
  "messages:assign",
  "messages:reply",
  "tasks:read:all",
  "tasks:create",
  "tasks:assign",
  "tasks:update:any",
  "tasks:delete",
  "priority:override",
  "team:view",
  "board:view",
  "rules:manage",
  "ai:configure",
  "ai:use",
  "users:manage",
  "integrations:manage:team",
  "integrations:connect:own",
  "audit:view",
  "privacy:erase-contact",
];

const ADVISOR: Permission[] = [
  "messages:reply",
  "tasks:create",
  "priority:override",
  "ai:use",
  "integrations:connect:own",
];

const ADMIN: Permission[] = ["users:manage", "integrations:manage:team", "integrations:connect:own", "audit:view", "ai:configure"];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  DIRECTOR: new Set(DIRECTOR),
  ADVISOR: new Set(ADVISOR),
  ADMIN: new Set(ADMIN),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return [...MATRIX[role]];
}

/** Landing page per role. */
export function homePathFor(role: Role): string {
  if (role === "DIRECTOR") return "/board";
  if (role === "ADMIN") return "/settings/users";
  return "/my-tasks";
}
