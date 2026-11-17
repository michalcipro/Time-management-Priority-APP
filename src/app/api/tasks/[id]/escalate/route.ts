import { apiRoute, parseJson } from "@/server/api";
import { withActorEffects } from "@/server/db";
import { escalateToDirector } from "@/server/services/tasks";
import { escalateSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

/** Advisor → director: "I need help with this task". */
export const POST = apiRoute<{ id: string }>(async ({ req, user, params }) => {
  const { note } = await parseJson(req, escalateSchema);
  await withActorEffects(user, (db, fx) => escalateToDirector(db, user, params.id, note, fx));
  await audit({ actor: user, action: "task.escalate_to_director", entityType: "Task", entityId: params.id, headers: req.headers });
  return { ok: true };
});
