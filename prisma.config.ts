import "dotenv/config";
import { defineConfig } from "prisma/config";
import { resolveDatabaseUrls } from "./src/lib/db-config";

/**
 * Prisma 7 configuration.
 *
 * - `DATABASE_URL` is used by the application at runtime (may be a pooled connection).
 * - Migrations use the owner's direct connection: `DIRECT_URL`, or the names the
 *   Vercel Neon integration sets (`DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`),
 *   falling back to `DATABASE_URL`.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: resolveDatabaseUrls(process.env).directUrl ?? "",
  },
});
