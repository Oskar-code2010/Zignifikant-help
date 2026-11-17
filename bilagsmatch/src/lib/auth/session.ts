import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { prisma } from "@/lib/db/client";
import { forOrg, type ScopedDb } from "@/lib/db/scoped";
import { HttpError, unauthorized } from "@/lib/api/errors";
import { notFound, redirect } from "next/navigation";

export interface SessionContext {
  userId: string;
  organizationId: string;
  role: "OWNER" | "MEMBER";
  email: string;
  name: string;
  db: ScopedDb;
}

/**
 * Resolve the logged-in user from the session cookie and re-check them in the DB
 * (so deleted users lose access immediately). Returns null if not logged in.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    name: user.name,
    db: forOrg(user.organizationId),
  };
}

export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) throw unauthorized();
  return ctx;
}

/** For server pages: redirect to /login instead of throwing when the session is missing. */
export async function requirePageContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For server pages: turn service errors into Next.js 404 / login redirects. */
export async function pageData<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    if (e instanceof HttpError && e.status === 401) redirect("/login");
    throw e;
  }
}
