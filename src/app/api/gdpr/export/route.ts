import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { exportUserData } from "@/server/services/gdpr";
import { audit } from "@/server/audit";

/** GDPR data export (JSON download). */
export const GET = apiRoute(
  async ({ req, user }) => {
    const data = await withActor(user, (db) => exportUserData(db, user));
    await audit({ actor: user, action: "gdpr.export", headers: req.headers });
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="priority-agent-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  },
  { limit: 5, limitKey: "gdpr" },
);
