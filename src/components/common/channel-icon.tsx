import { Mail, MessageCircle, MessageSquareText, Smartphone, Building2 } from "lucide-react";
import type { Channel } from "@/generated/prisma/enums";
import { CHANNEL_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const STYLES: Record<Channel, { icon: typeof Mail; className: string }> = {
  EMAIL: { icon: Mail, className: "bg-blue-500/12 text-blue-600 dark:text-blue-400" },
  WHATSAPP: { icon: MessageCircle, className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  SMS: { icon: Smartphone, className: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  IMESSAGE: { icon: MessageSquareText, className: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  INTERNAL: { icon: Building2, className: "bg-slate-500/12 text-slate-600 dark:text-slate-300" },
};

export function ChannelIcon({ channel, size = "md", className }: { channel: Channel; size?: "sm" | "md" | "lg"; className?: string }) {
  const { icon: Icon, className: tone } = STYLES[channel];
  const box = size === "sm" ? "size-6 rounded-md" : size === "lg" ? "size-10 rounded-xl" : "size-8 rounded-lg";
  const ico = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center", box, tone, className)} title={CHANNEL_LABELS[channel]}>
      <Icon className={ico} />
    </span>
  );
}

export function ChannelTag({ channel }: { channel: Channel }) {
  const { className: tone } = STYLES[channel];
  return <span className={cn("rounded px-1.5 py-px text-[11px] font-medium", tone)}>{CHANNEL_LABELS[channel]}</span>;
}
