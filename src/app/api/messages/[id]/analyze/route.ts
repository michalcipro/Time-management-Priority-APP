import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { messageScope } from "@/server/services/scopes";
import { analyzeMessage } from "@/server/ai/analyze-message";
import { notFound } from "@/server/errors";

/** Re-run the AI analysis of a message ("Regenerovat"). */
export const POST = apiRoute<{ id: string }>(
  async ({ user, params }) => {
    const visible = await withActor(user, (db) => db.message.findFirst({ where: { AND: [{ id: params.id }, messageScope(user)] }, select: { id: true } }));
    if (!visible) throw notFound("Zpráva");
    const result = await analyzeMessage(params.id, { force: true, actorId: user.id });
    return { ok: true, model: result?.model ?? null };
  },
  { limit: 20, limitKey: "ai" },
);
