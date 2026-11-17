import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { withActor } from "@/server/db";
import { OAUTH_NONCE_COOKIE, verifyOAuthState } from "@/server/integrations/oauth-state";
import { exchangeGoogleCode, googleProfile } from "@/server/integrations/google";
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
  const state = verifyOAuthState(params.get("state"), req.cookies.get(OAUTH_NONCE_COOKIE)?.value, user.id, "google");
  const code = params.get("code");
  if (!state || !code) return back("error=invalid_state");
  try {
    const creds = await exchangeGoogleCode(code);
    const profile = await googleProfile(creds.accessToken);
    const { id } = await withActor(user, (db) => saveOAuthIntegration(db, user, "GOOGLE", creds, profile.email));
    await audit({ actor: user, action: "integration.connect", entityType: "Integration", entityId: id, metadata: { type: "GOOGLE", email: profile.email }, headers: req.headers });
    await enqueue("integration.sync", { integrationId: id });
    return back("connected=google");
  } catch (err) {
    console.error("[google oauth]", err);
    return back("error=google_exchange_failed");
  }
}
