import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { globalSearch } from "@/server/services/search";

export const GET = apiRoute(async ({ req, user }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  return withActor(user, (db) => globalSearch(db, user, q));
});
