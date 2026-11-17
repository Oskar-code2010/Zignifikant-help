/** Next.js server start hook: start the in-process extraction worker on the Node.js runtime. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.EXTRACTION_WORKER_ENABLED === "false") return;
  const { startWorker } = await import("./lib/jobs/worker");
  startWorker();
}
