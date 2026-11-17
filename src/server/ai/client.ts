import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { AIJobKind, AILogStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { estimateCostUsd, type AIModelId } from "@/lib/settings";
import { env } from "../env";
import { withSystem } from "../db";

/**
 * Claude API access.
 *
 * - Models: Claude Haiku 5.5 (default, cheapest), Sonnet 5.5 or Opus 5.5 – chosen
 *   per team in Settings → AI.
 * - All calls go through the beta Messages API so we can opt into server-side
 *   refusal fallbacks (`fallbacks: "default"`); on models without fallback support
 *   the request simply runs on the requested model.
 * - Thinking stays adaptive (the default on these models); depth is controlled with
 *   `output_config.effort`.
 * - Every call is recorded in AILog (tokens, cost, latency) for audit and cost tracking.
 */

export class AIUnavailableError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not configured");
  }
}

export class AIRefusalError extends Error {}

const BETAS = ["server-side-fallback-2026-07-01"] as const;

const g = globalThis as unknown as { __anthropic?: Anthropic };

export function getAnthropic(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  if (!g.__anthropic) g.__anthropic = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 120_000 });
  return g.__anthropic;
}

export function aiAvailable(): boolean {
  return Boolean(env.anthropicApiKey);
}

export interface AILogInput {
  kind: AIJobKind;
  model: string;
  status: AILogStatus;
  teamId: string;
  userId?: string | null;
  messageId?: string | null;
  taskId?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  latencyMs?: number;
  error?: string | null;
  output?: unknown;
}

export async function logAI(entry: AILogInput): Promise<void> {
  try {
    await withSystem((db) =>
      db.aILog.create({
        data: {
          teamId: entry.teamId,
          userId: entry.userId ?? null,
          kind: entry.kind,
          model: entry.model,
          status: entry.status,
          inputTokens: entry.inputTokens ?? 0,
          outputTokens: entry.outputTokens ?? 0,
          cacheReadTokens: entry.cacheReadTokens ?? 0,
          costUsd: estimateCostUsd(entry.model, entry.inputTokens ?? 0, entry.outputTokens ?? 0, entry.cacheReadTokens ?? 0),
          latencyMs: entry.latencyMs ?? 0,
          messageId: entry.messageId ?? null,
          taskId: entry.taskId ?? null,
          error: entry.error?.slice(0, 1000) ?? null,
          output: (entry.output ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  } catch (err) {
    console.error("[ai] failed to write AILog", err);
  }
}

export interface StructuredCall<T> {
  kind: AIJobKind;
  model: AIModelId;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  teamId: string;
  userId?: string | null;
  messageId?: string | null;
  taskId?: string | null;
}

/** One structured-output request (JSON validated against a Zod schema). */
export async function callStructured<T>(call: StructuredCall<T>): Promise<{ data: T; model: string }> {
  const anthropic = getAnthropic();
  if (!anthropic) throw new AIUnavailableError();
  const started = Date.now();
  try {
    const response = await anthropic.beta.messages.parse({
      model: call.model,
      max_tokens: call.maxTokens ?? 16_000,
      betas: [...BETAS],
      fallbacks: "default",
      system: [{ type: "text", text: call.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: call.prompt }],
      output_config: { effort: call.effort ?? "low", format: betaZodOutputFormat(call.schema) },
    });

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    };

    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unknown";
      await logAI({ ...call, model: response.model, status: "ERROR", ...usage, latencyMs: Date.now() - started, error: `refusal: ${category}` });
      throw new AIRefusalError(`Model declined the request (${category})`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Structured output was truncated (max_tokens)");
    }
    const data = response.parsed_output;
    if (!data) throw new Error("Structured output missing");

    await logAI({ ...call, model: response.model, status: "SUCCESS", ...usage, latencyMs: Date.now() - started, output: data });
    return { data, model: response.model };
  } catch (err) {
    if (!(err instanceof AIRefusalError)) {
      const message =
        err instanceof Anthropic.APIError ? `${err.status ?? ""} ${err.message}` : err instanceof Error ? err.message : String(err);
      await logAI({ ...call, status: "ERROR", latencyMs: Date.now() - started, error: message });
    }
    throw err;
  }
}

/** Human-friendly description of an AI error for the UI. */
export function describeAIError(err: unknown): string {
  if (err instanceof AIUnavailableError) return "AI není nakonfigurováno (chybí ANTHROPIC_API_KEY) – použit offline režim.";
  if (err instanceof AIRefusalError) return "Model požadavek odmítl zpracovat.";
  if (err instanceof Anthropic.RateLimitError) return "AI je dočasně přetížené (limit požadavků). Zkuste to za chvíli.";
  if (err instanceof Anthropic.AuthenticationError) return "Neplatný API klíč pro Claude.";
  if (err instanceof Anthropic.APIConnectionError) return "Nepodařilo se spojit s AI službou.";
  if (err instanceof Anthropic.APIError) return `Chyba AI služby (${err.status ?? "?"}).`;
  return "Zpracování AI selhalo.";
}
