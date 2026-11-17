import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { eraseOwnAccount } from "@/server/services/gdpr";
import { audit } from "@/server/audit";

/** GDPR "right to erasure" for the signed-in user's own account. */
export const DELETE = apiRoute(
  async ({ req, user }) => {
    await withActor(user, (db) => eraseOwnAccount(db, user));
    await audit({ actor: user, action: "gdpr.account_erased", entityType: "User", entityId: user.id, headers: req.headers });
    return { ok: true };
  },
  { limit: 3, limitKey: "gdpr" },
);
