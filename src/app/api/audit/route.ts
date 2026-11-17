import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";

export const GET = apiRoute(
  async ({ req, user }) => {
    const take = Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? 100));
    const rows = await withActor(user, (db) =>
      db.auditLog.findMany({
        where: { teamId: user.teamId },
        orderBy: { createdAt: "desc" },
        take,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
        actor: r.actor,
      })),
    };
  },
  { permission: "audit:view" },
);
