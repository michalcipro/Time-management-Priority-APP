import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

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
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
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

/** Run `fn` with the database scoped to `actor` (RLS enforced). */
export function withActor<T>(actor: Pick<Actor, "id" | "teamId" | "role">, fn: (db: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id', ${actor.id}, true),
      set_config('app.team_id', ${actor.teamId}, true),
      set_config('app.role', ${actor.role}, true)`;
    return fn(tx);
  }, TX_OPTIONS);
}

/** Run `fn` as the trusted system (RLS bypassed). Use only for jobs and webhooks. */
export function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
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
