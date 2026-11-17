import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { upsertSmsIntegration } from "@/server/services/integrations";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime";

/** Create (or rotate) the personal SMS / iMessage webhook token (Apple Shortcuts). */
export const POST = apiRoute(
  async ({ req, user }) => {
    const result = await withActor(user, (db) => upsertSmsIntegration(db, user));
    await audit({ actor: user, action: "integration.connect", entityType: "Integration", entityId: result.id, metadata: { type: "SMS" }, headers: req.headers });
    await publish({ type: "integrations.changed", teamId: user.teamId });
    return result;
  },
  { permission: "integrations:connect:own" },
);
