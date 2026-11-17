import { ZodError } from "zod";

/** An error with an HTTP status and a Danish, user-facing message. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = () => new HttpError(401, "Du skal være logget ind.");
export const forbidden = (msg = "Du har ikke adgang til denne handling.") =>
  new HttpError(403, msg);
export const notFound = (what = "Ressourcen") => new HttpError(404, `${what} blev ikke fundet.`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, details);

/** Turn a Zod error into a short Danish message listing the offending fields. */
export function zodMessage(err: ZodError): string {
  const parts = err.issues.slice(0, 5).map((i) => {
    const field = i.path.join(".");
    return field ? `${field}: ${i.message}` : i.message;
  });
  return `Ugyldige data – ${parts.join("; ")}`;
}
