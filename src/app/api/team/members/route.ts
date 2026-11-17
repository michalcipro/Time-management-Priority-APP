import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { listTeamMembers } from "@/server/services/team";

export const GET = apiRoute(async ({ user }) => withActor(user, (db) => listTeamMembers(db, user)));
