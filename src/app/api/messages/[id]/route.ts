import { apiRoute, parseJson } from "@/server/api";
import { withActor, withActorEffects } from "@/server/db";
import { getMessage, updateMessage } from "@/server/services/messages";
import { messageUpdateSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const GET = apiRoute<{ id: string }>(async ({ user, params }) => withActor(user, (db) => getMessage(db, user, params.id)));

export const PATCH = apiRoute<{ id: string }>(async ({ req, user, params }) => {
  const input = await parseJson(req, messageUpdateSchema);
  const result = await withActorEffects(user, (db, fx) => updateMessage(db, user, params.id, input, fx));
  if (input.priority !== undefined || input.assigneeId !== undefined) {
    await audit({
      actor: user,
      action: input.priority !== undefined ? "message.priority.override" : "message.assign",
      entityType: "Message",
      entityId: params.id,
      metadata: { priority: input.priority, assigneeId: input.assigneeId },
      headers: req.headers,
    });
  }
  return result;
});
