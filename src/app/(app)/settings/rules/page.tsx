import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { RulesForm } from "@/components/settings/rules-ai";

export const metadata: Metadata = { title: "Pravidla priorit" };

export default async function RulesPage() {
  await requirePermission("rules:manage");
  return <RulesForm />;
}
