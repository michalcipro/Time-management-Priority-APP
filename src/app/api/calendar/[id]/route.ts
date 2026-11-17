import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { deleteCalendarEvent } from "@/server/services/calendar";

export const DELETE = apiRoute<{ id: string }>(async ({ user, params }) => {
  await withActor(user, (db) => deleteCalendarEvent(db, user, params.id));
  return { ok: true };
});
