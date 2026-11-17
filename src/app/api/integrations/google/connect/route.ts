import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/session";
import { features } from "@/server/env";
import { createOAuthState, OAUTH_NONCE_COOKIE } from "@/server/integrations/oauth-state";
import { googleAuthUrl } from "@/server/integrations/google";

/** Start the Google OAuth flow (Gmail + Calendar). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!features.google) return NextResponse.redirect(new URL("/settings/integrations?error=google_not_configured", req.url));
  const { state, nonce } = createOAuthState(user.id, "google");
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
