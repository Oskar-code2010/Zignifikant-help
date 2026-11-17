import { beforeAll, describe, expect, it } from "vitest";
import * as docsRoute from "@/app/api/clients/[clientId]/documents/route";
import * as docRoute from "@/app/api/documents/[documentId]/route";
import * as fileRoute from "@/app/api/documents/[documentId]/file/route";
import * as retryRoute from "@/app/api/documents/[documentId]/retry/route";
import { actAs, call, createOrgWithUser } from "./helpers";
import { prisma } from "@/lib/db/client";
import { drainQueue } from "@/lib/jobs/worker";
import { extractDocument } from "@/lib/services/extraction";
import { ExtractionError, type ExtractionProvider } from "@/lib/extraction";

let a: Awaited<ReturnType<typeof createOrgWithUser>>;
let b: Awaited<ReturnType<typeof createOrgWithUser>>;
let clientA: string;

function pdf(name: string, salt = name): FormData {
  const fd = new FormData();
  fd.append("file", new File([Buffer.from(`%PDF-1.7\n% ${salt}\n%%EOF`)], name, { type: "application/pdf" }));
  return fd;
}

beforeAll(async () => {
  a = await createOrgWithUser("DocA");
  b = await createOrgWithUser("DocB");
  clientA = (await prisma.client.create({ data: { organizationId: a.org.id, name: "A", cvr: "11111111" } })).id;
});

async function upload(name: string, salt?: string) {
  return call(docsRoute.POST, { method: "POST", params: { clientId: clientA }, formData: pdf(name, salt) });
}

describe("document upload and extraction", () => {
  it("uploads, queues and extracts with the mock provider", async () => {
    actAs(a.user.id);
    const res = await upload("gls-faktura-90881234.pdf");
    expect(res.status).toBe(201);
    const id = (res.json as { document: { id: string; status: string } }).document.id;
    expect((res.json as { document: { status: string } }).document.status).toBe("UPLOADED");
    expect(await drainQueue()).toBe(1);
    const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(doc).toMatchObject({
      status: "EXTRACTED",
      supplierName: "GLS Denmark A/S",
      supplierCvr: "16291824",
      totalAmountOre: 187500,
      vatAmountOre: 37500,
      currency: "DKK",
      extractedBy: "mock",
    });
    expect(doc.extractionWarnings).toEqual([]);
  });

  it("detects duplicate uploads by content hash", async () => {
    actAs(a.user.id);
    const res = await upload("renamed-copy.pdf", "gls-faktura-90881234.pdf");
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.json)).toContain("allerede uploadet");
  });

  it("validates file type by magic bytes, not extension", async () => {
    actAs(a.user.id);
    const fd = new FormData();
    fd.append("file", new File([Buffer.from("<html><script>alert(1)</script>")], "evil.pdf"));
    const res = await call(docsRoute.POST, { method: "POST", params: { clientId: clientA }, formData: fd });
    expect(res.status).toBe(400);
  });

  it("serves the file only to the owning org", async () => {
    actAs(a.user.id);
    const doc = await prisma.document.findFirstOrThrow({ where: { organizationId: a.org.id } });
    const ok = await call(fileRoute.GET, { params: { documentId: doc.id } });
    expect(ok.status).toBe(200);
    expect(ok.res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await ok.res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    actAs(b.user.id);
    expect((await call(fileRoute.GET, { params: { documentId: doc.id } })).status).toBe(404);
    expect((await call(docRoute.GET, { params: { documentId: doc.id } })).status).toBe(404);
    expect((await call(docRoute.PATCH, { method: "PATCH", params: { documentId: doc.id }, body: { supplierName: "x" } })).status).toBe(404);
    expect((await call(docRoute.DELETE, { method: "DELETE", params: { documentId: doc.id } })).status).toBe(404);
    expect((await call(retryRoute.POST, { method: "POST", params: { documentId: doc.id } })).status).toBe(404);
    expect((await call(docsRoute.GET, { params: { clientId: clientA } })).status).toBe(404);
    expect((await call(docsRoute.POST, { method: "POST", params: { clientId: clientA }, formData: pdf("x.pdf") })).status).toBe(404);
    actAs(null);
    expect((await call(fileRoute.GET, { params: { documentId: doc.id } })).status).toBe(401);
  });

  it("edits fields with validation and recomputes warnings", async () => {
    actAs(a.user.id);
    const doc = await prisma.document.findFirstOrThrow({ where: { organizationId: a.org.id } });
    const bad = await call(docRoute.PATCH, { method: "PATCH", params: { documentId: doc.id }, body: { totalAmountOre: 12.5 } });
    expect(bad.status).toBe(400);
    const res = await call(docRoute.PATCH, {
      method: "PATCH",
      params: { documentId: doc.id },
      body: { netAmountOre: 100000, invoiceDate: "2026-09-13" },
    });
    expect(res.status).toBe(200);
    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.netAmountOre).toBe(100000);
    expect((updated.extractionWarnings as string[]).join()).toMatch(/svarer ikke til totalen/);
  });

  it("marks failures FAILED with a Danish message, and manual completion makes it EXTRACTED", async () => {
    actAs(a.user.id);
    const res = await upload("ukendt.pdf");
    const id = (res.json as { document: { id: string } }).document.id;
    const failing: ExtractionProvider = {
      name: "test",
      extract: async () => {
        throw new ExtractionError("Testfejl: kunne ikke læse.");
      },
    };
    await prisma.job.updateMany({ where: { organizationId: a.org.id }, data: { status: "DONE" } });
    const out = await extractDocument(a.org.id, id, { provider: failing });
    expect(out.status).toBe("FAILED");
    const failed = await prisma.document.findUniqueOrThrow({ where: { id } });
    expect(failed).toMatchObject({ status: "FAILED", errorMessage: "Testfejl: kunne ikke læse." });

    await call(docRoute.PATCH, {
      method: "PATCH",
      params: { documentId: id },
      body: { totalAmountOre: 10000, invoiceDate: "2026-10-01", supplierName: "Manuel" },
    });
    expect((await prisma.document.findUniqueOrThrow({ where: { id } })).status).toBe("EXTRACTED");

    const retry = await call(retryRoute.POST, { method: "POST", params: { documentId: id } });
    expect(retry.status).toBe(200);
    expect(await drainQueue()).toBe(1);
  });

  it("deletes a document and its file", async () => {
    actAs(a.user.id);
    const doc = await prisma.document.findFirstOrThrow({ where: { organizationId: a.org.id, originalFilename: "ukendt.pdf" } });
    expect((await call(docRoute.DELETE, { method: "DELETE", params: { documentId: doc.id } })).status).toBe(200);
    expect(await prisma.document.findUnique({ where: { id: doc.id } })).toBeNull();
  });
});
