import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { can } from "@/lib/permissions";
import { MyTasksView, TeamTasksView } from "@/components/tasks/task-views";

export const metadata: Metadata = { title: "Úkoly" };

/** Directors see the whole team; everyone else gets their own task list (deep links keep working). */
export default async function TasksPage() {
  const user = await requireUser();
  return <Suspense>{can(user.role, "tasks:read:all") ? <TeamTasksView /> : <MyTasksView />}</Suspense>;
}
