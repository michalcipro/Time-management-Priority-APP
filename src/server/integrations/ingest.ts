import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { buildSearchText } from "@/lib/search-text";
import { parseTeamSettings } from "@/lib/settings";
import { makePreview } from "@/lib/utils";
import { withSystem } from "../db";
import { enqueue } from "../jobs/queue";
import { publish } from "../realtime";
import type { NormalizedMessage } from "./types";

/**
 * Store normalised messages from any channel (idempotent on teamId+channel+externalId)
 * and queue them for AI analysis.
 */
export async function ingestMessages(
  integration: { id: string | null; teamId: string; userId: string | null },
  items: NormalizedMessage[],
): Promise<{ created: string[]; skipped: number }> {
  if (items.length === 0) return { created: [], skipped: 0 };

  const { created, autoAnalyze } = await withSystem(async (db) => {
    const team = await db.team.findUnique({ where: { id: integration.teamId }, select: { settings: true } });
    const settings = parseTeamSettings(team?.settings);
    const rows = await db.message.createManyAndReturn({
      data: items.map(
        (m): Prisma.MessageCreateManyInput => ({
          teamId: integration.teamId,
          ownerId: integration.userId,
          integrationId: integration.id,
          channel: m.channel,
          direction: "INBOUND",
          externalId: m.externalId,
          threadKey: m.threadKey ?? `${m.channel.toLowerCase()}:${m.senderContact.toLowerCase()}`,
          senderName: m.senderName ?? null,
          senderContact: m.senderContact,
          recipient: m.recipient ?? null,
          subject: m.subject ?? null,
          content: m.content,
          preview: makePreview(m.content),
          attachments: (m.attachments?.length ? m.attachments : undefined) as Prisma.InputJsonValue | undefined,
          receivedAt: m.receivedAt,
          status: "UNREAD",
          basePriority: 3,
          priority: 3,
          aiStatus: settings.ai.autoAnalyze ? "PENDING" : "SKIPPED",
          searchText: buildSearchText(m.senderName, m.senderContact, m.subject, m.content),
          metadata: (m.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        }),
      ),
      skipDuplicates: true,
      select: { id: true },
    });
    return { created: rows.map((r) => r.id), autoAnalyze: settings.ai.autoAnalyze };
  });

  if (created.length > 0) {
    await publish({ type: "messages.changed", teamId: integration.teamId, messageIds: created });
    if (autoAnalyze) for (const id of created) await enqueue("message.analyze", { messageId: id });
  }
  return { created, skipped: items.length - created.length };
}
