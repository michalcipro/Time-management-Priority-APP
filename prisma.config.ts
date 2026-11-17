import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration.
 *
 * - `DATABASE_URL` is used by the application at runtime (may be a pooled connection).
 * - `DIRECT_URL` (optional) is used for migrations; set it when DATABASE_URL points
 *   to a transaction pooler (Neon/Supabase pgbouncer) or to a restricted runtime role.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
