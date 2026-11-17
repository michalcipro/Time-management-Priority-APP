import { apiRoute, parseJson } from "@/server/api";
import { withActor, withActorEffects } from "@/server/db";
import { deleteTask, getTask, updateTask } from "@/server/services/tasks";
import { taskUpdateSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const GET = apiRoute<{ id: string }>(async ({ user, params }) => withActor(user, (db) => getTask(db, user, params.id)));

export const PATCH = apiRoute<{ id: string }>(async ({ req, user, params }) => {
  const input = await parseJson(req, taskUpdateSchema);
  const task = await withActorEffects(user, (db, fx) => updateTask(db, user, params.id, input, fx));
  if (input.priority !== undefined) {
    await audit({ actor: user, action: "task.priority.override", entityType: "Task", entityId: params.id, metadata: { to: input.priority, reason: input.priorityReason }, headers: req.headers });
  }
  if (input.assigneeIds !== undefined) {
    await audit({ actor: user, action: "task.assign", entityType: "Task", entityId: params.id, metadata: { assigneeIds: input.assigneeIds }, headers: req.headers });
  }
  return task;
});

export const DELETE = apiRoute<{ id: string }>(
  async ({ req, user, params }) => {
    await withActorEffects(user, (db, fx) => deleteTask(db, user, params.id, fx));
    await audit({ actor: user, action: "task.delete", entityType: "Task", entityId: params.id, headers: req.headers });
    return { ok: true };
  },
  { permission: "tasks:delete" },
);
