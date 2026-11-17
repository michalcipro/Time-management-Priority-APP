"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useRealtime } from "@/hooks/use-realtime";
import { can } from "@/lib/permissions";
import { Sidebar, SidebarContent } from "./sidebar";
import { NotificationsBell } from "./notifications-bell";
import { ThemeToggle } from "./theme-toggle";
import { AppUIProvider, useAppUI } from "./app-ui";
import { SessionProvider, useSessionUser, type ClientUser } from "./session-context";
import { PushPrompt } from "./push-prompt";

const TITLES: [RegExp, string][] = [
  [/^\/board/, "Priority Board"],
  [/^\/inbox/, "Unified Inbox"],
  [/^\/tasks/, "Úkoly týmu"],
  [/^\/my-tasks/, "Moje úkoly"],
  [/^\/team/, "Tým"],
  [/^\/calendar/, "Kalendář"],
  [/^\/assistant/, "AI Asistent"],
  [/^\/settings/, "Nastavení"],
];

function TopBar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const user = useSessionUser();
  const ui = useAppUI();
  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Priority Agent";
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:gap-3 lg:px-8">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onMenu} aria-label="Otevřít menu">
        <Menu />
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
      {user.role !== "ADMIN" && (
        <button
          onClick={ui.openCommand}
          className="hidden h-9 w-72 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-xs transition hover:border-ring/40 hover:text-foreground md:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Hledat úkoly, klienty, zprávy…</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-px text-[10px] font-medium">⌘ K</kbd>
        </button>
      )}
      {user.role !== "ADMIN" && (
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={ui.openCommand} aria-label="Hledat">
          <Search />
        </Button>
      )}
      {can(user.role, "tasks:create") && (
        <Button size="sm" onClick={() => ui.openCreateTask()} className="hidden sm:inline-flex">
          <Plus /> Nový úkol
        </Button>
      )}
      <NotificationsBell />
      <ThemeToggle />
    </header>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  useRealtime(true);
  return (
    <div className="min-h-dvh">
      <Sidebar />
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigace</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="lg:pl-64">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 lg:px-8">{children}</main>
      </div>
      <PushPrompt />
    </div>
  );
}

export function AppShell({ user, children }: { user: ClientUser; children: React.ReactNode }) {
  return (
    <SessionProvider user={user}>
      <AppUIProvider>
        <ShellInner>{children}</ShellInner>
      </AppUIProvider>
    </SessionProvider>
  );
}
