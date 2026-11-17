"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/labels";
import { useSessionUser } from "./session-context";

export function UserMenu() {
  const user = useSessionUser();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left shadow-xs transition hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          <Avatar name={user.name} color={user.avatarColor} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold">{user.name}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">{user.title ?? ROLE_LABELS[user.role]}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-60">
        <DropdownMenuLabel>
          <div className="text-[13px] font-semibold text-foreground">{user.name}</div>
          <div className="truncate font-normal">{user.email}</div>
          <div className="mt-1 inline-flex rounded bg-primary/10 px-1.5 py-px text-[10.5px] font-semibold text-primary">{ROLE_LABELS[user.role]} · {user.teamName}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <UserRound /> Můj profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/notifications">
            <Settings /> Nastavení notifikací
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Vzhled</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light">
            <Sun className="size-4 text-muted-foreground" /> Světlý
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon className="size-4 text-muted-foreground" /> Tmavý
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor className="size-4 text-muted-foreground" /> Podle systému
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut({ redirect: false });
            router.replace("/login");
            router.refresh();
          }}
          destructive
        >
          <LogOut /> Odhlásit se
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
