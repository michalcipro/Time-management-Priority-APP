import { z } from "zod";
import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";

export const GET = apiRoute(async ({ req, user }) => {
  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";
  return withActor(user, (db) => listNotifications(db, user, { unreadOnly }));
});

const markSchema = z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(64)).max(200)]) });

export const POST = apiRoute(async ({ req, user }) => {
  const { ids } = await parseJson(req, markSchema);
  return withActor(user, (db) => markNotificationsRead(db, user, ids));
});
