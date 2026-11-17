/** API input schemas (isomorphic – shared by route handlers and forms). */
import { z } from "zod";

const id = z.string().min(1).max(64);
const priority = z.number().int().min(1).max(5);
const isoDate = z.iso.datetime({ offset: true });
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

// ─── Tasks ──────────────────────────────────────────────────────────────────

export const taskListQuerySchema = z.object({
  scope: z.enum(["mine", "all", "created"]).default("mine"),
  assigneeId: id.optional(),
  status: z.enum(["open", "all", "NEW", "IN_PROGRESS", "WAITING", "DONE"]).default("open"),
  maxPriority: z.coerce.number().int().min(1).max(5).optional(),
  overdue: z.enum(["true", "false"]).optional(),
  attention: z.enum(["true", "false"]).optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(["priority", "deadline", "created", "updated"]).default("priority"),
  limit: z.coerce.number().int().min(1).max(300).default(150),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskCreateSchema = z.object({
  title: z.string().trim().min(2, "Název je příliš krátký").max(200),
  description: optionalText(5000),
  clientName: optionalText(200),
  priority: priority.default(3),
  deadline: isoDate.optional().nullable(),
  remindInDays: z.number().int().min(1).max(365).optional().nullable(),
  assigneeIds: z.array(id).max(10).default([]),
  sourceMessageId: id.optional().nullable(),
  comment: optionalText(500),
  autoEscalate: z.boolean().default(true),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    description: optionalText(5000),
    clientName: optionalText(200),
    status: z.enum(["NEW", "IN_PROGRESS", "WAITING", "DONE"]).optional(),
    priority: priority.optional(),
    keepEscalation: z.boolean().optional(),
    priorityReason: z.string().trim().max(300).optional(),
    deadline: isoDate.nullable().optional(),
    remindAt: isoDate.nullable().optional(),
    autoEscalate: z.boolean().optional(),
    assigneeIds: z.array(id).min(1).max(10).optional(),
    needsDirectorAttention: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nic ke změně.");
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1, "Komentář je prázdný").max(4000),
});

export const escalateSchema = z.object({
  note: z.string().trim().min(3, "Napište, s čím potřebujete pomoct").max(1000),
});

// ─── Messages ───────────────────────────────────────────────────────────────

export const messageListQuerySchema = z.object({
  view: z.enum(["all", "unread", "waiting", "high", "assigned", "resolved", "starred", "mine"]).default("all"),
  channel: z.enum(["EMAIL", "WHATSAPP", "SMS", "IMESSAGE", "INTERNAL", "ALL"]).default("ALL"),
  maxPriority: z.coerce.number().int().min(1).max(5).optional(),
  assigneeId: id.optional(),
  q: z.string().max(200).optional(),
  sort: z.enum(["newest", "oldest", "priority"]).default("newest"),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type MessageListQuery = z.infer<typeof messageListQuerySchema>;

export const messageUpdateSchema = z
  .object({
    status: z.enum(["UNREAD", "WAITING_REPLY", "ASSIGNED", "RESOLVED"]).optional(),
    priority: priority.optional(),
    keepEscalation: z.boolean().optional(),
    priorityReason: z.string().trim().max(300).optional(),
    starred: z.boolean().optional(),
    assigneeId: id.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nic ke změně.");
export type MessageUpdateInput = z.infer<typeof messageUpdateSchema>;

export const replySchema = z.object({
  text: z.string().trim().min(1, "Odpověď je prázdná").max(20_000),
  resolve: z.boolean().default(true),
});

export const assignMessageSchema = z.object({
  assigneeIds: z.array(id).min(1, "Vyberte poradce").max(10),
  title: z.string().trim().min(2).max(200),
  description: optionalText(5000),
  priority: priority,
  deadline: isoDate.optional().nullable(),
  comment: optionalText(500),
});
export type AssignMessageInput = z.infer<typeof assignMessageSchema>;

export const draftReplySchema = z.object({
  instruction: z.string().trim().max(500).optional(),
  draft: z.string().max(20_000).optional(),
});

// ─── Calendar ───────────────────────────────────────────────────────────────

export const calendarQuerySchema = z.object({
  from: isoDate,
  to: isoDate,
  userId: id.optional(),
});

export const calendarEventCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: optionalText(2000),
    location: optionalText(300),
    startAt: isoDate,
    endAt: isoDate,
    allDay: z.boolean().default(false),
    taskId: id.optional().nullable(),
    syncTo: z.enum(["LOCAL", "GOOGLE", "MICROSOFT"]).default("LOCAL"),
  })
  .refine((v) => new Date(v.endAt) >= new Date(v.startAt), { message: "Konec musí být po začátku", path: ["endAt"] });

// ─── AI ─────────────────────────────────────────────────────────────────────

export const chatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  context: z
    .object({
      taskId: id.optional(),
      messageId: id.optional(),
    })
    .optional(),
});

// ─── Users & settings ───────────────────────────────────────────────────────

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["DIRECTOR", "ADVISOR", "ADMIN"]),
  title: optionalText(120),
  phone: optionalText(40),
  capacity: z.number().int().min(1).max(100).default(10),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(200),
});

export const userUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(["DIRECTOR", "ADVISOR", "ADMIN"]).optional(),
    title: optionalText(120),
    phone: optionalText(40),
    capacity: z.number().int().min(1).max(100).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nic ke změně.");

export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    title: optionalText(120),
    phone: optionalText(40),
    currentPassword: z.string().max(200).optional(),
    newPassword: z.string().min(8, "Heslo musí mít alespoň 8 znaků").max(200).optional(),
  })
  .refine((v) => !v.newPassword || v.currentPassword, { message: "Zadejte současné heslo", path: ["currentPassword"] });

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(4).max(200) }),
});

export const eraseContactSchema = z.object({
  contact: z.string().trim().min(3).max(200),
  confirm: z.boolean().optional(),
});

export const whatsappConfigSchema = z.object({
  phoneNumberId: z.string().trim().min(3).max(64),
  displayPhone: z.string().trim().min(3).max(40),
  accessToken: z.string().trim().min(10).max(2000).optional(),
});
