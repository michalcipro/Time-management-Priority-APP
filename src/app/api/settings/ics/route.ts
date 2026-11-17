import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { regenerateIcsToken } from "@/server/services/users";
import { env } from "@/server/env";

/** Rotate the secret ICS feed URL (invalidates the old subscription link). */
export const POST = apiRoute(async ({ user }) => {
  const token = await withActor(user, (db) => regenerateIcsToken(db, user));
  return { url: `${env.appUrl}/api/ics/${token}` };
});
