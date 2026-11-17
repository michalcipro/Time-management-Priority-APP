import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { createUser, listUsersAdmin } from "@/server/services/users";
import { userCreateSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const GET = apiRoute(async ({ user }) => withActor(user, (db) => listUsersAdmin(db, user)), { permission: "users:manage" });

export const POST = apiRoute(
  async ({ req, user }) => {
    const input = await parseJson(req, userCreateSchema);
    const created = await withActor(user, (db) => createUser(db, user, input));
    await audit({ actor: user, action: "user.create", entityType: "User", entityId: created.id, metadata: { email: created.email, role: created.role }, headers: req.headers });
    return created;
  },
  { permission: "users:manage" },
);
