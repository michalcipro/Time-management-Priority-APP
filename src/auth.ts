import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { prisma } from "@/server/db";
import { env, features } from "@/server/env";
import { rateLimit, clientIp } from "@/server/rate-limit";
import { audit } from "@/server/audit";

class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

const ssoProviders = [
  ...(features.google
    ? [Google({ clientId: env.google.clientId!, clientSecret: env.google.clientSecret!, allowDangerousEmailAccountLinking: false })]
    : []),
  ...(features.microsoft
    ? [
        MicrosoftEntraID({
          clientId: env.microsoft.clientId!,
          clientSecret: env.microsoft.clientSecret!,
          issuer: `https://login.microsoftonline.com/${env.microsoft.tenantId}/v2.0`,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { label: "E-mail" }, password: { label: "Heslo", type: "password" } },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const ip = clientIp(request.headers);
        const [byIp, byEmail] = await Promise.all([
          rateLimit(`login:ip:${ip}`, 20, 300),
          rateLimit(`login:email:${email}`, 8, 300),
        ]);
        if (!byIp.ok || !byEmail.ok) throw new RateLimitedSignin();

        const user = await prisma.user.findUnique({ where: { email } });
        // Constant-time-ish: always run bcrypt to avoid user enumeration by timing.
        const hash = user?.passwordHash ?? "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.FfmR8y7a2lBzmGcuZ8RU7a8MZ9Ge";
        const valid = await bcrypt.compare(password, hash);
        if (!user || !user.isActive || !user.passwordHash || !valid) {
          await audit({ teamId: user?.teamId, action: "auth.login_failed", metadata: { email }, headers: request.headers });
          return null;
        }

        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await audit({ actor: { id: user.id, teamId: user.teamId }, action: "auth.login", metadata: { method: "password" }, headers: request.headers });
        return { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.teamId };
      },
    }),
    ...ssoProviders,
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (!account || account.provider === "credentials") return true;
      // SSO is only allowed for users that an administrator has already provisioned.
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser || !dbUser.isActive) return "/login?error=AccessDenied";
      user.id = dbUser.id;
      user.role = dbUser.role;
      user.teamId = dbUser.teamId;
      user.name = dbUser.name;
      await prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } });
      await audit({ actor: { id: dbUser.id, teamId: dbUser.teamId }, action: "auth.login", metadata: { method: account.provider } });
      return true;
    },
  },
});
