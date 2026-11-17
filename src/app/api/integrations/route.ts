import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { listIntegrations } from "@/server/services/integrations";
import { env, features } from "@/server/env";

export const GET = apiRoute(async ({ user }) => ({
  integrations: await withActor(user, (db) => listIntegrations(db, user)),
  available: { google: features.google, microsoft: features.microsoft, whatsappWebhook: Boolean(env.whatsapp.verifyToken), twilio: features.twilio },
  whatsappVerifyTokenSet: Boolean(env.whatsapp.verifyToken),
}));
