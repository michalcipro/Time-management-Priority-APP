import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Next.js 16 proxy (formerly middleware): redirects unauthenticated page requests
 * to /login. Authorization (roles) is enforced in pages, API routes and the DB.
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
