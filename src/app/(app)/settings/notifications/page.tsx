import type { Metadata } from "next";
import { NotificationsForm } from "@/components/settings/profile-notifications";

export const metadata: Metadata = { title: "Notifikace" };

export default function NotificationsPage() {
  return <NotificationsForm />;
}
