import { beforeAll, describe, expect, it } from "vitest";
import * as runRoute from "@/app/api/clients/[clientId]/matching/run/route";
import * as reviewRoute from "@/app/api/clients/[clientId]/review/route";
import * as manualRoute from "@/app/api/clients/[clientId]/matches/manual/route";
import * as bulkRoute from "@/app/api/clients/[clientId]/matches/bulk-confirm/route";
import * as candidatesRoute from "@/app/api/clients/[clientId]/transactions/[transactionId]/candidates/route";
import * as confirmRoute from "@/app/api/matches/[matchId]/confirm/route";
import * as rejectRoute from "@/app/api/matches/[matchId]/reject/route";
import * as undoRoute from "@/app/api/matches/[matchId]/undo/route";
import * as stateRoute from "@/app/api/transactions/[transactionId]/state/route";
import { actAs, call, createOrgWithUser } from "./helpers";
import { prisma } from "@/lib/db/client";
import { makeDate } from "@/lib/dates";

type Org = Awaited<ReturnType<typeof createOrgWithUser>>;
let a: Org;
let b: Org;

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return makeDate(y!, m!, d!)!;
};

let n = 0;
async function setupClient(org: Org) {
  const client = await prisma.client.create({ data: { organizationId: org.org.id, name: `Shop ${++n}`, cvr: "12345678" } });
  const account = await prisma.bankAccount.create({ data: { organizationId: org.org.id, clientId: client.id, name: "Bank" } });
  const imp = await prisma.bankImport.create({
    data: { organizationId: org.org.id, bankAccountId: account.id, filename: "x.csv", rowCount: 0, importedCount: 0, duplicateCount: 0, failedCount: 0, detectedFormat: "test" },
  });
  const addDoc = (p: { supplierName: string; supplierCvr?: string; total: number; date: string; invoiceNumber?: string; currency?: string; credit?: boolean }) =>
    prisma.document.create({
      data: {
        organizationId: org.org.id,
        clientId: client.id,
        originalFilename: `${p.supplierName}-${++n}.pdf`,
        storagePath: "x",
        mimeType: "application/pdf",
        sizeBytes: 1,
        sha256: `hash-${n}-${Math.random()}`,
        status: "EXTRACTED",
        supplierName: p.supplierName,
        supplierCvr: p.supplierCvr ?? null,
        invoiceNumber: p.invoiceNumber ?? null,
        invoiceDate: day(p.date),
        totalAmountOre: p.total,
        vatAmountOre: Math.round(p.total / 5),
        netAmountOre: p.total - Math.round(p.total / 5),
        currency: p.currency ?? "DKK",
        isCreditNote: Boolean(p.credit),
      },
    });
  const addTx = (p: { text: string; amount: number; date: string }) =>
    prisma.bankTransaction.create({
      data: {
        organizationId: org.org.id,
        bankAccountId: account.id,
        bankImportId: imp.id,
        bookingDate: day(p.date),
        text: p.text,
        amountOre: p.amount,
        dedupeHash: `h-${++n}`,
      },
    });
  return { client, account, imp, addDoc, addTx };
}

type Review = {
  items: {
    transaction: { id: string; text: string; amountOre: number };
    match: { id: string; score: number; reasons: string[]; suggestedAccount: string | null; suggestedVatCode: string | null; document: { id: string } } | null;
  }[];
};

beforeAll(async () => {
  a = await createOrgWithUser("RecA");
  b = await createOrgWithUser("RecB");
});

describe("reconciliation flow", () => {
  it("runs matching, confirms with learning, rejects, re-runs, manual-matches and ignores", async () => {
    const s = await setupClient(a);
    const gls = await s.addDoc({ supplierName: "GLS Denmark A/S", supplierCvr: "16291824", total: 187500, date: "2026-09-12", invoiceNumber: "90881234" });
    const shop = await s.addDoc({ supplierName: "Shopify International Limited", total: 29900, date: "2026-09-01" });
    const lonely = await s.addDoc({ supplierName: "Kontorland Esbjerg", total: 45900, date: "2026-09-24" });
    const tGls = await s.addTx({ text: "GLS DENMARK 90881234", amount: -187500, date: "2026-09-20" });
    const tShop = await s.addTx({ text: "Visa/Dankort SHOPIFY* 123456", amount: -29900, date: "2026-09-02" });
    const tOther = await s.addTx({ text: "Bauhaus Esbjerg", amount: -124900, date: "2026-09-10" });
    const tTransfer = await s.addTx({ text: "Overførsel til opsparing", amount: -2000000, date: "2026-09-15" });

    actAs(a.user.id);
    const run = await call(runRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    expect(run.status).toBe(200);
    expect(run.json).toMatchObject({ suggested: 2, highConfidence: 2 });

    const review = (await call(reviewRoute.GET, { params: { clientId: s.client.id } })).json as Review;
    const glsItem = review.items.find((i) => i.transaction.id === tGls.id)!;
    expect(glsItem.match?.document.id).toBe(gls.id);
    expect(glsItem.match?.reasons).toContain("Beløb matcher præcist (1.875,00 kr.)");
    expect(glsItem.match).toMatchObject({ suggestedAccount: "1350", suggestedVatCode: "I25" });
    expect(review.items[0]!.match).not.toBeNull(); // suggestions are sorted first

    // Confirm GLS with a different account → journal entry + learned CVR rule.
    const conf = await call(confirmRoute.POST, {
      method: "POST",
      params: { matchId: glsItem.match!.id },
      body: { accountNumber: "1310", vatCode: "I25" },
    });
    expect(conf.status).toBe(200);
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { documentId: gls.id } });
    expect(entry).toMatchObject({ accountNumber: "1310", vatCode: "I25", amountOre: 187500, voucherNumber: 1, exported: false });
    expect(entry.text).toBe("GLS Denmark A/S – Faktura 90881234");
    const rule = await prisma.categorizationRule.findFirstOrThrow({ where: { organizationId: a.org.id, matchType: "SUPPLIER_CVR", pattern: "16291824" } });
    expect(rule).toMatchObject({ accountNumber: "1310", timesApplied: 1, createdFrom: "USER_CONFIRMATION" });
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tGls.id } })).status).toBe("MATCHED");
    // Confirming twice is refused.
    expect((await call(confirmRoute.POST, { method: "POST", params: { matchId: glsItem.match!.id }, body: { accountNumber: "1310", vatCode: "I25" } })).status).toBe(409);
    // Unknown account is refused.
    const shopItem = review.items.find((i) => i.transaction.id === tShop.id)!;
    expect((await call(confirmRoute.POST, { method: "POST", params: { matchId: shopItem.match!.id }, body: { accountNumber: "0000", vatCode: "I25" } })).status).toBe(400);

    // Reject Shopify → not suggested again on re-run.
    expect((await call(rejectRoute.POST, { method: "POST", params: { matchId: shopItem.match!.id } })).status).toBe(200);
    const rerun = await call(runRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    expect(rerun.json).toMatchObject({ suggested: 0 });

    // Manual match of the Shopify pair.
    const cands = await call(candidatesRoute.GET, { params: { clientId: s.client.id, transactionId: tShop.id }, url: "http://x/?q=shopify" });
    expect((cands.json as { documents: { id: string; score: number }[] }).documents[0]).toMatchObject({ id: shop.id });
    const manual = await call(manualRoute.POST, {
      method: "POST",
      params: { clientId: s.client.id },
      body: { transactionId: tShop.id, documentId: shop.id, accountNumber: "3610", vatCode: "IEUY" },
    });
    expect(manual.status).toBe(201);
    const manualMatch = await prisma.match.findUniqueOrThrow({ where: { id: (manual.json as { matchId: string }).matchId } });
    expect(manualMatch).toMatchObject({ status: "CONFIRMED", createdBy: "MANUAL" });
    expect((manualMatch.reasons as string[])[0]).toBe("Manuelt afstemt af bogholderen");
    const nameRule = await prisma.categorizationRule.findFirstOrThrow({ where: { organizationId: a.org.id, matchType: "SUPPLIER_NAME", pattern: "shopify" } });
    expect(nameRule.accountNumber).toBe("3610");
    expect((await prisma.journalEntry.findFirstOrThrow({ where: { documentId: shop.id } })).voucherNumber).toBe(2);

    // Already-matched transaction cannot be manually matched again.
    expect(
      (await call(manualRoute.POST, { method: "POST", params: { clientId: s.client.id }, body: { transactionId: tShop.id, documentId: lonely.id, accountNumber: "2800", vatCode: "I25" } })).status,
    ).toBe(409);

    // Ignore the transfer, mark Bauhaus as missing receipt.
    expect((await call(stateRoute.POST, { method: "POST", params: { transactionId: tTransfer.id }, body: { action: "IGNORE" } })).json).toMatchObject({ status: "IGNORED" });
    expect((await call(stateRoute.POST, { method: "POST", params: { transactionId: tOther.id }, body: { action: "MISSING_RECEIPT" } })).json).toMatchObject({ status: "MISSING_RECEIPT" });
    expect((await call(stateRoute.POST, { method: "POST", params: { transactionId: tGls.id }, body: { action: "IGNORE" } })).status).toBe(409);

    // Undo a confirmed (not exported) match.
    expect((await call(undoRoute.POST, { method: "POST", params: { matchId: glsItem.match!.id } })).status).toBe(200);
    expect(await prisma.journalEntry.count({ where: { documentId: gls.id } })).toBe(0);
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tGls.id } })).status).toBe("UNMATCHED");

    const logs = await prisma.auditLog.findMany({ where: { organizationId: a.org.id }, select: { action: true } });
    expect(new Set(logs.map((l) => l.action))).toEqual(
      new Set(["matching.run", "match.confirm", "match.reject", "match.manual", "transaction.ignore", "transaction.missing_receipt"]),
    );
  });

  it("learned rules pre-fill the next document from the same supplier", async () => {
    const s = await setupClient(a);
    await s.addDoc({ supplierName: "GLS Denmark A/S", supplierCvr: "16291824", total: 50000, date: "2026-10-12" });
    await s.addTx({ text: "GLS DENMARK", amount: -50000, date: "2026-10-12" });
    actAs(a.user.id);
    await call(runRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    const review = (await call(reviewRoute.GET, { params: { clientId: s.client.id } })).json as Review;
    // The first test confirmed GLS on 1310 (overriding the built-in 1350).
    expect(review.items[0]!.match).toMatchObject({ suggestedAccount: "1310", suggestedVatCode: "I25" });
  });

  it("bulk confirms high-confidence suggestions with an account suggestion", async () => {
    const s = await setupClient(a);
    await s.addDoc({ supplierName: "PostNord Danmark A/S", total: 8995, date: "2026-09-08" });
    await s.addDoc({ supplierName: "PostNord Danmark A/S", total: 8995, date: "2026-09-22" });
    await s.addDoc({ supplierName: "Helt Ukendt", total: 33300, date: "2026-09-10" });
    await s.addTx({ text: "POSTNORD PORTO", amount: -8995, date: "2026-09-08" });
    await s.addTx({ text: "POSTNORD PORTO", amount: -8995, date: "2026-09-22" });
    await s.addTx({ text: "HELT UKENDT", amount: -33300, date: "2026-09-10" });
    actAs(a.user.id);
    await call(runRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    const preview = await call(bulkRoute.GET, { params: { clientId: s.client.id } });
    expect(preview.json).toEqual({ count: 2, totalOre: 17990, skippedWithoutAccount: 1 });
    const res = await call(bulkRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    expect(res.json).toEqual({ confirmed: 2, skippedWithoutAccount: 1 });
    expect(await prisma.journalEntry.count({ where: { clientId: s.client.id } })).toBe(2);
  });

  it("runMatching with 500 transactions and 200 documents takes under 2 seconds", async () => {
    const s = await setupClient(a);
    const docs = Array.from({ length: 200 }, (_, i) => ({
      organizationId: a.org.id,
      clientId: s.client.id,
      originalFilename: `bench-${i}.pdf`,
      storagePath: "x",
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha256: `bench-${i}`,
      status: "EXTRACTED" as const,
      supplierName: `Leverandør ${i}`,
      invoiceDate: day(`2026-0${1 + (i % 9)}-1${i % 10}`),
      totalAmountOre: 10000 + i * 137,
      currency: "DKK",
    }));
    await prisma.document.createMany({ data: docs });
    await prisma.bankTransaction.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        organizationId: a.org.id,
        bankAccountId: s.account.id,
        bankImportId: s.imp.id,
        bookingDate: day(`2026-0${1 + (i % 9)}-1${i % 10}`),
        text: i < 200 ? `LEVERANDØR ${i}` : `Diverse ${i}`,
        amountOre: i < 200 ? -(10000 + i * 137) : -(500 + i),
        dedupeHash: `bench-${i}`,
      })),
    });
    actAs(a.user.id);
    const t0 = performance.now();
    const res = await call(runRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    const ms = performance.now() - t0;
    console.info(`runMatching (DB) 500 tx × 200 docs: ${ms.toFixed(0)} ms`);
    expect(res.status).toBe(200);
    expect((res.json as { suggested: number }).suggested).toBe(200);
    expect(ms).toBeLessThan(2000);
  });
});

describe("reconciliation org isolation", () => {
  it("user B cannot run, review, confirm, reject, manual-match or change state in org A", async () => {
    const s = await setupClient(a);
    const d = await s.addDoc({ supplierName: "GLS Denmark A/S", total: 1000, date: "2026-09-01" });
    const t = await s.addTx({ text: "GLS", amount: -1000, date: "2026-09-01" });
    actAs(a.user.id);
    await call(runRoute.POST, { method: "POST", params: { clientId: s.client.id } });
    const match = await prisma.match.findFirstOrThrow({ where: { documentId: d.id } });

    // B also has a client, used to try cross-tenant manual matching via own client id.
    const sb = await setupClient(b);

    actAs(b.user.id);
    const p = { clientId: s.client.id };
    expect((await call(runRoute.POST, { method: "POST", params: p })).status).toBe(404);
    expect((await call(reviewRoute.GET, { params: p })).status).toBe(404);
    expect((await call(bulkRoute.GET, { params: p })).status).toBe(404);
    expect((await call(bulkRoute.POST, { method: "POST", params: p })).status).toBe(404);
    expect((await call(candidatesRoute.GET, { params: { ...p, transactionId: t.id } })).status).toBe(404);
    expect((await call(confirmRoute.POST, { method: "POST", params: { matchId: match.id }, body: { accountNumber: "1350", vatCode: "I25" } })).status).toBe(404);
    expect((await call(rejectRoute.POST, { method: "POST", params: { matchId: match.id } })).status).toBe(404);
    expect((await call(undoRoute.POST, { method: "POST", params: { matchId: match.id } })).status).toBe(404);
    expect((await call(stateRoute.POST, { method: "POST", params: { transactionId: t.id }, body: { action: "IGNORE" } })).status).toBe(404);
    expect(
      (await call(manualRoute.POST, { method: "POST", params: { clientId: sb.client.id }, body: { transactionId: t.id, documentId: d.id, accountNumber: "1350", vatCode: "I25" } })).status,
    ).toBe(404);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe("SUGGESTED");
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("SUGGESTED");

    actAs(null);
    expect((await call(runRoute.POST, { method: "POST", params: p })).status).toBe(401);
    expect((await call(confirmRoute.POST, { method: "POST", params: { matchId: match.id }, body: {} })).status).toBe(401);
  });
});
