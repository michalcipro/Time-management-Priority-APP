import type { Metadata } from "next";
import { requirePermission } from "@/server/session";
import { UsersAdmin } from "@/components/settings/admin-panels";

export const metadata: Metadata = { title: "Uživatelé" };

export default async function UsersPage() {
  await requirePermission("users:manage");
  return <UsersAdmin />;
}
