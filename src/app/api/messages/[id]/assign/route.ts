import { apiRoute, parseJson } from "@/server/api";
import { withActorEffects } from "@/server/db";
import { assignMessage } from "@/server/services/messages";
import { assignMessageSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

/** "Přiřadit úkol" – create a task from the message and notify the advisor(s). */
export const POST = apiRoute<{ id: string }>(
  async ({ req, user, params }) => {
    const input = await parseJson(req, assignMessageSchema);
    const result = await withActorEffects(user, (db, fx) => assignMessage(db, user, params.id, input, fx));
    await audit({ actor: user, action: "task.assign", entityType: "Task", entityId: result.taskId, metadata: { fromMessage: params.id, assigneeIds: input.assigneeIds }, headers: req.headers });
    return result;
  },
  { permission: "messages:assign" },
);
