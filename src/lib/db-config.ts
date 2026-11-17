/**
 * Database connection settings and the Row-Level Security self-check.
 *
 * Shared by the app (src/server/db.ts), the Prisma CLI config, the seed and the
 * deploy script. Pure and secret-free: everything comes from the `env` argument.
 *
 * Supported layouts
 * - Local / Docker: DATABASE_URL = runtime role `priority_app`, DIRECT_URL = owner.
 * - Vercel + Neon integration: DATABASE_URL = pooled owner URL and
 *   DATABASE_URL_UNPOOLED = direct owner URL. With APP_DB_PASSWORD set, the app
 *   connects through the same pooled host as the runtime role (APP_DB_USER,
 *   default `priority_app`), so PostgreSQL enforces Row-Level Security.
 */

export const DEFAULT_APP_DB_USER = "priority_app";

type Env = Record<string, string | undefined>;

function pick(env: Env, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export interface DatabaseUrls {
  /** Owner connection for migrations, seed and role setup (direct, unpooled when available). */
  directUrl?: string;
  /** Connection used by the running application. */
  runtimeUrl?: string;
  /** Runtime role name when the runtime URL was derived from APP_DB_PASSWORD. */
  runtimeUser?: string;
  /** True when runtimeUrl = DATABASE_URL with the runtime role's credentials. */
  derived: boolean;
}

/** Replace the user and password of a PostgreSQL connection string. */
export function withCredentials(url: string, user: string, password: string): string {
  const u = new URL(url);
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(password);
  return u.toString();
}

export function resolveDatabaseUrls(env: Env): DatabaseUrls {
  const pooled = pick(env, "DATABASE_URL", "POSTGRES_URL");
  const directUrl = pick(env, "DIRECT_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING") ?? pooled;
  const appPassword = pick(env, "APP_DB_PASSWORD");
  if (appPassword && pooled) {
    const runtimeUser = pick(env, "APP_DB_USER") ?? DEFAULT_APP_DB_USER;
    return { directUrl, runtimeUrl: withCredentials(pooled, runtimeUser, appPassword), runtimeUser, derived: true };
  }
  return { directUrl, runtimeUrl: pooled, derived: false };
}

/** "user@host/db" for logs – never includes the password. */
export function describeDatabaseUrl(url: string | undefined): string {
  if (!url) return "(not set)";
  try {
    const u = new URL(url);
    return `${decodeURIComponent(u.username) || "?"}@${u.host}${u.pathname}`;
  } catch {
    return "(invalid URL)";
  }
}

/**
 * One row describing whether PostgreSQL enforces Row-Level Security for the
 * connected role: superusers and BYPASSRLS roles skip RLS, and so do table owners
 * (including members of the owning role) unless FORCE ROW LEVEL SECURITY is set.
 */
export const RLS_CHECK_SQL = `
SELECT current_user::text AS "user",
       r.rolsuper AS "superuser",
       r.rolbypassrls AS "bypassRls",
       (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS "rlsTables",
       (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity
           AND pg_has_role(current_user, c.relowner, 'USAGE')) AS "ownedRlsTables"
FROM pg_roles r
WHERE r.rolname = current_user`;

export interface RlsCheckRow {
  user: string;
  superuser: boolean;
  bypassRls: boolean;
  rlsTables: number;
  ownedRlsTables: number;
}

export interface RlsCheckResult {
  ok: boolean;
  user: string;
  problems: string[];
}

export function evaluateRlsCheck(row: RlsCheckRow | undefined): RlsCheckResult {
  if (!row) return { ok: false, user: "?", problems: ["could not read the current database role"] };
  const problems: string[] = [];
  if (row.superuser) problems.push("the role is a superuser");
  if (row.bypassRls) problems.push("the role has the BYPASSRLS attribute");
  if (Number(row.ownedRlsTables) > 0) problems.push(`the role owns ${row.ownedRlsTables} RLS-protected tables (table owners bypass RLS)`);
  if (Number(row.rlsTables) === 0) problems.push("no tables with Row-Level Security were found (migrations not applied?)");
  return { ok: problems.length === 0, user: row.user, problems };
}
