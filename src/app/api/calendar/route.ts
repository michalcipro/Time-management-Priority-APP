import { apiRoute, parseJson, parseQuery } from "@/server/api";
import { withActor } from "@/server/db";
import { calendarEventCreateSchema, calendarQuerySchema } from "@/lib/validation";
import { createCalendarEvent, listCalendar, listExternalEvents, pushEventToProvider } from "@/server/services/calendar";
import { myCalendarIntegrations } from "@/server/services/integrations";
import { ApiError } from "@/server/errors";

export const GET = apiRoute(async ({ req, user }) => {
  const q = parseQuery(req, calendarQuerySchema);
  const from = new Date(q.from);
  const to = new Date(q.to);
  const { items, integrations } = await withActor(user, async (db) => ({
    items: await listCalendar(db, user, from, to, q.userId),
    integrations: !q.userId || q.userId === user.id ? await myCalendarIntegrations(db, user) : [],
  }));
  const external = await listExternalEvents(integrations, from, to);
  return {
    items: [...items, ...external.items].sort((a, b) => a.start.localeCompare(b.start)),
    connected: integrations.map((i) => i.type),
    errors: external.errors,
  };
});

export const POST = apiRoute(async ({ req, user }) => {
  const input = await parseJson(req, calendarEventCreateSchema);
  let external: { provider: "GOOGLE" | "MICROSOFT"; externalId: string } | null = null;
  if (input.syncTo !== "LOCAL") {
    const integrations = await withActor(user, (db) => myCalendarIntegrations(db, user));
    const integration = integrations.find((i) => i.type === input.syncTo);
    if (!integration) throw new ApiError(400, "Kalendář není připojen.", "not_connected");
    try {
      const externalId = await pushEventToProvider(integration, { ...input, startAt: new Date(input.startAt), endAt: new Date(input.endAt) });
      external = { provider: input.syncTo, externalId };
    } catch (err) {
      throw new ApiError(502, `Vytvoření události v externím kalendáři selhalo: ${(err as Error).message}`, "provider_error");
    }
  }
  return withActor(user, (db) => createCalendarEvent(db, user, input, external));
});
