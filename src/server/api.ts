import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { can, type Permission } from "@/lib/permissions";
import { getSessionUser, type SessionUser } from "./session";
import { rateLimit } from "./rate-limit";
import { env } from "./env";

/**
 * Route handler wrapper: authentication, permission check, same-origin (CSRF)
 * protection for mutations, per-user rate limiting and uniform JSON errors.
 */

export { ApiError, notFound, forbidden, badRequest, conflict } from "./errors";
import { ApiError, badRequest, forbidden } from "./errors";

export interface RouteContext<P> {
  req: NextRequest;
  user: SessionUser;
  params: P;
}

interface RouteOptions {
  permission?: Permission;
  /** Requests per minute per user (default: 300 reads / 120 writes). */
  limit?: number;
  limitKey?: string;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function apiRoute<P = Record<string, string>>(
  handler: (ctx: RouteContext<P>) => Promise<unknown>,
  options: RouteOptions = {},
) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const safe = SAFE_METHODS.has(req.method);
      if (!safe) assertSameOrigin(req);

      const user = await getSessionUser();
      if (!user) throw new ApiError(401, "Nejste přihlášeni.", "unauthorized");
      if (options.permission && !can(user.role, options.permission)) throw forbidden();

      const limit = options.limit ?? (safe ? 300 : 120);
      const rl = await rateLimit(`api:${user.id}:${options.limitKey ?? (safe ? "read" : "write")}`, limit, 60);
      if (!rl.ok) {
        return NextResponse.json(
          { error: { code: "rate_limited", message: "Příliš mnoho požadavků, zkuste to prosím za chvíli." } },
          { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
        );
      }

      const result = await handler({ req, user, params: context?.params ? await context.params : ({} as P) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "validation_error",
          message: "Neplatná data – zkontrolujte prosím formulář.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  const code = (err as { code?: string })?.code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === "P2025") return NextResponse.json({ error: { code: "not_found", message: "Záznam nebyl nalezen." } }, { status: 404 });
  if (code === "P2002") return NextResponse.json({ error: { code: "conflict", message: "Záznam již existuje." } }, { status: 409 });
  if (/row-level security|permission denied/i.test(message)) {
    return NextResponse.json({ error: { code: "forbidden", message: "K tomuto záznamu nemáte přístup." } }, { status: 403 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "internal_error", message: env.isProduction ? "Došlo k neočekávané chybě." : message } },
    { status: 500 },
  );
}

/** Reject cross-site mutation requests (defense in depth on top of SameSite cookies). */
export function assertSameOrigin(req: NextRequest) {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "Požadavek z cizího původu byl zablokován.", "csrf");
  }
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = null;
    }
    if (!originHost || (host && originHost !== host && origin !== env.appUrl)) {
      throw new ApiError(403, "Požadavek z cizího původu byl zablokován.", "csrf");
    }
  }
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Tělo požadavku musí být platný JSON.");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return schema.parse(params);
}
