"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api-client";
import type {
  AssistantMessageDTO,
  BoardData,
  BriefingDTO,
  CalendarItem,
  CommentDTO,
  IntegrationDTO,
  MessageCounts,
  MessageDetail,
  MessageListItem,
  NotificationDTO,
  SearchResults,
  TaskDetail,
  TaskListItem,
  TeamMember,
  TeamOverview,
} from "@/lib/dto";
import type { MessageListQuery, TaskListQuery, TaskUpdateInput, MessageUpdateInput, AssignMessageInput, TaskCreateInput } from "@/lib/validation";
import type { TeamSettings, NotificationPrefs } from "@/lib/settings";

export const keys = {
  board: (mine?: boolean) => ["board", { mine: Boolean(mine) }] as const,
  messages: (q: Partial<MessageListQuery>) => ["messages", "list", q] as const,
  message: (id: string) => ["messages", "detail", id] as const,
  tasks: (q: Partial<TaskListQuery>) => ["tasks", "list", q] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
  team: ["team"] as const,
  members: ["team", "members"] as const,
  notifications: ["notifications"] as const,
  briefing: ["ai", "briefing"] as const,
  chat: ["ai", "chat"] as const,
  calendar: (from: string, to: string, userId?: string) => ["calendar", from, to, userId ?? "me"] as const,
  integrations: ["integrations"] as const,
  teamSettings: ["settings", "team"] as const,
  profile: ["settings", "profile"] as const,
  aiUsage: ["settings", "ai-usage"] as const,
  users: ["users"] as const,
  audit: ["audit"] as const,
  search: (q: string) => ["search", q] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export const useBoard = (mine?: boolean) => useQuery({ queryKey: keys.board(mine), queryFn: () => api.get<BoardData>(`/api/board${qs({ mine })}`) });

export const useMessages = (q: Partial<MessageListQuery>) =>
  useQuery({
    queryKey: keys.messages(q),
    queryFn: () => api.get<{ items: MessageListItem[]; counts: MessageCounts & { starred: number }; nextCursor: string | null }>(`/api/messages${qs(q as Record<string, string>)}`),
    placeholderData: keepPreviousData,
  });

export const useMessage = (id: string | null) =>
  useQuery({ queryKey: keys.message(id ?? ""), queryFn: () => api.get<MessageDetail>(`/api/messages/${id}`), enabled: Boolean(id) });

export const useTasks = (q: Partial<TaskListQuery>) =>
  useQuery({ queryKey: keys.tasks(q), queryFn: () => api.get<TaskListItem[]>(`/api/tasks${qs(q as Record<string, string>)}`), placeholderData: keepPreviousData });

export const useTask = (id: string | null) => useQuery({ queryKey: keys.task(id ?? ""), queryFn: () => api.get<TaskDetail>(`/api/tasks/${id}`), enabled: Boolean(id) });

export const useTeamOverview = (enabled = true) => useQuery({ queryKey: keys.team, queryFn: () => api.get<TeamOverview>("/api/team"), enabled });

export const useTeamMembers = () => useQuery({ queryKey: keys.members, queryFn: () => api.get<TeamMember[]>("/api/team/members"), staleTime: 60_000 });

export const useNotifications = () =>
  useQuery({ queryKey: keys.notifications, queryFn: () => api.get<{ unread: number; items: NotificationDTO[] }>("/api/notifications"), refetchInterval: 120_000 });

export const useBriefing = (enabled = true) => useQuery({ queryKey: keys.briefing, queryFn: () => api.get<{ briefing: BriefingDTO | null }>("/api/ai/briefing"), enabled });

export const useAssistantMessages = () => useQuery({ queryKey: keys.chat, queryFn: () => api.get<{ messages: AssistantMessageDTO[] }>("/api/ai/chat") });

export const useCalendar = (from: string, to: string, userId?: string) =>
  useQuery({
    queryKey: keys.calendar(from, to, userId),
    queryFn: () => api.get<{ items: CalendarItem[]; connected: string[]; errors: string[] }>(`/api/calendar${qs({ from, to, userId })}`),
    placeholderData: keepPreviousData,
  });

export const useIntegrations = () =>
  useQuery({
    queryKey: keys.integrations,
    queryFn: () =>
      api.get<{ integrations: IntegrationDTO[]; available: { google: boolean; microsoft: boolean; whatsappWebhook: boolean; twilio: boolean }; whatsappVerifyTokenSet: boolean }>("/api/integrations"),
  });

export const useTeamSettings = () =>
  useQuery({
    queryKey: keys.teamSettings,
    queryFn: () => api.get<{ name: string; settings: TeamSettings; features: Record<string, boolean | string> }>("/api/settings/team"),
  });

export const useProfile = () =>
  useQuery({
    queryKey: keys.profile,
    queryFn: () =>
      api.get<{ id: string; name: string; email: string; role: string; title: string | null; phone: string | null; capacity: number; avatarColor: string | null; notificationPrefs: NotificationPrefs; icsToken: string | null }>(
        "/api/settings/profile",
      ),
  });

export const useSearch = (q: string) =>
  useQuery({ queryKey: keys.search(q), queryFn: () => api.get<SearchResults>(`/api/search${qs({ q })}`), enabled: q.trim().length >= 2, placeholderData: keepPreviousData });

// ─── Mutations ──────────────────────────────────────────────────────────────

function useInvalidate() {
  const qc = useQueryClient();
  return (...groups: string[]) => Promise.all(groups.map((g) => qc.invalidateQueries({ queryKey: [g] })));
}

export function useUpdateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: TaskUpdateInput & { id: string }) => api.patch<TaskListItem>(`/api/tasks/${id}`, input),
    onSuccess: () => invalidate("tasks", "board", "team", "calendar"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Partial<TaskCreateInput> & { title: string }) => api.post<TaskListItem>("/api/tasks", input),
    onSuccess: () => invalidate("tasks", "board", "team", "messages", "calendar"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/tasks/${id}`),
    onSuccess: () => invalidate("tasks", "board", "team"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAddComment(taskId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: string) => api.post<CommentDTO>(`/api/tasks/${taskId}/comments`, { body }),
    onSuccess: () => invalidate("tasks"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useEscalateTask(taskId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (note: string) => api.post(`/api/tasks/${taskId}/escalate`, { note }),
    onSuccess: () => {
      toast.success("Ředitel byl upozorněn.");
      return invalidate("tasks", "board");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateMessage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: MessageUpdateInput & { id: string }) => api.patch<MessageListItem>(`/api/messages/${id}`, input),
    onSuccess: () => invalidate("messages", "board"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAssignMessage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: AssignMessageInput & { id: string }) => api.post<{ taskId: string }>(`/api/messages/${id}/assign`, input),
    onSuccess: () => invalidate("messages", "tasks", "board", "team"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useReply() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, text, resolve }: { id: string; text: string; resolve: boolean }) =>
      api.post<{ id: string; sentVia: string; manual: boolean }>(`/api/messages/${id}/reply`, { text, resolve }),
    onSuccess: () => invalidate("messages", "board"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useAnalyzeMessage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; model: string | null }>(`/api/messages/${id}/analyze`),
    onSuccess: () => invalidate("messages", "board"),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useMarkNotifications() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (ids: string[] | "all") => api.post("/api/notifications", { ids }),
    onSuccess: () => invalidate("notifications"),
  });
}

export function useSaveSettings<T>(url: string, method: "PUT" | "PATCH" = "PUT", successMessage = "Uloženo.") {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: T) => (method === "PUT" ? api.put(url, body) : api.patch(url, body)),
    onSuccess: () => {
      toast.success(successMessage);
      return invalidate("settings", "tasks", "board", "messages");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}
