import type { NextAuthConfig } from "next-auth";

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

export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return true;
      }
      // API routes answer 401 themselves (JSON) instead of redirecting.
      if (pathname.startsWith("/api/")) return true;
      return Boolean(auth?.user);
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
