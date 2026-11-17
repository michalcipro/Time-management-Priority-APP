import { apiRoute, parseJson } from "@/server/api";
import { withActor, withActorEffects } from "@/server/db";
import { prepareReply, recordReply } from "@/server/services/messages";
import { sendReplyViaChannel } from "@/server/integrations/send";
import { replySchema } from "@/lib/validation";
import { audit } from "@/server/audit";
import { ApiError } from "@/server/errors";

/** Send (or record) a human-approved reply. The AI never sends anything by itself. */
export const POST = apiRoute<{ id: string }>(
  async ({ req, user, params }) => {
    const input = await parseJson(req, replySchema);
    const original = await withActor(user, (db) => prepareReply(db, user, params.id));

    let sent: { externalId: string | null; via: string };
    try {
      sent = await sendReplyViaChannel(original, input.text);
    } catch (err) {
      throw new ApiError(502, `Odeslání se nezdařilo: ${(err as Error).message}`, "send_failed");
    }
    const result = await withActorEffects(user, (db, fx) => recordReply(db, user, original, input.text, sent, input.resolve, fx));
    await audit({ actor: user, action: "message.reply", entityType: "Message", entityId: params.id, metadata: { via: sent.via }, headers: req.headers });
    return { ...result, manual: sent.via === "manual" };
  },
  { limit: 30, limitKey: "reply" },
);
