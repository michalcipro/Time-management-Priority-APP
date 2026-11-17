import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { getTeamOverview } from "@/server/services/team";

export const GET = apiRoute(async ({ user }) => withActor(user, (db) => getTeamOverview(db, user)), { permission: "team:view" });
