import { getServerSession } from "next-auth";
import { authOptions } from "./options";
import { prisma } from "@/lib/db/client";
import { forOrg, type ScopedDb } from "@/lib/db/scoped";
import { unauthorized } from "@/lib/api/errors";

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
