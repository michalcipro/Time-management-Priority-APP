import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { IntegrationType } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import type { IntegrationDTO } from "@/lib/dto";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { forbidden, notFound } from "../errors";
import { decryptJson, encryptJson, randomToken, sha256 } from "../crypto";
import { env } from "../env";
import type { OAuthCredentials } from "../integrations/types";
import { toUserRef, userRefSelect } from "./tasks";

function webhookUrl(type: IntegrationType): string | null {
  if (type === "SMS") return `${env.appUrl}/api/webhooks/sms`;
  if (type === "WHATSAPP") return `${env.appUrl}/api/webhooks/whatsapp`;
  return null;
}

export async function listIntegrations(db: Db, user: SessionUser): Promise<IntegrationDTO[]> {
  const manageTeam = can(user.role, "integrations:manage:team");
  const rows = await db.integration.findMany({
    where: { teamId: user.teamId, ...(manageTeam ? {} : { userId: user.id }) },
    include: { user: { select: userRefSelect } },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((i) => {
    const mine = i.userId === user.id;
    const creds = i.type === "SMS" && (mine || manageTeam) ? decryptJson<{ webhookToken?: string }>(i.credentials) : null;
    const { accessToken: _hidden, ...config } = (i.config ?? {}) as Record<string, unknown>;
    return {
      id: i.id,
      type: i.type,
      status: i.status,
      displayName: i.displayName,
      lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      lastError: i.lastError,
      owner: i.user ? toUserRef(i.user) : null,
      config,
      webhookUrl: webhookUrl(i.type),
      webhookToken: creds?.webhookToken ?? null,
      createdAt: i.createdAt.toISOString(),
    };
  });
}

/** Create or rotate the personal SMS/iMessage webhook token. */
export async function upsertSmsIntegration(db: Db, user: SessionUser): Promise<{ id: string; token: string }> {
  const token = randomToken(24);
  const existing = await db.integration.findFirst({ where: { teamId: user.teamId, userId: user.id, type: "SMS" } });
  const data = {
    credentials: encryptJson({ webhookToken: token }),
    webhookTokenHash: sha256(token),
    status: "ACTIVE" as const,
    lastError: null,
  };
  const row = existing
    ? await db.integration.update({ where: { id: existing.id }, data })
    : await db.integration.create({
        data: { ...data, teamId: user.teamId, userId: user.id, type: "SMS", displayName: `Telefon – ${user.name}`, config: { source: "apple-shortcuts" } },
      });
  return { id: row.id, token };
}

export async function saveWhatsAppIntegration(
  db: Db,
  user: SessionUser,
  input: { phoneNumberId: string; displayPhone: string; accessToken?: string },
): Promise<{ id: string }> {
  if (!can(user.role, "integrations:manage:team")) throw forbidden();
  const existing = await db.integration.findFirst({ where: { teamId: user.teamId, type: "WHATSAPP" } });
  const prevCreds = decryptJson<{ accessToken?: string }>(existing?.credentials);
  const accessToken = input.accessToken ?? prevCreds?.accessToken;
  const data = {
    displayName: input.displayPhone,
    config: { phoneNumberId: input.phoneNumberId } as Prisma.InputJsonValue,
    credentials: accessToken ? encryptJson({ accessToken }) : null,
    status: accessToken ? ("ACTIVE" as const) : ("PENDING" as const),
    lastError: null,
  };
  const row = existing
    ? await db.integration.update({ where: { id: existing.id }, data })
    : await db.integration.create({ data: { ...data, teamId: user.teamId, userId: user.id, type: "WHATSAPP" } });
  return { id: row.id };
}

export async function saveOAuthIntegration(
  db: Db,
  user: SessionUser,
  type: "GOOGLE" | "MICROSOFT",
  creds: OAuthCredentials,
  email: string,
): Promise<{ id: string }> {
  const existing = await db.integration.findFirst({ where: { teamId: user.teamId, userId: user.id, type } });
  const data = {
    displayName: email,
    credentials: encryptJson(creds),
    status: "ACTIVE" as const,
    lastError: null,
    config: { scope: creds.scope ?? null } as Prisma.InputJsonValue,
  };
  const row = existing
    ? await db.integration.update({ where: { id: existing.id }, data: { ...data, syncCursor: existing.displayName === email ? existing.syncCursor : null } })
    : await db.integration.create({ data: { ...data, teamId: user.teamId, userId: user.id, type } });
  return { id: row.id };
}

export async function getIntegrationForUser(db: Db, user: SessionUser, id: string) {
  const integration = await db.integration.findFirst({ where: { id, teamId: user.teamId } });
  if (!integration) throw notFound("Integrace");
  if (integration.userId !== user.id && !can(user.role, "integrations:manage:team")) throw forbidden();
  return integration;
}

export async function disconnectIntegration(db: Db, user: SessionUser, id: string) {
  const integration = await getIntegrationForUser(db, user, id);
  await db.integration.update({
    where: { id: integration.id },
    data: { status: "DISCONNECTED", credentials: null, webhookTokenHash: null, syncCursor: null, lastError: null },
  });
  return { id: integration.id, type: integration.type };
}

export async function deleteIntegration(db: Db, user: SessionUser, id: string) {
  const integration = await getIntegrationForUser(db, user, id);
  await db.integration.delete({ where: { id: integration.id } });
  return { id: integration.id, type: integration.type };
}

export async function myCalendarIntegrations(db: Db, user: SessionUser) {
  return db.integration.findMany({
    where: { teamId: user.teamId, userId: user.id, type: { in: ["GOOGLE", "MICROSOFT"] }, status: "ACTIVE" },
    select: { id: true, type: true, status: true, credentials: true },
  });
}
