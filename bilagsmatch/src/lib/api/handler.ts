import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError, zodMessage } from "./errors";
import { requireSessionContext, type SessionContext } from "@/lib/auth/session";
import { TenantViolationError } from "@/lib/db/scoped";

export type RouteParams<P> = { params: Promise<P> };

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: zodMessage(err), issues: err.issues }, { status: 400 });
  }
  if (err instanceof TenantViolationError) {
    return NextResponse.json({ error: "Ressourcen blev ikke fundet." }, { status: 404 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Ressourcen blev ikke fundet." }, { status: 404 });
    }
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Findes allerede." }, { status: 409 });
    }
  }
  console.error("Unhandled API error:", err instanceof Error ? err.message : "unknown error");
  return NextResponse.json(
    { error: "Der opstod en uventet fejl. Prøv igen, eller kontakt support." },
    { status: 500 },
  );
}

/**
 * Wrap a route handler: requires a logged-in user, gives an org-scoped context,
 * and converts thrown errors into JSON responses.
 */
export function authed<P = Record<string, never>>(
  fn: (ctx: SessionContext, req: Request, params: P) => Promise<Response>,
) {
  return async (req: Request, route: RouteParams<P>): Promise<Response> => {
    try {
      const ctx = await requireSessionContext();
      const params = route?.params ? await route.params : ({} as P);
      return await fn(ctx, req, params);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Ugyldig JSON i forespørgslen.");
  }
}
