"use client";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { endOfLocalDayInDays, fromLocalDateTime, toDateTimeLocalValue } from "@/lib/format";

const PRESETS: { label: string; days: number }[] = [
  { label: "Dnes", days: 0 },
  { label: "Zítra", days: 1 },
  { label: "Za 3 dny", days: 3 },
  { label: "Za týden", days: 7 },
  { label: "Za 30 dní", days: 30 },
];

/** Date-time input (app timezone) with quick presets. Value = ISO string or null. */
export function DeadlineInput({ value, onChange, allowEmpty = true }: { value: string | null; onChange: (iso: string | null) => void; allowEmpty?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="datetime-local"
          value={toDateTimeLocalValue(value)}
          onChange={(e) => {
            const d = e.target.value ? fromLocalDateTime(e.target.value) : null;
            onChange(d ? d.toISOString() : null);
          }}
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-9 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 dark:[color-scheme:dark]"
        />
        {allowEmpty && value && (
          <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Zrušit termín">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const iso = endOfLocalDayInDays(p.days).toISOString();
          const active = value && toDateTimeLocalValue(value).slice(0, 10) === toDateTimeLocalValue(iso).slice(0, 10);
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(iso)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
