import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { AISettingsForm } from "@/components/settings/rules-ai";

export const metadata: Metadata = { title: "AI a náklady" };

export default async function AISettingsPage() {
  await requirePermission("ai:configure");
  return <AISettingsForm />;
}
