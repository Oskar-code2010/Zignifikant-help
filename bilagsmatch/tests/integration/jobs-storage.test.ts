import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { InvalidStorageKeyError, LocalFileStorage } from "@/lib/storage";
import {
  claimNextJob,
  completeJob,
  enqueueExtraction,
  failJob,
  onJobEnqueued,
} from "@/lib/jobs/queue";
import { runJob } from "@/lib/jobs/worker";
import { prisma } from "@/lib/db/client";
import { forOrg } from "@/lib/db/scoped";
import { createOrgWithUser } from "./helpers";

describe("LocalFileStorage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bm-storage-"));
  const storage = new LocalFileStorage(root);
  const org = "clorg0000000000000001";
  const client = "clcli0000000000000001";

  it("stores under <org>/<client>/<random>.<ext> and reads back", async () => {
    const key = await storage.put({
      organizationId: org,
      clientId: client,
      extension: "pdf",
      bytes: Buffer.from("%PDF-1"),
    });
    expect(key).toMatch(new RegExp(`^${org}/${client}/[a-f0-9]{32}\\.pdf$`));
    expect((await storage.get(key)).toString()).toBe("%PDF-1");
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("rejects path traversal and malformed keys", async () => {
    for (const key of [
      "../etc/passwd",
      `${org}/../../x.pdf`,
      `${org}/${client}/x.pdf`,
      "/abs/path.pdf",
      `${org}/${client}/${"a".repeat(32)}.exe`,
    ]) {
      await expect(storage.get(key)).rejects.toBeInstanceOf(InvalidStorageKeyError);
    }
    await expect(
      storage.put({
        organizationId: "../x",
        clientId: client,
        extension: "pdf",
        bytes: Buffer.from(""),
      }),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it("deletes all files of a client", async () => {
    const key = await storage.put({
      organizationId: org,
      clientId: client,
      extension: "png",
      bytes: Buffer.from("x"),
    });
    await storage.deleteClient(org, client);
    expect(fs.existsSync(path.join(root, key))).toBe(false);
  });
});

describe("job queue", () => {
  let orgId: string;
  beforeAll(async () => {
    await prisma.job.updateMany({
      where: { status: { in: ["PENDING", "RUNNING"] } },
      data: { status: "DONE" },
    });
    orgId = (await createOrgWithUser("Jobs")).org.id;
  });

  it("claims jobs once, notifies listeners and completes them", async () => {
    let notified = 0;
    const off = onJobEnqueued(() => notified++);
    await enqueueExtraction(forOrg(orgId), orgId, "doc-a");
    off();
    expect(notified).toBe(1);
    const job = await claimNextJob();
    expect(job).toMatchObject({
      organizationId: orgId,
      attempts: 1,
      payload: { documentId: "doc-a" },
    });
    expect(await claimNextJob()).toBeNull();
    await completeJob(job!.id);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job!.id } })).status).toBe("DONE");
  });

  it("retries retryable failures with backoff, then fails permanently", async () => {
    await enqueueExtraction(forOrg(orgId), orgId, "doc-b");
    let job = (await claimNextJob())!;
    expect(await failJob(job, "rate limited", true)).toBe("retry");
    const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("PENDING");
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(await claimNextJob()).toBeNull(); // not before runAfter
    job = (await claimNextJob(new Date(Date.now() + 10 * 60_000)))!;
    expect(job.attempts).toBe(2);
    expect(await failJob(job, "rate limited", true)).toBe("retry");
    job = (await claimNextJob(new Date(Date.now() + 60 * 60_000)))!;
    expect(job.attempts).toBe(3);
    expect(await failJob(job, "rate limited", true)).toBe("failed");
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("FAILED");
  });

  it("recovers jobs locked by a dead worker", async () => {
    await enqueueExtraction(forOrg(orgId), orgId, "doc-c");
    const job = (await claimNextJob())!;
    const later = new Date(Date.now() + 6 * 60_000);
    const again = await claimNextJob(later);
    expect(again?.id).toBe(job.id);
    await completeJob(job.id);
  });

  it("fails unknown job types and missing documents without throwing", async () => {
    const bad = await prisma.job.create({
      data: { organizationId: orgId, type: "nope", payload: {} },
    });
    await runJob({ id: bad.id, organizationId: orgId, type: "nope", payload: {}, attempts: 1 });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("FAILED");
    const missing = await prisma.job.create({
      data: { organizationId: orgId, type: "extract-document", payload: { documentId: "gone" } },
    });
    await runJob({
      id: missing.id,
      organizationId: orgId,
      type: "extract-document",
      payload: { documentId: "gone" },
      attempts: 1,
    });
    expect((await prisma.job.findUniqueOrThrow({ where: { id: missing.id } })).status).toBe(
      "FAILED",
    );
  });
});
