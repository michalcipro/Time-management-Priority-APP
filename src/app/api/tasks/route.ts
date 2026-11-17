import { apiRoute, parseJson, parseQuery } from "@/server/api";
import { withActor, withActorEffects } from "@/server/db";
import { createTask, listTasks } from "@/server/services/tasks";
import { taskCreateSchema, taskListQuerySchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const GET = apiRoute(async ({ req, user }) => {
  const query = parseQuery(req, taskListQuerySchema);
  return withActor(user, (db) => listTasks(db, user, query));
});

export const POST = apiRoute(
  async ({ req, user }) => {
    const input = await parseJson(req, taskCreateSchema);
    const task = await withActorEffects(user, (db, fx) => createTask(db, user, input, fx));
    if (task.assignees.some((a) => a.id !== user.id)) {
      await audit({ actor: user, action: "task.assign", entityType: "Task", entityId: task.id, metadata: { assignees: task.assignees.map((a) => a.name) }, headers: req.headers });
    }
    return task;
  },
  { permission: "tasks:create" },
);
