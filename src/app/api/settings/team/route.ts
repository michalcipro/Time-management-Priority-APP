import { apiRoute } from "@/server/api";
import { withActor } from "@/server/db";
import { getTeamSettings } from "@/server/services/settings";
import { features } from "@/server/env";
import { jobRunnerMode } from "@/server/jobs/queue";

export const GET = apiRoute(async ({ user }) => {
  const team = await withActor(user, (db) => getTeamSettings(db, user));
  return { ...team, features: { ...features, jobs: jobRunnerMode() } };
});
