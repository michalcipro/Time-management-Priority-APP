"use client";
import { Clock3, Flame, Layers, Leaf, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { priorityMeta, type PriorityLevel } from "@/lib/priority";

export const PRIORITY_ICONS: Record<PriorityLevel, LucideIcon> = { 1: Flame, 2: Zap, 3: Clock3, 4: Leaf, 5: Layers };

/** Tailwind class bundles per priority (kept static so Tailwind can see them). */
export const PRIORITY_STYLES: Record<PriorityLevel, { text: string; bg: string; soft: string; border: string; dot: string; bar: string; ring: string }> = {
  1: { text: "text-p1", bg: "bg-p1", soft: "bg-p1-soft", border: "border-p1-border", dot: "bg-p1", bar: "before:bg-p1", ring: "ring-p1/30" },
  2: { text: "text-p2", bg: "bg-p2", soft: "bg-p2-soft", border: "border-p2-border", dot: "bg-p2", bar: "before:bg-p2", ring: "ring-p2/30" },
  3: { text: "text-p3-text", bg: "bg-p3", soft: "bg-p3-soft", border: "border-p3-border", dot: "bg-p3", bar: "before:bg-p3", ring: "ring-p3/30" },
  4: { text: "text-p4", bg: "bg-p4", soft: "bg-p4-soft", border: "border-p4-border", dot: "bg-p4", bar: "before:bg-p4", ring: "ring-p4/30" },
  5: { text: "text-p5", bg: "bg-p5", soft: "bg-p5-soft", border: "border-p5-border", dot: "bg-p5", bar: "before:bg-p5", ring: "ring-p5/30" },
};

const lvl = (p: number) => priorityMeta(p).level;

/** "P1" pill – solid code chip + optional label. */
export function PriorityBadge({ priority, showLabel = true, size = "md", className }: { priority: number; showLabel?: boolean; size?: "sm" | "md"; className?: string }) {
  const meta = priorityMeta(priority);
  const s = PRIORITY_STYLES[meta.level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-semibold", size === "sm" ? "text-[11px]" : "text-xs", className)}>
      <span className={cn("rounded-[5px] px-1.5 py-px text-white", s.bg, meta.level === 3 && "text-amber-950", size === "sm" ? "text-[10px]" : "text-[11px]")}>{meta.code}</span>
      {showLabel && <span className={cn("uppercase tracking-wide", s.text)}>{meta.tag}</span>}
    </span>
  );
}

export function PriorityIcon({ priority, className }: { priority: number; className?: string }) {
  const level = lvl(priority);
  const Icon = PRIORITY_ICONS[level];
  return <Icon className={cn("size-4", PRIORITY_STYLES[level].text, level === 1 && "fill-current/20", className)} aria-label={priorityMeta(level).label} />;
}

export function PriorityDot({ priority, className, pulse }: { priority: number; className?: string; pulse?: boolean }) {
  const level = lvl(priority);
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", PRIORITY_STYLES[level].dot, pulse && level === 1 && "animate-pulse-ring", className)} />;
}

/** Text label with coloured dot ("● Vysoká"). */
export function PriorityLabel({ priority, className }: { priority: number; className?: string }) {
  const meta = priorityMeta(priority);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", PRIORITY_STYLES[meta.level].text, className)}>
      <PriorityDot priority={meta.level} />
      {meta.label}
    </span>
  );
}

/** Five coloured flags (Assign dialog, task detail). */
export function PriorityPicker({ value, onChange, disabled, size = "md" }: { value: number; onChange: (p: PriorityLevel) => void; disabled?: boolean; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label="Priorita" className="grid grid-cols-5 gap-1.5">
      {([1, 2, 3, 4, 5] as PriorityLevel[]).map((p) => {
        const meta = priorityMeta(p);
        const s = PRIORITY_STYLES[p];
        const Icon = PRIORITY_ICONS[p];
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(p)}
            className={cn(
              "group flex flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-center transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50",
              size === "sm" ? "py-1.5" : "py-2",
              active ? cn(s.soft, s.border, "ring-2 shadow-sm", s.ring) : "border-border bg-card hover:bg-muted/60",
            )}
          >
            <span className="flex items-center gap-1">
              <Icon className={cn("size-3.5", s.text)} />
              <span className={cn("text-xs font-bold", s.text)}>{meta.code}</span>
            </span>
            {size === "md" && <span className={cn("text-[11px] leading-tight", active ? s.text : "text-muted-foreground")}>{meta.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
