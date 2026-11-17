import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { withActor } from "@/server/db";
import { OAUTH_NONCE_COOKIE, verifyOAuthState } from "@/server/integrations/oauth-state";
import { exchangeMicrosoftCode, microsoftProfile } from "@/server/integrations/microsoft";
import { saveOAuthIntegration } from "@/server/services/integrations";
import { enqueue } from "@/server/jobs/queue";
import { audit } from "@/server/audit";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?${q}`, req.url));
    res.cookies.delete(OAUTH_NONCE_COOKIE);
    return res;
  };
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back(`error=${encodeURIComponent(params.get("error")!)}`);
  const state = verifyOAuthState(params.get("state"), req.cookies.get(OAUTH_NONCE_COOKIE)?.value, user.id, "microsoft");
  const code = params.get("code");
  if (!state || !code) return back("error=invalid_state");
  try {
    const creds = await exchangeMicrosoftCode(code);
    const profile = await microsoftProfile(creds.accessToken);
    const { id } = await withActor(user, (db) => saveOAuthIntegration(db, user, "MICROSOFT", creds, profile.email));
    await audit({ actor: user, action: "integration.connect", entityType: "Integration", entityId: id, metadata: { type: "MICROSOFT", email: profile.email }, headers: req.headers });
    await enqueue("integration.sync", { integrationId: id });
    return back("connected=microsoft");
  } catch (err) {
    console.error("[microsoft oauth]", err);
    return back("error=microsoft_exchange_failed");
  }
}
