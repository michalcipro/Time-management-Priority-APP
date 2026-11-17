import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { MyTasksView } from "@/components/tasks/task-views";

export const metadata: Metadata = { title: "Moje úkoly" };

export default async function MyTasksPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/settings/users");
  return <MyTasksView />;
}
