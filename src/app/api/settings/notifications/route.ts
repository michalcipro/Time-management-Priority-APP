import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { updateNotificationPrefs } from "@/server/services/users";
import { notificationPrefsSchema } from "@/lib/settings";

export const PUT = apiRoute(async ({ req, user }) => {
  const input = await parseJson(req, notificationPrefsSchema.partial());
  return { prefs: await withActor(user, (db) => updateNotificationPrefs(db, user, input)) };
});
