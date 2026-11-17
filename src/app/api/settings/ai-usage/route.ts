import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { aiUsage } from "@/server/services/settings";

export const GET = apiRoute(async ({ user }) => withActor(user, (db) => aiUsage(db, user)));
