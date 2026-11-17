import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Visual marker for AI-generated content (sparkle + gradient). */
export function AILabel({ children = "AI shrnutí", className, offline }: { children?: React.ReactNode; className?: string; offline?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", className)}>
      <Sparkles className="size-3.5 text-ai" />
      <span className="text-gradient-ai">{children}</span>
      {offline && <span className="rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground">offline</span>}
    </span>
  );
}

export function AISparkleIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex size-7 items-center justify-center rounded-lg bg-gradient-ai text-white shadow-sm shadow-ai/30", className)}>
      <Sparkles className="size-4" />
    </span>
  );
}
