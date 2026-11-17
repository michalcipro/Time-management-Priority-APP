import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import { evaluateRlsCheck, resolveDatabaseUrls, RLS_CHECK_SQL, type RlsCheckRow } from "@/lib/db-config";

/**
 * Database access.
 *
 * Every query that touches business data runs inside `withActor` (a signed-in user)
 * or `withSystem` (trusted background work). Both open a short interactive
 * transaction and set transaction-local settings that PostgreSQL Row-Level
 * Security policies read (see prisma/migrations/*_rls_policies). Keep network
 * calls (AI, provider APIs) OUTSIDE these callbacks.
 */

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient(): PrismaClient {
  // DATABASE_URL, or DATABASE_URL with the runtime role's credentials when APP_DB_PASSWORD is set.
  const { runtimeUrl } = resolveDatabaseUrls(process.env);
  if (!runtimeUrl) throw new Error("DATABASE_URL is not set");
  // Serverless instances each hold their own pool; keep it small behind the Neon pooler.
  const max = Number(process.env.DATABASE_POOL_SIZE ?? (process.env.VERCEL ? 5 : 10));
  const adapter = new PrismaPg({ connectionString: runtimeUrl, max });
  return new PrismaClient({
    adapter,
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

function getClient(): PrismaClient {
  if (!globalForPrisma.__prisma) globalForPrisma.__prisma = createClient();
  return globalForPrisma.__prisma;
}

/**
 * Lazily created client: importing this module never opens a connection (keeps
 * builds, unit tests and cold starts cheap).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = Prisma.TransactionClient;

export interface Actor {
  id: string;
  teamId: string;
  role: Role;
  name: string;
  email: string;
}

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/**
 * The RBAC model relies on PostgreSQL enforcing Row-Level Security for the runtime
 * role. Verify that once per process before the first business query: in
 * production a misconfigured connection (superuser, BYPASSRLS or table owner)
 * fails closed unless ALLOW_RLS_BYPASS=true; in development it only warns.
 */
const rlsState = globalThis as unknown as { __rlsVerified?: boolean; __rlsCheck?: Promise<void> | null };

async function verifyRls(): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<RlsCheckRow[]>(RLS_CHECK_SQL);
  const result = evaluateRlsCheck(rows[0]);
  if (result.ok) {
    rlsState.__rlsVerified = true;
    return;
  }
  const message =
    `Row-Level Security is not enforced for database role "${result.user}": ${result.problems.join("; ")}. ` +
    "Point DATABASE_URL at the runtime role or set APP_DB_PASSWORD (see docs/NASAZENI-VERCEL-NEON.md).";
  if (process.env.ALLOW_RLS_BYPASS === "true") {
    console.warn(`[db] ${message} Continuing because ALLOW_RLS_BYPASS=true.`);
    rlsState.__rlsVerified = true;
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error(message);
  console.warn(`[db] ${message}`);
  rlsState.__rlsVerified = true;
}

function ensureRlsEnforced(): Promise<void> {
  if (rlsState.__rlsVerified) return Promise.resolve();
  // A failed check is not cached: the next request checks again.
  rlsState.__rlsCheck ??= verifyRls().finally(() => {
    rlsState.__rlsCheck = null;
  });
  return rlsState.__rlsCheck;
}

/** Run `fn` with the database scoped to `actor` (RLS enforced). */
export async function withActor<T>(actor: Pick<Actor, "id" | "teamId" | "role">, fn: (db: Db) => Promise<T>): Promise<T> {
  await ensureRlsEnforced();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id', ${actor.id}, true),
      set_config('app.team_id', ${actor.teamId}, true),
      set_config('app.role', ${actor.role}, true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

/** Run `fn` as the trusted system (RLS bypassed). Use only for jobs and webhooks. */
export async function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  await ensureRlsEnforced();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

/** Side effects (notifications, realtime events, jobs) to run after a transaction commits. */
export interface Effects {
  add(effect: () => Promise<unknown> | unknown): void;
}

async function runEffects(effects: (() => Promise<unknown> | unknown)[]) {
  for (const effect of effects) {
    try {
      await effect();
    } catch (err) {
      console.error("[effects] post-commit effect failed", err);
    }
  }
}

/** `withActor` + post-commit side effects. */
export async function withActorEffects<T>(
  actor: Pick<Actor, "id" | "teamId" | "role">,
  fn: (db: Db, fx: Effects) => Promise<T>,
): Promise<T> {
  const queue: (() => Promise<unknown> | unknown)[] = [];
  const result = await withActor(actor, (db) => fn(db, { add: (e) => queue.push(e) }));
  await runEffects(queue);
  return result;
}

/** `withSystem` + post-commit side effects. */
export async function withSystemEffects<T>(fn: (db: Db, fx: Effects) => Promise<T>): Promise<T> {
  const queue: (() => Promise<unknown> | unknown)[] = [];
  const result = await withSystem((db) => fn(db, { add: (e) => queue.push(e) }));
  await runEffects(queue);
  return result;
}
