import { z } from "zod";

/**
 * Structured-output schemas. Kept deliberately permissive (no numeric bounds or
 * array limits that the model could violate); results are normalised afterwards.
 */

export const messageAnalysisSchema = z.object({
  summary: z.string().describe("1–2 sentences in Czech: what the sender wants and key constraints"),
  intent: z.string().describe("Short Czech label of the sender's intent (max ~6 words)"),
  topics: z.array(z.string()).describe("1–5 short Czech keywords"),
  sentiment: z.enum(["positive", "neutral", "concerned", "negative", "urgent"]),
  suggestedPriority: z.number().describe("1 = P1 critical … 5 = P5 later/informational"),
  priorityReason: z.string().describe("One short Czech sentence justifying the priority"),
  deadline: z.string().nullable().describe("Most important deadline as ISO 8601 with offset, or null"),
  deadlines: z.array(z.object({ date: z.string().describe("ISO 8601 with offset"), label: z.string() })),
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      deadline: z.string().nullable(),
      priority: z.number(),
      suggestedAssigneeId: z.string().nullable(),
    }),
  ),
  replies: z.array(z.object({ label: z.string(), text: z.string() })),
  needsReply: z.boolean(),
  clientName: z.string().nullable(),
});
export type MessageAnalysisRaw = z.infer<typeof messageAnalysisSchema>;

export const briefingSchema = z.object({
  greeting: z.string(),
  summary: z.string(),
  focus: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      priority: z.number(),
      itemType: z.enum(["task", "message"]),
      itemId: z.string(),
    }),
  ),
  risks: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      itemType: z.enum(["task", "message"]).nullable(),
      itemId: z.string().nullable(),
    }),
  ),
  teamNotes: z.array(z.string()),
  suggestedAssignments: z.array(
    z.object({
      title: z.string(),
      reason: z.string(),
      priority: z.number(),
      itemType: z.enum(["task", "message"]),
      itemId: z.string(),
      assigneeId: z.string().nullable(),
    }),
  ),
  suggestedReplies: z.array(z.object({ messageId: z.string(), label: z.string(), text: z.string() })),
});
export type BriefingRaw = z.infer<typeof briefingSchema>;

export const replyDraftSchema = z.object({
  text: z.string().describe("The full reply text in Czech"),
});
