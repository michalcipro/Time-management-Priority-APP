import { apiRoute, parseJson } from "@/server/api";
import { withActorEffects } from "@/server/db";
import { addComment } from "@/server/services/tasks";
import { commentCreateSchema } from "@/lib/validation";

export const POST = apiRoute<{ id: string }>(async ({ req, user, params }) => {
  const { body } = await parseJson(req, commentCreateSchema);
  return withActorEffects(user, (db, fx) => addComment(db, user, params.id, body, fx));
});
