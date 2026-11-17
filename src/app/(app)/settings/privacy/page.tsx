import type { Metadata } from "next";
import { PrivacyPanel } from "@/components/settings/admin-panels";

export const metadata: Metadata = { title: "Ochrana dat" };

export default function PrivacyPage() {
  return <PrivacyPanel />;
}
