/** Domain errors shared by services and route handlers (no Next.js dependencies). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Záznam") => new ApiError(404, `${what} nebyl nalezen.`, "not_found");
export const forbidden = (message = "K této akci nemáte oprávnění.") => new ApiError(403, message, "forbidden");
export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, "bad_request", details);
export const conflict = (message: string) => new ApiError(409, message, "conflict");
