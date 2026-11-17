import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { updateUser } from "@/server/services/users";
import { userUpdateSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const PATCH = apiRoute<{ id: string }>(
  async ({ req, user, params }) => {
    const input = await parseJson(req, userUpdateSchema);
    const updated = await withActor(user, (db) => updateUser(db, user, params.id, input));
    const { password: _password, ...meta } = input;
    await audit({ actor: user, action: "user.update", entityType: "User", entityId: params.id, metadata: { ...meta, passwordReset: Boolean(input.password) }, headers: req.headers });
    return updated;
  },
  { permission: "users:manage" },
);
