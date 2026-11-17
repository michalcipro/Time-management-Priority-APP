/**
 * Typed, validated settings stored as JSON on Team.settings and User.notificationPrefs.
 * Isomorphic – the same schemas validate API input and power the settings forms.
 */
import { z } from "zod";
import { DEFAULT_PRIORITY_RULES, type PriorityRules } from "./priority";

export const AI_MODELS = [
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    description: "Nejrychlejší a nejlevnější – doporučeno pro běžný provoz.",
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: "Vyvážený model pro náročnější komunikaci a briefingy.",
    inputPerMTok: 2,
    outputPerMTok: 10,
  },
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: "Nejschopnější model – pro složité případy a analýzy.",
    inputPerMTok: 4,
    outputPerMTok: 20,
  },
] as const;

export type AIModelId = (typeof AI_MODELS)[number]["id"];
export const AI_MODEL_IDS = AI_MODELS.map((m) => m.id) as [AIModelId, ...AIModelId[]];

const level = z.number().int().min(1).max(5);

export const priorityRulesSchema = z
  .object({
    p1Hours: z.number().int().min(1).max(24 * 60).default(DEFAULT_PRIORITY_RULES.p1Hours),
    p2Hours: z.number().int().min(2).max(24 * 90).default(DEFAULT_PRIORITY_RULES.p2Hours),
    p3Hours: z.number().int().min(3).max(24 * 180).default(DEFAULT_PRIORITY_RULES.p3Hours),
    p4Hours: z.number().int().min(4).max(24 * 365).default(DEFAULT_PRIORITY_RULES.p4Hours),
    messageWaitDays: z.number().min(0.5).max(60).default(DEFAULT_PRIORITY_RULES.messageWaitDays),
    messageMaxAutoPriority: level.default(DEFAULT_PRIORITY_RULES.messageMaxAutoPriority),
    remindPriority: level.default(DEFAULT_PRIORITY_RULES.remindPriority),
    notifyAtOrAbove: level.default(DEFAULT_PRIORITY_RULES.notifyAtOrAbove),
  })
  .refine((r) => r.p1Hours < r.p2Hours && r.p2Hours < r.p3Hours && r.p3Hours < r.p4Hours, {
    message: "Prahy musí být vzestupné: P1 < P2 < P3 < P4.",
  });

export const aiSettingsSchema = z.object({
  /** Model for automatic message analysis (high volume). */
  analysisModel: z.enum(AI_MODEL_IDS).default("claude-haiku-5-5"),
  /** Model for briefings and the assistant chat. */
  assistantModel: z.enum(AI_MODEL_IDS).default("claude-haiku-5-5"),
  autoAnalyze: z.boolean().default(true),
  briefingEnabled: z.boolean().default(true),
  /** Local hour (team timezone) when the morning briefing is generated. */
  briefingHour: z.number().int().min(0).max(23).default(7),
  replyTone: z.enum(["formal", "friendly"]).default("formal"),
  signature: z.string().max(500).default(""),
  /** Context about the firm that is given to the AI (services, tone, rules). */
  firmContext: z.string().max(2000).default(""),
});

export const teamSettingsSchema = z.object({
  timezone: z.string().default("Europe/Prague"),
  priorityRules: priorityRulesSchema.prefault({}),
  ai: aiSettingsSchema.prefault({}),
});

export type TeamSettings = z.infer<typeof teamSettingsSchema>;
export type AISettings = z.infer<typeof aiSettingsSchema>;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Čas ve formátu HH:MM");

export const notificationPrefsSchema = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(true),
  push: z.boolean().default(false),
  /** E-mail only for items at this priority or more urgent. */
  emailMinPriority: level.default(2),
  /** Push only for items at this priority or more urgent. */
  pushMinPriority: level.default(1),
  quietHoursEnabled: z.boolean().default(true),
  quietStart: time.default("20:00"),
  quietEnd: time.default("07:00"),
  dailyBriefingEmail: z.boolean().default(true),
  events: z
    .object({
      taskAssigned: z.boolean().default(true),
      comments: z.boolean().default(true),
      statusChanges: z.boolean().default(true),
      escalations: z.boolean().default(true),
      deadlines: z.boolean().default(true),
      waitingMessages: z.boolean().default(true),
    })
    .prefault({}),
});

export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export function parseTeamSettings(raw: unknown): TeamSettings {
  const parsed = teamSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : teamSettingsSchema.parse({});
}

export function parseNotificationPrefs(raw: unknown): NotificationPrefs {
  const parsed = notificationPrefsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : notificationPrefsSchema.parse({});
}

export function rulesFromSettings(settings: TeamSettings): PriorityRules {
  return settings.priorityRules as PriorityRules;
}

export function modelInfo(id: string) {
  return AI_MODELS.find((m) => m.id === id) ?? AI_MODELS[0];
}

/** Rough USD cost estimate for token usage on a given model. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number, cacheReadTokens = 0): number {
  const info = modelInfo(model);
  const input = ((inputTokens + cacheReadTokens * 0.1) / 1_000_000) * info.inputPerMTok;
  const output = (outputTokens / 1_000_000) * info.outputPerMTok;
  return Math.round((input + output) * 1_000_000) / 1_000_000;
}
