import { prisma } from "@/lib/db/client";
import type { ScopedTx } from "@/lib/db/scoped";

export const EXTRACT_DOCUMENT = "extract-document";
const MAX_ATTEMPTS = 3;
const STALE_LOCK_MS = 5 * 60_000;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Notify in-process workers that new work is available (avoids waiting for the next poll). */
export function onJobEnqueued(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function enqueueExtraction(
  db: Pick<ScopedTx, "job">,
  organizationId: string,
  documentId: string,
): Promise<void> {
  await db.job.create({
    data: { organizationId, type: EXTRACT_DOCUMENT, payload: { documentId } },
  });
  for (const l of listeners) l();
}

export interface ClaimedJob {
  id: string;
  organizationId: string;
  type: string;
  payload: unknown;
  attempts: number;
}

/** Atomically claim the oldest runnable job (PENDING → RUNNING). Returns null when there is none. */
export async function claimNextJob(now = new Date()): Promise<ClaimedJob | null> {
  // Recover jobs whose worker died.
  await prisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: new Date(now.getTime() - STALE_LOCK_MS) } },
    data: { status: "PENDING", lockedAt: null },
  });
  for (let i = 0; i < 5; i++) {
    const next = await prisma.job.findFirst({
      where: { status: "PENDING", runAfter: { lte: now } },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;
    const claimed = await prisma.job.updateMany({
      where: { id: next.id, status: "PENDING" },
      data: { status: "RUNNING", lockedAt: now, attempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return {
        id: next.id,
        organizationId: next.organizationId,
        type: next.type,
        payload: next.payload,
        attempts: next.attempts + 1,
      };
    }
  }
  return null;
}

export async function completeJob(id: string): Promise<void> {
  await prisma.job.update({ where: { id }, data: { status: "DONE", lockedAt: null } });
}

/** Mark failed. Retryable failures go back to PENDING with backoff until MAX_ATTEMPTS. */
export async function failJob(job: ClaimedJob, message: string, retryable: boolean): Promise<"retry" | "failed"> {
  if (retryable && job.attempts < MAX_ATTEMPTS) {
    const delay = 30_000 * 2 ** (job.attempts - 1);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "PENDING", lockedAt: null, lastError: message, runAfter: new Date(Date.now() + delay) },
    });
    return "retry";
  }
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "FAILED", lockedAt: null, lastError: message },
  });
  return "failed";
}
