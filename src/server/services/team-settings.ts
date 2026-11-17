import "server-only";
import { parseTeamSettings, type TeamSettings } from "@/lib/settings";
import type { PriorityRules } from "@/lib/priority";
import type { Db } from "../db";

export async function loadTeamSettings(db: Db, teamId: string): Promise<TeamSettings> {
  const team = await db.team.findUnique({ where: { id: teamId }, select: { settings: true } });
  return parseTeamSettings(team?.settings);
}

export async function loadRules(db: Db, teamId: string): Promise<PriorityRules> {
  return (await loadTeamSettings(db, teamId)).priorityRules as PriorityRules;
}
