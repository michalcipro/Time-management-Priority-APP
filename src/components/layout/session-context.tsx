"use client";
import { createContext, useContext } from "react";
import type { Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";

export interface ClientUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  avatarColor: string | null;
  teamName: string;
  aiMode: "claude" | "offline";
  aiModel: string;
}

const SessionContext = createContext<ClientUser | null>(null);

export function SessionProvider({ user, children }: { user: ClientUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): ClientUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSessionUser must be used inside <SessionProvider>");
  return user;
}

export function useCan(permission: Permission): boolean {
  return can(useSessionUser().role, permission);
}
