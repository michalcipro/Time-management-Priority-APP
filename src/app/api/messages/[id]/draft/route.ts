import { apiRoute, parseJson } from "@/server/api";
import { draftReply } from "@/server/ai/draft-reply";
import { draftReplySchema } from "@/lib/validation";

/** AI-assisted rewrite of a reply draft ("formálněji", "kratší", "odmítnout zdvořile"). */
export const POST = apiRoute<{ id: string }>(
  async ({ req, user, params }) => {
    const input = await parseJson(req, draftReplySchema);
    return draftReply(user, params.id, input);
  },
  { limit: 20, limitKey: "ai" },
);
