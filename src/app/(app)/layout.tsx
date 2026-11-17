import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/server/session";
import { prisma } from "@/server/db";
import { features } from "@/server/env";
import { parseTeamSettings } from "@/lib/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const team = await prisma.team.findUnique({ where: { id: user.teamId }, select: { name: true, settings: true } });
  const settings = parseTeamSettings(team?.settings);
  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        title: user.title,
        avatarColor: user.avatarColor,
        teamName: team?.name ?? "",
        aiMode: features.ai ? "claude" : "offline",
        aiModel: settings.ai.assistantModel,
      }}
    >
      {children}
    </AppShell>
  );
}
