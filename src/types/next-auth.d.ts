import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      teamId: string;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    teamId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    teamId?: string;
  }
}
