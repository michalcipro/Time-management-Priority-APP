import { apiRoute, parseQuery } from "@/server/api";
import { withActor } from "@/server/db";
import { listMessages } from "@/server/services/messages";
import { messageListQuerySchema } from "@/lib/validation";

export const GET = apiRoute(async ({ req, user }) => {
  const query = parseQuery(req, messageListQuerySchema);
  return withActor(user, (db) => listMessages(db, user, query));
});
