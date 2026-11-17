import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { getBoard } from "@/server/services/board";

export const GET = apiRoute(async ({ req, user }) => {
  const mineOnly = req.nextUrl.searchParams.get("mine") === "true";
  return withActor(user, (db) => getBoard(db, user, { mineOnly }));
});
