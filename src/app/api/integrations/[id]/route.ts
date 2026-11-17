import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { disconnectIntegration } from "@/server/services/integrations";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime";

export const DELETE = apiRoute<{ id: string }>(async ({ req, user, params }) => {
  const result = await withActor(user, (db) => disconnectIntegration(db, user, params.id));
  await audit({ actor: user, action: "integration.disconnect", entityType: "Integration", entityId: params.id, metadata: { type: result.type }, headers: req.headers });
  await publish({ type: "integrations.changed", teamId: user.teamId });
  return { ok: true };
});
