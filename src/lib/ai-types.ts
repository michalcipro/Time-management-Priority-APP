/** Shapes of AI outputs stored in JSON columns (isomorphic, shared by UI, API and seed). */

export interface AIReplySuggestion {
  label: string;
  text: string;
}

export interface AITaskSuggestion {
  title: string;
  description?: string | null;
  /** ISO 8601 */
  deadline?: string | null;
  priority?: number | null;
  suggestedAssigneeId?: string | null;
}

export interface AIDeadline {
  /** ISO 8601 */
  date: string;
  label: string;
}

export type AISentiment = "positive" | "neutral" | "concerned" | "negative" | "urgent";

export interface BriefingFocusItem {
  title: string;
  reason: string;
  priority: number;
  itemType: "task" | "message";
  itemId: string;
}

export interface BriefingRisk {
  title: string;
  detail: string;
  itemType?: "task" | "message" | null;
  itemId?: string | null;
}

export interface BriefingAssignmentSuggestion {
  title: string;
  reason: string;
  priority: number;
  itemType: "task" | "message";
  itemId: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface BriefingReplySuggestion {
  messageId: string;
  label: string;
  text: string;
}

export interface BriefingContent {
  greeting: string;
  summary: string;
  focus: BriefingFocusItem[];
  risks: BriefingRisk[];
  teamNotes: string[];
  suggestedAssignments: BriefingAssignmentSuggestion[];
  suggestedReplies: BriefingReplySuggestion[];
}

export interface BriefingStats {
  critical: number;
  escalated: number;
  waitingMessages: number;
  overdue: number;
  dueToday: number;
  openTasks: number;
}
