import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { homePathFor } from "@/lib/permissions";
import { env, features } from "@/server/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Přihlášení" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(homePathFor(user.role));
  const params = await searchParams;
  return (
    <LoginForm
      demo={env.demoMode}
      sso={{ google: features.google, microsoft: features.microsoft }}
      error={params.error ?? null}
      callbackUrl={params.callbackUrl && params.callbackUrl.startsWith("/") ? params.callbackUrl : null}
    />
  );
}
