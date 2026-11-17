import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { saveWhatsAppIntegration } from "@/server/services/integrations";
import { whatsappConfigSchema } from "@/lib/validation";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime";

export const PUT = apiRoute(
  async ({ req, user }) => {
    const input = await parseJson(req, whatsappConfigSchema);
    const result = await withActor(user, (db) => saveWhatsAppIntegration(db, user, input));
    await audit({ actor: user, action: "integration.connect", entityType: "Integration", entityId: result.id, metadata: { type: "WHATSAPP", phoneNumberId: input.phoneNumberId }, headers: req.headers });
    await publish({ type: "integrations.changed", teamId: user.teamId });
    return result;
  },
  { permission: "integrations:manage:team" },
);
