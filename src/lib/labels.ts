/** Czech UI labels for enums (isomorphic). */
import type { Channel, MessageStatus, Role, TaskStatus } from "@/generated/prisma/enums";

export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  UNREAD: "Nepřečtená",
  WAITING_REPLY: "Čeká na odpověď",
  ASSIGNED: "Přiřazena",
  RESOLVED: "Vyřízena",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: "Nový",
  IN_PROGRESS: "V řešení",
  WAITING: "Čeká na klienta",
  DONE: "Hotovo",
};

export const TASK_STATUS_ORDER: TaskStatus[] = ["NEW", "IN_PROGRESS", "WAITING", "DONE"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  SMS: "SMS",
  IMESSAGE: "iMessage",
  INTERNAL: "Interní",
};

export const ROLE_LABELS: Record<Role, string> = {
  DIRECTOR: "Ředitel",
  ADVISOR: "Poradce",
  ADMIN: "Administrátor",
};
