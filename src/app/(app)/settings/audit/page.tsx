import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { AuditLog } from "@/components/settings/admin-panels";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requirePermission("audit:view");
  return <AuditLog />;
}
