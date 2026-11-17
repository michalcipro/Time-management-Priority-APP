import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { getIntegrationForUser } from "@/server/services/integrations";
import { syncIntegration } from "@/server/integrations/sync";

/** "Synchronizovat nyní" for a mailbox. */
export const POST = apiRoute<{ id: string }>(
  async ({ user, params }) => {
    await withActor(user, (db) => getIntegrationForUser(db, user, params.id));
    return syncIntegration(params.id);
  },
  { limit: 10, limitKey: "sync" },
);
