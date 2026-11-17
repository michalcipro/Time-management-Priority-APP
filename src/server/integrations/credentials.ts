import "server-only";
import { decryptJson, encryptJson } from "../crypto";
import { withSystem } from "../db";
import type { OAuthCredentials } from "./types";
import { IntegrationAuthError } from "./types";

type Refresher = (refreshToken: string) => Promise<OAuthCredentials>;

/** Return a valid access token, refreshing (and persisting) it when it is about to expire. */
export async function getAccessToken(integration: { id: string; credentials: string | null }, refresh: Refresher): Promise<string> {
  const creds = decryptJson<OAuthCredentials>(integration.credentials);
  if (!creds?.accessToken) throw new IntegrationAuthError("Chybí přístupové údaje – připojte účet znovu.");
  if (creds.expiresAt - Date.now() > 120_000) return creds.accessToken;
  if (!creds.refreshToken) throw new IntegrationAuthError("Platnost přístupu vypršela – připojte účet znovu.");
  const fresh = await refresh(creds.refreshToken);
  const merged: OAuthCredentials = { ...fresh, refreshToken: fresh.refreshToken ?? creds.refreshToken };
  await withSystem((db) => db.integration.update({ where: { id: integration.id }, data: { credentials: encryptJson(merged) } }));
  return merged.accessToken;
}

export async function fetchJson<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(20_000) });
  if (res.status === 401) throw new IntegrationAuthError("Přístup byl odmítnut (401) – připojte účet znovu.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }
  if (res.status === 202 || res.status === 204) return {} as T;
  return (await res.json()) as T;
}
