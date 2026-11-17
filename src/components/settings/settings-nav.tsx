"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bot, Gauge, Plug, ScrollText, ShieldCheck, UserCog, UserRound } from "lucide-react";
import { useSessionUser } from "@/components/layout/session-context";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ITEMS: { href: string; label: string; icon: typeof Bell; permission?: Permission; hideFor?: string[] }[] = [
  { href: "/settings/profile", label: "Profil", icon: UserRound },
  { href: "/settings/notifications", label: "Notifikace", icon: Bell },
  { href: "/settings/integrations", label: "Integrace", icon: Plug },
  { href: "/settings/rules", label: "Pravidla priorit", icon: Gauge, permission: "rules:manage" },
  { href: "/settings/ai", label: "AI a náklady", icon: Bot, permission: "ai:configure" },
  { href: "/settings/users", label: "Uživatelé", icon: UserCog, permission: "users:manage" },
  { href: "/settings/privacy", label: "Ochrana dat (GDPR)", icon: ShieldCheck },
  { href: "/settings/audit", label: "Audit log", icon: ScrollText, permission: "audit:view" },
];

export function SettingsNav() {
  const pathname = usePathname();
  const user = useSessionUser();
  const items = ITEMS.filter((i) => !i.permission || can(user.role, i.permission));
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 scrollbar-thin lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label="Nastavení">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
              active ? "bg-card text-foreground shadow-card ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <i.icon className={cn("size-4", active ? "text-primary" : "")} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsSection({ title, description, children, actions }: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
