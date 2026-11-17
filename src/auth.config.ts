import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Lightweight Auth.js configuration shared with `src/proxy.ts`.
 * Providers (which need the database) are added in `src/auth.ts`.
 */
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/webhooks",
  "/api/cron",
  "/api/ics",
  "/api/health",
  "/sw.js",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  "/favicon",
];

/**
 * AUTH_COOKIE_SAMESITE_NONE=true makes the auth cookies usable when the app is
 * embedded in a cross-site iframe (e.g. a portal or preview pane). Requires HTTPS.
 */
const crossSite = process.env.AUTH_COOKIE_SAMESITE_NONE === "true";
const embedCookie = { sameSite: "none" as const, secure: true, partitioned: true, path: "/" };
const cookies = crossSite
  ? {
      sessionToken: { name: "authjs.session-token", options: { ...embedCookie, httpOnly: true } },
      callbackUrl: { name: "authjs.callback-url", options: { ...embedCookie } },
      csrfToken: { name: "authjs.csrf-token", options: { ...embedCookie, httpOnly: true } },
    }
  : undefined;

export const authConfig = {
  ...(cookies ? { cookies } : {}),
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname, search } = request.nextUrl;
      if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return true;
      }
      // API routes answer 401 themselves (JSON) instead of redirecting.
      if (pathname.startsWith("/api/")) return true;
      if (auth?.user) return true;
      // Same-origin redirect (Next.js sends it as a relative Location, so it also works behind
      // reverse proxies and preview domains) with a relative callbackUrl for deep links.
      const callbackUrl = pathname === "/" ? "" : `?callbackUrl=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(new URL(`/login${callbackUrl}`, request.nextUrl));
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.role = user.role;
        token.teamId = user.teamId;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
      if (token.teamId) session.user.teamId = token.teamId;
      return session;
    },
  },
} satisfies NextAuthConfig;
