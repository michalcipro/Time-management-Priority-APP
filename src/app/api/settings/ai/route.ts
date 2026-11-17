import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { updateAISettings } from "@/server/services/settings";
import { aiSettingsSchema } from "@/lib/settings";
import { audit } from "@/server/audit";

export const PUT = apiRoute(
  async ({ req, user }) => {
    const input = await parseJson(req, aiSettingsSchema.partial());
    const settings = await withActor(user, (db) => updateAISettings(db, user, input));
    await audit({ actor: user, action: "settings.ai.update", metadata: { analysisModel: settings.ai.analysisModel, assistantModel: settings.ai.assistantModel }, headers: req.headers });
    return { settings };
  },
  { permission: "ai:configure" },
);
