import { beforeAll, describe, expect, it } from "vitest";
import * as exportRoute from "@/app/api/clients/[clientId]/export/route";
import * as undoRoute from "@/app/api/matches/[matchId]/undo/route";
import * as docRoute from "@/app/api/documents/[documentId]/route";
import { actAs, call, createOrgWithUser } from "./helpers";
import { prisma } from "@/lib/db/client";
import { makeDate } from "@/lib/dates";
import { missingReceipts } from "@/lib/services/export";
import { forOrg } from "@/lib/db/scoped";

let a: Awaited<ReturnType<typeof createOrgWithUser>>;
let b: Awaited<ReturnType<typeof createOrgWithUser>>;
let clientId: string;
let matchId: string;
let documentId: string;

beforeAll(async () => {
  a = await createOrgWithUser("ExpA");
  b = await createOrgWithUser("ExpB");
  const client = await prisma.client.create({ data: { organizationId: a.org.id, name: "Nordlys Webshop ApS", cvr: "41234567", bankLedgerAccount: "5810" } });
  clientId = client.id;
  const acc = await prisma.bankAccount.create({ data: { organizationId: a.org.id, clientId, name: "Bank" } });
  const imp = await prisma.bankImport.create({ data: { organizationId: a.org.id, bankAccountId: acc.id, filename: "x", rowCount: 0, importedCount: 0, duplicateCount: 0, failedCount: 0, detectedFormat: "x" } });
  const tx = await prisma.bankTransaction.create({ data: { organizationId: a.org.id, bankAccountId: acc.id, bankImportId: imp.id, bookingDate: makeDate(2026, 9, 20)!, text: "GLS", amountOre: -187500, dedupeHash: "1", status: "MATCHED" } });
  await prisma.bankTransaction.create({ data: { organizationId: a.org.id, bankAccountId: acc.id, bankImportId: imp.id, bookingDate: makeDate(2026, 9, 21)!, text: "Bauhaus Esbjerg", amountOre: -124900, dedupeHash: "2" } });
  await prisma.bankTransaction.create({ data: { organizationId: a.org.id, bankAccountId: acc.id, bankImportId: imp.id, bookingDate: makeDate(2026, 9, 22)!, text: "Udbetaling Shopify", amountOre: 500000, dedupeHash: "3" } });
  const doc = await prisma.document.create({ data: { organizationId: a.org.id, clientId, originalFilename: "gls.pdf", storagePath: "x", mimeType: "application/pdf", sizeBytes: 1, sha256: "e1", status: "EXTRACTED" } });
  documentId = doc.id;
  const m = await prisma.match.create({ data: { organizationId: a.org.id, documentId: doc.id, transactionId: tx.id, score: 95, reasons: [], status: "CONFIRMED" } });
  matchId = m.id;
  await prisma.journalEntry.create({ data: { organizationId: a.org.id, clientId, matchId: m.id, documentId: doc.id, transactionId: tx.id, date: makeDate(2026, 9, 20)!, text: "GLS Denmark A/S – Faktura 90881234", accountNumber: "1350", vatCode: "I25", amountOre: 187500, voucherNumber: 1 } });
});

describe("export", () => {
  it("previews entries for a period", async () => {
    actAs(a.user.id);
    const res = await call(exportRoute.GET, { params: { clientId }, url: "http://x/?from=2026-09-01&to=2026-09-30" });
    expect(res.json).toMatchObject({ newCount: 1, exportedCount: 0 });
    const empty = await call(exportRoute.GET, { params: { clientId }, url: "http://x/?from=2026-10-01&to=2026-10-31" });
    expect(empty.json).toMatchObject({ newCount: 0 });
  });

  it("exports CSV with BOM, marks entries exported, and refuses silent re-export", async () => {
    actAs(a.user.id);
    const res = await call(exportRoute.POST, { method: "POST", params: { clientId }, body: { preset: "economic", from: "2026-09-01", to: "2026-09-30" } });
    expect(res.status).toBe(200);
    expect(res.res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.res.headers.get("content-disposition")).toContain("kassekladde_nordlys-webshop-aps_economic_01-09-2026_30-09-2026.csv");
    const bytes = Buffer.from(await res.res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8").slice(1)).toBe(
      "Dato;Bilagsnr.;Konto;Tekst;Beløb;Modkonto;Momskode\r\n20-09-2026;1;1350;GLS Denmark A/S – Faktura 90881234;1875,00;5810;I25\r\n",
    );
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { clientId } });
    expect(entry.exported).toBe(true);
    expect(entry.exportedAt).not.toBeNull();

    const again = await call(exportRoute.POST, { method: "POST", params: { clientId }, body: { preset: "generic" } });
    expect(again.status).toBe(400);
    expect(JSON.stringify(again.json)).toContain("allerede eksporterede");
    const forced = await call(exportRoute.POST, { method: "POST", params: { clientId }, body: { preset: "generic", includeExported: true } });
    expect(forced.status).toBe(200);
    const logs = await prisma.auditLog.findMany({ where: { organizationId: a.org.id, action: "export.create" } });
    expect(logs).toHaveLength(2);
  });

  it("protects exported entries from undo and document deletion", async () => {
    actAs(a.user.id);
    expect((await call(undoRoute.POST, { method: "POST", params: { matchId } })).status).toBe(409);
    expect((await call(docRoute.DELETE, { method: "DELETE", params: { documentId } })).status).toBe(409);
  });

  it("lists outgoing transactions without receipts and drafts an email", async () => {
    const ctx = { userId: a.user.id, organizationId: a.org.id, role: "OWNER" as const, email: "", name: "", db: forOrg(a.org.id) };
    const res = await missingReceipts(ctx, clientId);
    expect(res.transactions.map((t) => t.text)).toEqual(["Bauhaus Esbjerg"]);
    expect(res.email).toContain("Emne: Manglende bilag – Nordlys Webshop ApS");
    expect(res.email).toContain("- 21-09-2026  Bauhaus Esbjerg  -1.249,00 kr.");
  });

  it("org isolation: user B cannot preview or export org A's journal", async () => {
    actAs(b.user.id);
    expect((await call(exportRoute.GET, { params: { clientId } })).status).toBe(404);
    expect((await call(exportRoute.POST, { method: "POST", params: { clientId }, body: { preset: "generic", includeExported: true } })).status).toBe(404);
    actAs(null);
    expect((await call(exportRoute.POST, { method: "POST", params: { clientId }, body: { preset: "generic" } })).status).toBe(401);
  });
});
