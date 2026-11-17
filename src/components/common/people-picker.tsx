"use client";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/lib/dto";
import { ROLE_LABELS } from "@/lib/labels";

/** Multi-select of team members with avatar, title and current workload. */
export function PeoplePicker({
  members,
  value,
  onChange,
  placeholder = "Vyberte poradce",
  disabled,
}: {
  members: TeamMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = members.filter((m) => value.includes(m.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const eligible = members.filter((m) => m.role !== "ADMIN" && m.isActive);

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-input bg-card px-2.5 py-1.5 text-left shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-50"
        >
          {selected.length === 0 ? (
            <span className="flex-1 px-1 text-sm text-muted-foreground">{placeholder}</span>
          ) : selected.length === 1 ? (
            <span className="flex flex-1 items-center gap-2.5">
              <Avatar name={selected[0].name} color={selected[0].avatarColor} size="sm" />
              <span className="leading-tight">
                <span className="block text-sm font-medium">{selected[0].name}</span>
                <span className="block text-xs text-muted-foreground">{selected[0].title ?? ROLE_LABELS[selected[0].role]}</span>
              </span>
            </span>
          ) : (
            <span className="flex flex-1 flex-wrap gap-1.5">
              {selected.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs font-medium">
                  <Avatar name={m.name} color={m.avatarColor} size="xs" />
                  {m.name}
                </span>
              ))}
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-72 p-1.5">
        {eligible.map((m) => {
          const active = value.includes(m.id);
          const load = Math.round((m.openTasks / Math.max(1, m.capacity)) * 100);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              className={cn("flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted", active && "bg-primary/5")}
            >
              <Avatar name={m.name} color={m.avatarColor} size="sm" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {m.name}
                  {m.role === "DIRECTOR" && <ShieldCheck className="size-3.5 text-primary" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{m.title ?? ROLE_LABELS[m.role]}</span>
              </span>
              <span className={cn("text-[11px] font-medium", load >= 90 ? "text-p1" : load >= 70 ? "text-p2" : "text-muted-foreground")}>
                {m.openTasks} úkolů
              </span>
              <span className={cn("flex size-4 items-center justify-center rounded border", active ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                {active && <Check className="size-3" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
