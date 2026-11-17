import "server-only";
import { withSystem } from "../db";
import { publish } from "../realtime";
import { fetchNewGmail } from "./google";
import { fetchNewOutlook } from "./microsoft";
import { ingestMessages } from "./ingest";
import { IntegrationAuthError } from "./types";

/** Pull new messages from one mailbox integration. */
export async function syncIntegration(integrationId: string): Promise<{ created: number; error?: string }> {
  const integration = await withSystem((db) => db.integration.findUnique({ where: { id: integrationId } }));
  if (!integration || (integration.type !== "GOOGLE" && integration.type !== "MICROSOFT")) return { created: 0 };
  if (integration.status === "DISCONNECTED") return { created: 0 };

  try {
    const result = integration.type === "GOOGLE" ? await fetchNewGmail(integration) : await fetchNewOutlook(integration);
    const { created } = await ingestMessages({ id: integration.id, teamId: integration.teamId, userId: integration.userId }, result.messages);
    await withSystem((db) =>
      db.integration.update({
        where: { id: integration.id },
        data: { syncCursor: result.cursor, lastSyncAt: new Date(), status: "ACTIVE", lastError: null },
      }),
    );
    if (integration.status !== "ACTIVE") await publish({ type: "integrations.changed", teamId: integration.teamId });
    return { created: created.length };
  } catch (err) {
    const message = (err as Error).message.slice(0, 500);
    await withSystem((db) =>
      db.integration.update({
        where: { id: integration.id },
        data: { status: "ERROR", lastError: err instanceof IntegrationAuthError ? message : `Synchronizace selhala: ${message}`, lastSyncAt: new Date() },
      }),
    );
    await publish({ type: "integrations.changed", teamId: integration.teamId });
    return { created: 0, error: message };
  }
}

/** Scheduled: sync every connected mailbox. */
export async function syncAllChannels(): Promise<{ integrations: number; created: number }> {
  const integrations = await withSystem((db) =>
    db.integration.findMany({ where: { type: { in: ["GOOGLE", "MICROSOFT"] }, status: { in: ["ACTIVE", "ERROR"] } }, select: { id: true } }),
  );
  let created = 0;
  for (const i of integrations) created += (await syncIntegration(i.id)).created;
  return { integrations: integrations.length, created };
}
