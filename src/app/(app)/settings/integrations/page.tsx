import type { Metadata } from "next";
import { Suspense } from "react";
import { IntegrationsPanel } from "@/components/settings/integrations-panel";

export const metadata: Metadata = { title: "Integrace" };

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsPanel />
    </Suspense>
  );
}
