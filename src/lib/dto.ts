/**
 * Data transfer objects returned by the API (dates are ISO strings).
 * Isomorphic – imported by client components.
 */
import type {
  AIProcessingStatus,
  Channel,
  MessageDirection,
  MessageStatus,
  PriorityChangeSource,
  Role,
  TaskStatus,
  NotificationType,
  IntegrationType,
  IntegrationStatus,
  CalendarProvider,
} from "@/generated/prisma/enums";
import type { AIDeadline, AIReplySuggestion, AITaskSuggestion, AISentiment, BriefingContent, BriefingStats } from "./ai-types";

export interface UserRef {
  id: string;
  name: string;
  title: string | null;
  avatarColor: string | null;
  role: Role;
}

export interface TeamMember extends UserRef {
  email: string;
  capacity: number;
  isActive: boolean;
  openTasks: number;
}

export interface TaskListItem {
  id: string;
  title: string;
  description: string | null;
  clientName: string | null;
  status: TaskStatus;
  priority: number;
  basePriority: number;
  autoEscalate: boolean;
  escalated: boolean;
  deadline: string | null;
  remindAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  needsDirectorAttention: boolean;
  assignedByDirector: boolean;
  creator: UserRef;
  assignees: UserRef[];
  commentCount: number;
  sourceMessage: { id: string; channel: Channel; senderName: string | null; subject: string | null } | null;
}

export interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  author: UserRef;
}

export interface PriorityHistoryDTO {
  id: string;
  oldPriority: number | null;
  newPriority: number;
  reason: string;
  source: PriorityChangeSource;
  createdAt: string;
  changedBy: UserRef | null;
}

export interface TaskPermissions {
  canEdit: boolean;
  canChangeStatus: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canOverridePriority: boolean;
  canComment: boolean;
  canEscalate: boolean;
}

export interface TaskDetail extends TaskListItem {
  comments: CommentDTO[];
  history: PriorityHistoryDTO[];
  source: {
    id: string;
    channel: Channel;
    senderName: string | null;
    senderContact: string;
    subject: string | null;
    preview: string;
    aiSummary: string | null;
    receivedAt: string;
  } | null;
  permissions: TaskPermissions;
}

export interface MessageListItem {
  id: string;
  channel: Channel;
  direction: MessageDirection;
  senderName: string | null;
  senderContact: string;
  subject: string | null;
  preview: string;
  receivedAt: string;
  status: MessageStatus;
  priority: number;
  basePriority: number;
  escalated: boolean;
  starred: boolean;
  aiStatus: AIProcessingStatus;
  aiSummary: string | null;
  aiSentiment: AISentiment | null;
  owner: UserRef | null;
  assignee: UserRef | null;
  hasAttachments: boolean;
  waitingDays: number;
  openTaskCount: number;
}

export interface ThreadMessageDTO {
  id: string;
  direction: MessageDirection;
  channel: Channel;
  senderName: string | null;
  content: string;
  receivedAt: string;
}

export interface MessageDetail extends MessageListItem {
  content: string;
  recipient: string | null;
  attachments: { name: string; size: number; mimeType: string }[];
  autoEscalate: boolean;
  aiIntent: string | null;
  aiTopics: string[];
  aiSuggestedPriority: number | null;
  aiPriorityReason: string | null;
  aiDeadline: string | null;
  aiTasks: AITaskSuggestion[];
  aiDeadlines: AIDeadline[];
  aiReplies: AIReplySuggestion[];
  aiModel: string | null;
  aiProcessedAt: string | null;
  readAt: string | null;
  repliedAt: string | null;
  resolvedAt: string | null;
  thread: ThreadMessageDTO[];
  tasks: { id: string; title: string; status: TaskStatus; priority: number; deadline: string | null; assignees: UserRef[] }[];
  history: PriorityHistoryDTO[];
  reply: { canSend: boolean; via: string; note: string | null };
  permissions: { canAssign: boolean; canReply: boolean; canChangePriority: boolean };
}

export interface MessageCounts {
  all: number;
  unread: number;
  waiting: number;
  highPriority: number;
  assigned: number;
  resolved: number;
  byChannel: Record<Channel, number>;
}

export interface BoardItem {
  kind: "task" | "message";
  id: string;
  title: string;
  summary: string | null;
  priority: number;
  basePriority: number;
  escalated: boolean;
  deadline: string | null;
  createdAt: string;
  status: string;
  channel: Channel | null;
  people: UserRef[];
  clientName: string | null;
  needsDirectorAttention: boolean;
  aiGenerated: boolean;
}

export interface BoardData {
  items: BoardItem[];
  counts: Record<1 | 2 | 3 | 4 | 5, number>;
  stats: BriefingStats;
}

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  priority: number | null;
  readAt: string | null;
  createdAt: string;
}

export interface WorkloadMember {
  user: UserRef & { email: string; capacity: number };
  open: number;
  byPriority: Record<1 | 2 | 3 | 4 | 5, number>;
  overdue: number;
  dueThisWeek: number;
  waiting: number;
  doneLast7Days: number;
  utilization: number;
  attention: number;
}

export interface TeamOverview {
  members: WorkloadMember[];
  overdue: TaskListItem[];
  attention: TaskListItem[];
  totals: { open: number; overdue: number; critical: number; doneLast7Days: number };
}

export interface CalendarItem {
  id: string;
  kind: "event" | "deadline" | "external";
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  priority: number | null;
  provider: CalendarProvider | "TASK";
  taskId: string | null;
  owner: UserRef | null;
}

export interface IntegrationDTO {
  id: string;
  type: IntegrationType;
  status: IntegrationStatus;
  displayName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  owner: UserRef | null;
  config: Record<string, unknown>;
  webhookUrl: string | null;
  webhookToken: string | null;
  createdAt: string;
}

export interface BriefingDTO {
  id: string;
  day: string;
  content: BriefingContent;
  stats: BriefingStats;
  model: string;
  createdAt: string;
}

export interface AssistantMessageDTO {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

export interface SearchResults {
  messages: MessageListItem[];
  tasks: TaskListItem[];
}
