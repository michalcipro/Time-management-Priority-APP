/**
 * Database setup for deployments (Vercel + Neon), run before `next build`:
 *
 *   npm run vercel-build          # this script, then `npm run build`
 *   npx tsx scripts/vercel-build.ts   # database part only
 *
 * 1. `prisma migrate deploy` with the owner's direct connection
 *    (DIRECT_URL, DATABASE_URL_UNPOOLED or POSTGRES_URL_NON_POOLING).
 * 2. With APP_DB_PASSWORD: create/update the runtime role (APP_DB_USER, default
 *    `priority_app`) and grant it table access. The app then connects as that
 *    role, so PostgreSQL enforces Row-Level Security.
 * 3. With SEED_DEMO_DATA=true: load the demo data, but only into an empty database.
 * 4. Verify that the runtime connection is subject to Row-Level Security.
 *
 * DB_SETUP=never skips everything; preview deployments are skipped unless
 * DB_SETUP=always (they would otherwise migrate the production database).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { DEFAULT_APP_DB_USER, describeDatabaseUrl, evaluateRlsCheck, resolveDatabaseUrls, RLS_CHECK_SQL, type RlsCheckRow } from "../src/lib/db-config";

const log = (msg: string) => console.log(`[db-setup] ${msg}`);

class SetupError extends Error {}

function fail(lines: string[]): never {
  throw new SetupError(lines.join("\n"));
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const bin = process.platform === "win32" ? `${cmd}.cmd` : cmd;
  const result = spawnSync(bin, args, { stdio: "inherit", env });
  if (result.status !== 0) fail([`Command failed: ${cmd} ${args.join(" ")} (exit ${result.status ?? result.signal})`]);
}

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureRuntimeRole(directUrl: string, user: string, password: string) {
  await withClient(directUrl, async (db) => {
    const role = db.escapeIdentifier(user);
    const secret = db.escapeLiteral(password);
    const exists = (await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user])).rowCount! > 0;
    if (exists) {
      await db.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
      log(`Runtime role ${user}: password updated.`);
    } else {
      // Defaults: NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE.
      await db.query(`CREATE ROLE ${role} WITH LOGIN PASSWORD ${secret}`);
      log(`Runtime role ${user}: created.`);
    }
    const database = (await db.query<{ db: string }>("SELECT current_database() AS db")).rows[0].db;
    try {
      await db.query(`GRANT CONNECT ON DATABASE ${db.escapeIdentifier(database)} TO ${role}`);
    } catch (err) {
      log(`Note: GRANT CONNECT skipped (${(err as Error).message}); PUBLIC usually has CONNECT.`);
    }
    const statements = [
      `GRANT USAGE ON SCHEMA public TO ${role}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
      `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${role}`,
      // Tables created by future migrations (run by this owner role).
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${role}`,
    ];
    for (const sql of statements) await db.query(sql);
    // The migration history is none of the app's business.
    const migrationsTable = await db.query("SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'");
    if (migrationsTable.rowCount) await db.query(`REVOKE ALL ON TABLE "_prisma_migrations" FROM ${role}`);
    log(`Runtime role ${user}: privileges granted on database ${database}.`);
  });
}

async function countUsers(directUrl: string): Promise<number> {
  return withClient(directUrl, async (db) => {
    const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "User"`);
    return res.rows[0].n;
  });
}

async function verifyRuntime(runtimeUrl: string) {
  const row = await withClient(runtimeUrl, async (db) => (await db.query<RlsCheckRow>(RLS_CHECK_SQL)).rows[0]);
  const result = evaluateRlsCheck(row);
  if (result.ok) {
    log(`Runtime connection ${describeDatabaseUrl(runtimeUrl)}: Row-Level Security enforced on ${row.rlsTables} tables. ✔`);
    return;
  }
  const lines = [
    `Row-Level Security would NOT apply to the app's database role "${result.user}":`,
    ...result.problems.map((p) => `  - ${p}`),
    "",
    "CZ: Aplikace by se k databázi připojila jako vlastník tabulek, takže by neplatila oprávnění na úrovni řádků.",
    "    Přidejte do proměnných projektu APP_DB_PASSWORD (náhodné heslo, viz docs/NASAZENI-VERCEL-NEON.md) a spusťte Redeploy.",
    "EN: Set APP_DB_PASSWORD (a random password) so the app connects as the restricted runtime role, then redeploy.",
  ];
  if (process.env.ALLOW_RLS_BYPASS === "true") {
    log(`${lines.join("\n")}\nContinuing because ALLOW_RLS_BYPASS=true.`);
    return;
  }
  fail(lines);
}

async function main() {
  const mode = (process.env.DB_SETUP ?? "auto").trim().toLowerCase();
  const vercelEnv = process.env.VERCEL_ENV;
  if (mode === "never") {
    log("DB_SETUP=never – skipping database setup.");
    return;
  }
  if (mode !== "always" && vercelEnv === "preview") {
    log("Preview deployment – skipping database setup (set DB_SETUP=always to run it).");
    return;
  }

  const urls = resolveDatabaseUrls(process.env);
  if (!urls.directUrl) {
    if (process.env.VERCEL) {
      fail([
        "Databáze není připojená / No database is connected.",
        "CZ: V projektu na Vercelu otevřete Storage → Create Database → Neon (region Frankfurt),",
        "    připojte databázi k projektu a pak spusťte Deployments → Redeploy.",
        "EN: In the Vercel project open Storage → Create Database → Neon (Frankfurt),",
        "    connect it to this project, then redeploy.",
      ]);
    }
    log("No database URL configured – skipping database setup.");
    return;
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env, DIRECT_URL: urls.directUrl };
  log(`Owner connection: ${describeDatabaseUrl(urls.directUrl)}`);

  log("Applying migrations (prisma migrate deploy)…");
  run("npx", ["prisma", "migrate", "deploy"], childEnv);

  if (urls.derived) {
    await ensureRuntimeRole(urls.directUrl, urls.runtimeUser ?? DEFAULT_APP_DB_USER, process.env.APP_DB_PASSWORD!.trim());
  } else {
    log("APP_DB_PASSWORD not set – using DATABASE_URL as the runtime connection.");
  }

  if (process.env.SEED_DEMO_DATA === "true") {
    const users = await countUsers(urls.directUrl);
    if (users === 0) {
      log("Empty database and SEED_DEMO_DATA=true – loading demo data…");
      run("npx", ["tsx", "prisma/seed.ts"], childEnv);
    } else {
      log(`Database already has ${users} users – demo data not loaded (seeding only fills an empty database).`);
    }
  }

  if (urls.runtimeUrl) await verifyRuntime(urls.runtimeUrl);
  log("Database ready.");
}

main().catch((err) => {
  if (err instanceof SetupError) {
    console.error(`\n✖ ${err.message.split("\n").join("\n  ")}\n`);
  } else {
    console.error("\n✖ Database setup failed:", err instanceof Error ? err.message : err, "\n");
  }
  process.exit(1);
});
