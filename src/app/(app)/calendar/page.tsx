import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { CalendarView } from "@/components/calendar/calendar-view";

export const metadata: Metadata = { title: "Kalendář" };

export default async function CalendarPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/settings/users");
  return <CalendarView />;
}
