import "server-only";
import { hmacSha256, randomToken, safeEqual } from "../crypto";

/**
 * Signed OAuth `state` parameter bound to the user and to a browser cookie nonce
 * (protects the OAuth callbacks against CSRF / login-swap attacks).
 */
export const OAUTH_NONCE_COOKIE = "pa_oauth_nonce";

interface StatePayload {
  uid: string;
  provider: "google" | "microsoft";
  nonce: string;
  exp: number;
  returnTo: string;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function createOAuthState(uid: string, provider: StatePayload["provider"], returnTo = "/settings/integrations") {
  const nonce = randomToken(16);
  const payload: StatePayload = { uid, provider, nonce, exp: Date.now() + 10 * 60_000, returnTo };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state: `${body}.${hmacSha256(secret(), body)}`, nonce };
}

export function verifyOAuthState(state: string | null, cookieNonce: string | undefined, uid: string, provider: StatePayload["provider"]): StatePayload | null {
  if (!state || !cookieNonce) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig || !safeEqual(sig, hmacSha256(secret(), body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (payload.exp < Date.now() || payload.uid !== uid || payload.provider !== provider) return null;
    if (!safeEqual(payload.nonce, cookieNonce)) return null;
    if (!payload.returnTo.startsWith("/")) payload.returnTo = "/settings/integrations";
    return payload;
  } catch {
    return null;
  }
}
