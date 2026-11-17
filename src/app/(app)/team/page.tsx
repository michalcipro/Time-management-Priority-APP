import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { TeamView } from "@/components/team/team-view";

export const metadata: Metadata = { title: "Tým" };

export default async function TeamPage() {
  await requirePermission("team:view");
  return <TeamView />;
}
