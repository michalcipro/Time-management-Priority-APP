import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { withSystem } from "./db";
import { clientIp } from "./rate-limit";

export interface AuditEntry {
  actor?: { id: string; teamId: string } | null;
  teamId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  headers?: Headers | null;
}

/** Append-only audit trail of security-relevant actions. Never throws. */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await withSystem((db) =>
      db.auditLog.create({
        data: {
          teamId: entry.teamId ?? entry.actor?.teamId ?? null,
          actorId: entry.actor?.id ?? null,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: entry.headers ? clientIp(entry.headers) : null,
          userAgent: entry.headers?.get("user-agent")?.slice(0, 300) ?? null,
        },
      }),
    );
  } catch (err) {
    console.error("[audit] failed to write entry", entry.action, err);
  }
}
