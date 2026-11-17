import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/session";
import { InboxView } from "@/components/inbox/inbox-view";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/settings/users");
  return (
    <Suspense>
      <InboxView />
    </Suspense>
  );
}
