import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { getProfile, updateProfile } from "@/server/services/users";
import { profileUpdateSchema } from "@/lib/validation";
import { audit } from "@/server/audit";

export const GET = apiRoute(async ({ user }) => withActor(user, (db) => getProfile(db, user)));

export const PATCH = apiRoute(
  async ({ req, user }) => {
    const input = await parseJson(req, profileUpdateSchema);
    const profile = await withActor(user, (db) => updateProfile(db, user, input));
    if (input.newPassword) await audit({ actor: user, action: "auth.password_change", headers: req.headers });
    return profile;
  },
  { limit: 20, limitKey: "profile" },
);
