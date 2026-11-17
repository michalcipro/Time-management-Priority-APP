"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarDays,
  ClipboardList,
  Inbox,
  LayoutGrid,
  ListChecks,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessages } from "@/hooks/queries";
import { Logo } from "./logo";
import { useSessionUser } from "./session-context";
import { UserMenu } from "./user-menu";
import type { Role } from "@/generated/prisma/enums";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: "inbox";
  match?: (path: string) => boolean;
}

function navFor(role: Role): { main: NavItem[]; secondary: NavItem[] } {
  if (role === "DIRECTOR") {
    return {
      main: [
        { href: "/board", label: "Priority Board", icon: LayoutGrid },
        { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" },
        { href: "/tasks", label: "Úkoly týmu", icon: ClipboardList },
        { href: "/my-tasks", label: "Moje úkoly", icon: ListChecks },
        { href: "/team", label: "Tým", icon: Users },
        { href: "/calendar", label: "Kalendář", icon: CalendarDays },
        { href: "/assistant", label: "AI Asistent", icon: Sparkles },
      ],
      secondary: [{ href: "/settings", label: "Nastavení", icon: Settings, match: (p) => p.startsWith("/settings") }],
    };
  }
  if (role === "ADMIN") {
    return {
      main: [
        { href: "/settings/users", label: "Uživatelé", icon: UserCog },
        { href: "/settings/integrations", label: "Integrace", icon: Plug },
        { href: "/settings/ai", label: "AI a náklady", icon: Bot },
        { href: "/settings/audit", label: "Audit log", icon: ScrollText },
        { href: "/settings/privacy", label: "Ochrana dat", icon: ShieldCheck },
      ],
      secondary: [{ href: "/settings/profile", label: "Můj profil", icon: Settings }],
    };
  }
  return {
    main: [
      { href: "/my-tasks", label: "Moje úkoly", icon: ListChecks },
      { href: "/inbox", label: "Zprávy", icon: Inbox, badge: "inbox" },
      { href: "/calendar", label: "Kalendář", icon: CalendarDays },
      { href: "/assistant", label: "AI Asistent", icon: Sparkles },
    ],
    secondary: [{ href: "/settings", label: "Nastavení", icon: Settings, match: (p) => p.startsWith("/settings") }],
  };
}

function NavLink({ item, active, count, onNavigate }: { item: NavItem; active: boolean; count?: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />}
      <Icon className={cn("size-[18px]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
      <span className="flex-1">{item.label}</span>
      {count ? (
        <span className="min-w-5 rounded-full bg-primary px-1.5 py-px text-center text-[11px] font-semibold text-primary-foreground">{count > 99 ? "99+" : count}</span>
      ) : null}
    </Link>
  );
}

function AIStatusCard() {
  const user = useSessionUser();
  const online = user.aiMode === "claude";
  return (
    <Link href="/assistant" className="ai-surface block rounded-xl border border-ai-border p-3 transition hover:shadow-card">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <Sparkles className="size-4 text-ai" />
        <span>AI asistent</span>
        <span className={cn("ml-auto inline-flex items-center gap-1 text-[11px] font-medium", online ? "text-p4" : "text-muted-foreground")}>
          <span className={cn("size-1.5 rounded-full", online ? "bg-p4" : "bg-p5")} />
          {online ? "Online" : "Offline režim"}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
        {online ? `Model ${user.aiModel.replace("claude-", "").replace(/-/g, " ")} · nic neodesílá sám` : "Heuristiky bez API klíče · návrhy stále fungují"}
      </p>
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useSessionUser();
  const pathname = usePathname();
  const nav = navFor(user.role);
  const showInbox = user.role !== "ADMIN";
  const unread = useMessages({ view: "unread", limit: 1 });
  const inboxCount = showInbox ? unread.data?.counts.unread : undefined;
  const isActive = (item: NavItem) => (item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/"));

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 scrollbar-thin" aria-label="Hlavní navigace">
        {nav.main.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item)} count={item.badge === "inbox" ? inboxCount : undefined} onNavigate={onNavigate} />
        ))}
        <div className="my-3 h-px bg-border" />
        {nav.secondary.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item)} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="space-y-3 p-3">
        {user.role !== "ADMIN" && <AIStatusCard />}
        <UserMenu />
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-sidebar lg:block">
      <SidebarContent />
    </aside>
  );
}
