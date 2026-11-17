import { describe, expect, it } from "vitest";
import { describeDatabaseUrl, evaluateRlsCheck, resolveDatabaseUrls, withCredentials } from "@/lib/db-config";

const NEON_POOLED = "postgresql://neondb_owner:ownerPw@ep-cool-name-a1b2c3-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const NEON_DIRECT = "postgresql://neondb_owner:ownerPw@ep-cool-name-a1b2c3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("resolveDatabaseUrls", () => {
  it("keeps the local/Docker layout unchanged", () => {
    const urls = resolveDatabaseUrls({
      DATABASE_URL: "postgresql://priority_app:pw@localhost:5432/priority_agent",
      DIRECT_URL: "postgresql://postgres:pw@localhost:5432/priority_agent",
    });
    expect(urls.runtimeUrl).toBe("postgresql://priority_app:pw@localhost:5432/priority_agent");
    expect(urls.directUrl).toBe("postgresql://postgres:pw@localhost:5432/priority_agent");
    expect(urls.derived).toBe(false);
  });

  it("derives the runtime role from the Neon integration variables", () => {
    const urls = resolveDatabaseUrls({ DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT, APP_DB_PASSWORD: "s3cr3t-Pw_1" });
    expect(urls.directUrl).toBe(NEON_DIRECT);
    expect(urls.derived).toBe(true);
    expect(urls.runtimeUser).toBe("priority_app");
    const runtime = new URL(urls.runtimeUrl!);
    expect(runtime.username).toBe("priority_app");
    expect(decodeURIComponent(runtime.password)).toBe("s3cr3t-Pw_1");
    expect(runtime.host).toBe("ep-cool-name-a1b2c3-pooler.eu-central-1.aws.neon.tech");
    expect(runtime.pathname).toBe("/neondb");
    expect(runtime.searchParams.get("sslmode")).toBe("require");
  });

  it("prefers DIRECT_URL, then DATABASE_URL_UNPOOLED, then POSTGRES_URL_NON_POOLING", () => {
    expect(resolveDatabaseUrls({ DATABASE_URL: "postgresql://a@h/db", POSTGRES_URL_NON_POOLING: "postgresql://c@h/db" }).directUrl).toBe("postgresql://c@h/db");
    expect(resolveDatabaseUrls({ DATABASE_URL: "postgresql://a@h/db", DATABASE_URL_UNPOOLED: "postgresql://b@h/db", POSTGRES_URL_NON_POOLING: "postgresql://c@h/db" }).directUrl).toBe("postgresql://b@h/db");
    expect(resolveDatabaseUrls({ DATABASE_URL: "postgresql://a@h/db", DIRECT_URL: "postgresql://d@h/db", DATABASE_URL_UNPOOLED: "postgresql://b@h/db" }).directUrl).toBe("postgresql://d@h/db");
    expect(resolveDatabaseUrls({ DATABASE_URL: "postgresql://a@h/db" }).directUrl).toBe("postgresql://a@h/db");
  });

  it("supports a custom runtime role and ignores blank values", () => {
    const urls = resolveDatabaseUrls({ DATABASE_URL: NEON_POOLED, APP_DB_USER: "app_rt", APP_DB_PASSWORD: "x", DIRECT_URL: "  " });
    expect(new URL(urls.runtimeUrl!).username).toBe("app_rt");
    expect(urls.directUrl).toBe(NEON_POOLED);
  });

  it("returns nothing when no database is configured", () => {
    expect(resolveDatabaseUrls({ APP_DB_PASSWORD: "x" })).toEqual({ directUrl: undefined, runtimeUrl: undefined, derived: false });
  });
});

describe("withCredentials / describeDatabaseUrl", () => {
  it("encodes special characters and never logs passwords", () => {
    const url = withCredentials("postgresql://u:p@host:5432/db", "role", "p@ss:w/rd%");
    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.password)).toBe("p@ss:w/rd%");
    expect(parsed.port).toBe("5432");
    expect(describeDatabaseUrl(url)).toBe("role@host:5432/db");
    expect(describeDatabaseUrl(undefined)).toBe("(not set)");
  });
});

describe("evaluateRlsCheck", () => {
  const ok = { user: "priority_app", superuser: false, bypassRls: false, rlsTables: 13, ownedRlsTables: 0 };
  it("accepts a restricted runtime role", () => {
    expect(evaluateRlsCheck(ok)).toEqual({ ok: true, user: "priority_app", problems: [] });
  });
  it("rejects superusers, BYPASSRLS roles, table owners and databases without RLS", () => {
    expect(evaluateRlsCheck({ ...ok, superuser: true }).ok).toBe(false);
    expect(evaluateRlsCheck({ ...ok, bypassRls: true }).ok).toBe(false);
    expect(evaluateRlsCheck({ ...ok, user: "neondb_owner", ownedRlsTables: 13 }).problems[0]).toMatch(/owns 13/);
    expect(evaluateRlsCheck({ ...ok, rlsTables: 0 }).ok).toBe(false);
    expect(evaluateRlsCheck(undefined).ok).toBe(false);
  });
});
