/** Browser-side JSON fetch helper. Throws ApiError with the server's Danish message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const type = res.headers.get("content-type") ?? "";
  const body: unknown = type.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const msg =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : res.status === 401
          ? "Din session er udløbet. Log ind igen."
          : `Serverfejl (${res.status}). Prøv igen.`;
    throw new ApiError(res.status, msg, body);
  }
  return body as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Der opstod en ukendt fejl.";
}
