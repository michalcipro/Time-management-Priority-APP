import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { AssistantView } from "@/components/ai/assistant-view";

export const metadata: Metadata = { title: "AI Asistent" };

export default async function AssistantPage() {
  await requirePermission("ai:use");
  return <AssistantView />;
}
