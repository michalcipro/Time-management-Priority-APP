import type { Channel } from "@/generated/prisma/enums";

/** Provider-independent message shape every channel is normalised into. */
export interface NormalizedMessage {
  channel: Channel;
  externalId: string;
  threadKey?: string | null;
  senderName?: string | null;
  senderContact: string;
  recipient?: string | null;
  subject?: string | null;
  content: string;
  receivedAt: Date;
  attachments?: { name: string; size: number; mimeType: string }[];
  metadata?: Record<string, unknown>;
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string | null;
  /** epoch ms */
  expiresAt: number;
  scope?: string;
}

export interface ExternalCalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  description: string | null;
}

export class IntegrationAuthError extends Error {}
