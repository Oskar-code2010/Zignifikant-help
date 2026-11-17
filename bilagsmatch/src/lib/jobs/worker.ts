import { claimNextJob, completeJob, EXTRACT_DOCUMENT, failJob, onJobEnqueued, type ClaimedJob } from "./queue";
import { extractDocument } from "@/lib/services/extraction";
import { z } from "zod";

const PayloadSchema = z.object({ documentId: z.string() });
const CONCURRENCY = 3;
const POLL_MS = 1500;

/** Process one claimed job. Exported for tests. */
export async function runJob(job: ClaimedJob): Promise<void> {
  if (job.type !== EXTRACT_DOCUMENT) {
    await failJob(job, `Unknown job type ${job.type}`, false);
    return;
  }
  const payload = PayloadSchema.safeParse(job.payload);
  if (!payload.success) {
    await failJob(job, "Invalid payload", false);
    return;
  }
  const outcome = await extractDocument(job.organizationId, payload.data.documentId, {
    finalAttempt: job.attempts >= 3,
  });
  if (outcome.status === "EXTRACTED") await completeJob(job.id);
  else await failJob(job, outcome.error ?? "failed", outcome.retryable);
}

/** Drain the queue once (used by tests and the worker loop). Returns the number of jobs run. */
export async function drainQueue(max = 1000): Promise<number> {
  let n = 0;
  while (n < max) {
    const job = await claimNextJob();
    if (!job) break;
    await runJob(job);
    n++;
  }
  return n;
}

const g = globalThis as unknown as { __bilagsmatchWorker?: boolean };

/** Start the in-process worker loop (called once from instrumentation.ts). */
export function startWorker(): void {
  if (g.__bilagsmatchWorker) return;
  g.__bilagsmatchWorker = true;
  let running = 0;
  let scheduled = false;

  const tick = async () => {
    scheduled = false;
    while (running < CONCURRENCY) {
      let job: ClaimedJob | null;
      try {
        job = await claimNextJob();
      } catch (err) {
        console.error("Job queue error:", err instanceof Error ? err.message : "unknown");
        return;
      }
      if (!job) return;
      running++;
      void runJob(job)
        .catch((err: unknown) => console.error("Job failed:", err instanceof Error ? err.message : "unknown"))
        .finally(() => {
          running--;
          kick();
        });
    }
  };
  const kick = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => void tick(), 10);
  };
  onJobEnqueued(kick);
  setInterval(kick, POLL_MS).unref?.();
  kick();
  console.info("Extraction worker started");
}
