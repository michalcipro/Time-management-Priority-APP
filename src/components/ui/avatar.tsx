import { cn, colorFor, initials } from "@/lib/utils";

interface AvatarProps {
  name: string | null | undefined;
  color?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  ring?: boolean;
}

const SIZES = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm" };

/** Initials avatar with a stable per-person colour. */
export function Avatar({ name, color, size = "md", className, ring }: AvatarProps) {
  const bg = color ?? colorFor(name ?? "");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white",
        SIZES[size],
        ring && "ring-2 ring-card",
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${bg}, color-mix(in oklch, ${bg} 70%, black))` }}
      title={name ?? undefined}
      aria-hidden={!name}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = "sm" }: { people: { id: string; name: string; avatarColor?: string | null }[]; max?: number; size?: AvatarProps["size"] }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.avatarColor} size={size} ring />
      ))}
      {rest > 0 && (
        <span className={cn("inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-card", SIZES[size ?? "sm"])}>
          +{rest}
        </span>
      )}
    </span>
  );
}
