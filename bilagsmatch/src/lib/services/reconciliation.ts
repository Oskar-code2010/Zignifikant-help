import { z } from "zod";
import type { Document, BankTransaction } from "@prisma/client";
import type { SessionContext } from "@/lib/auth/session";
import type { ScopedTx } from "@/lib/db/scoped";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import {
  HIGH_CONFIDENCE,
  matchAll,
  rankDocumentsForTransaction,
  scorePair,
  type MatchDocument,
  type MatchTransaction,
} from "@/lib/matching";
import {
  learningKey,
  suggestAccount,
  type RuleLike,
  type Suggestion,
} from "@/lib/categorization/suggest";
import { IdSchema } from "@/lib/validation/schemas";
import { getClient } from "./clients";

const toMatchDoc = (d: Document): MatchDocument => ({
  id: d.id,
  supplierName: d.supplierName,
  supplierCvr: d.supplierCvr,
  invoiceNumber: d.invoiceNumber,
  invoiceDate: d.invoiceDate,
  dueDate: d.dueDate,
  totalAmountOre: d.totalAmountOre,
  currency: d.currency,
  isCreditNote: d.isCreditNote,
});

const toMatchTx = (t: BankTransaction): MatchTransaction => ({
  id: t.id,
  bookingDate: t.bookingDate,
  text: t.text,
  amountOre: t.amountOre,
});

async function loadRules(db: Pick<ScopedTx, "categorizationRule">): Promise<RuleLike[]> {
  return db.categorizationRule.findMany();
}

export function suggestionFor(
  doc: Pick<Document, "supplierCvr" | "supplierName"> | null,
  tx: Pick<BankTransaction, "text">,
  rules: RuleLike[],
): Suggestion | null {
  return suggestAccount(
    {
      supplierCvr: doc?.supplierCvr ?? null,
      supplierName: doc?.supplierName ?? null,
      bankText: tx.text,
    },
    rules,
  );
}

/**
 * Run automatic matching for a client. Replaces previous automatic suggestions, keeps confirmed matches,
 * and never re-suggests a pair the bookkeeper rejected.
 */
export async function runMatching(ctx: SessionContext, clientId: string) {
  await getClient(ctx, clientId);
  const started = Date.now();
  const [docs, txs, rejected, rules] = await Promise.all([
    ctx.db.document.findMany({
      where: {
        clientId,
        status: "EXTRACTED",
        matches: { none: { status: "CONFIRMED" } },
      },
    }),
    ctx.db.bankTransaction.findMany({
      where: { bankAccount: { clientId }, status: { in: ["UNMATCHED", "SUGGESTED"] } },
    }),
    ctx.db.match.findMany({
      where: { status: "REJECTED", document: { clientId } },
      select: { documentId: true, transactionId: true },
    }),
    loadRules(ctx.db),
  ]);
  const rejectedPairs = new Set(rejected.map((r) => `${r.documentId}|${r.transactionId}`));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const txById = new Map(txs.map((t) => [t.id, t]));

  const assigned = matchAll(docs.map(toMatchDoc), txs.map(toMatchTx)).filter(
    (c) => !rejectedPairs.has(`${c.documentId}|${c.transactionId}`),
  );

  await ctx.db.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { status: "SUGGESTED", document: { clientId } } });
    await tx.bankTransaction.updateMany({
      where: { bankAccount: { clientId }, status: "SUGGESTED" },
      data: { status: "UNMATCHED" },
    });
    if (assigned.length > 0) {
      await tx.match.createMany({
        data: assigned.map((c) => {
          const s = suggestionFor(
            docById.get(c.documentId) ?? null,
            txById.get(c.transactionId)!,
            rules,
          );
          return {
            organizationId: ctx.organizationId,
            documentId: c.documentId,
            transactionId: c.transactionId,
            score: c.score,
            reasons: c.reasons,
            status: "SUGGESTED" as const,
            createdBy: "AUTO" as const,
            suggestedAccount: s?.accountNumber ?? null,
            suggestedVatCode: s?.vatCode ?? null,
            suggestionSource: s?.explanation ?? null,
          };
        }),
      });
      await tx.bankTransaction.updateMany({
        where: { id: { in: assigned.map((c) => c.transactionId) } },
        data: { status: "SUGGESTED" },
      });
    }
  });
  const high = assigned.filter((c) => c.score >= HIGH_CONFIDENCE).length;
  await audit(ctx.db, ctx, "matching.run", "Client", clientId, {
    suggested: assigned.length,
    high,
  });
  return {
    suggested: assigned.length,
    highConfidence: high,
    documentsConsidered: docs.length,
    transactionsConsidered: txs.length,
    durationMs: Date.now() - started,
  };
}

export const ConfirmSchema = z.object({
  accountNumber: z.string().trim().min(1, "Vælg en konto").max(10),
  vatCode: z.string().trim().min(1, "Vælg en momskode").max(10),
});

async function assertAccountAndVat(
  db: Pick<ScopedTx, "account" | "vatCode">,
  accountNumber: string,
  vatCode: string,
) {
  const [acc, vat] = await Promise.all([
    db.account.findFirst({ where: { number: accountNumber } }),
    db.vatCode.findFirst({ where: { code: vatCode } }),
  ]);
  if (!acc) throw badRequest(`Kontoen ${accountNumber} findes ikke i kontoplanen.`);
  if (!vat) throw badRequest(`Momskoden ${vatCode} findes ikke.`);
}

/** Create or strengthen a categorization rule from a confirmation. */
async function learnRule(
  db: Pick<ScopedTx, "categorizationRule">,
  organizationId: string,
  doc: Pick<Document, "supplierCvr" | "supplierName"> | null,
  bankText: string,
  accountNumber: string,
  vatCode: string,
): Promise<void> {
  const key = learningKey({
    supplierCvr: doc?.supplierCvr ?? null,
    supplierName: doc?.supplierName ?? null,
    bankText,
  });
  if (!key) return;
  const existing = await db.categorizationRule.findFirst({
    where: { matchType: key.matchType, pattern: key.pattern },
  });
  if (!existing) {
    await db.categorizationRule.create({
      data: {
        organizationId,
        ...key,
        accountNumber,
        vatCode,
        timesApplied: 1,
        createdFrom: "USER_CONFIRMATION",
      },
    });
  } else if (existing.accountNumber === accountNumber && existing.vatCode === vatCode) {
    await db.categorizationRule.update({
      where: { id: existing.id },
      data: { timesApplied: { increment: 1 } },
    });
  } else {
    // The bookkeeper chose differently: the latest decision wins and the count restarts.
    await db.categorizationRule.update({
      where: { id: existing.id },
      data: { accountNumber, vatCode, timesApplied: 1 },
    });
  }
}

function entryText(
  doc: Pick<Document, "supplierName" | "invoiceNumber" | "isCreditNote"> | null,
  tx: Pick<BankTransaction, "text">,
) {
  if (!doc?.supplierName) return tx.text.slice(0, 120);
  const kind = doc.isCreditNote ? "Kreditnota" : "Faktura";
  return `${doc.supplierName}${doc.invoiceNumber ? ` – ${kind} ${doc.invoiceNumber}` : ""}`.slice(
    0,
    120,
  );
}

/** Journal amount: expense (money out) is a positive debit on the expense account. */
export function journalAmount(transactionAmountOre: number): number {
  return -transactionAmountOre;
}

async function confirmInTx(
  tx: ScopedTx,
  ctx: SessionContext,
  match: { id: string; documentId: string; transactionId: string },
  input: { accountNumber: string; vatCode: string },
) {
  const [doc, bankTx] = await Promise.all([
    tx.document.findFirstOrThrow({
      where: { id: match.documentId, organizationId: ctx.organizationId },
    }),
    tx.bankTransaction.findFirstOrThrow({
      where: { id: match.transactionId, organizationId: ctx.organizationId },
      include: { bankAccount: { select: { clientId: true } } },
    }),
  ]);
  await tx.match.update({
    where: { id: match.id },
    data: {
      status: "CONFIRMED",
      confirmedById: ctx.userId,
      confirmedAt: new Date(),
      suggestedAccount: input.accountNumber,
      suggestedVatCode: input.vatCode,
    },
  });
  // Any other open suggestions for this document or transaction are now obsolete.
  await tx.match.deleteMany({
    where: {
      organizationId: ctx.organizationId,
      status: "SUGGESTED",
      id: { not: match.id },
      OR: [{ documentId: doc.id }, { transactionId: bankTx.id }],
    },
  });
  await tx.bankTransaction.update({ where: { id: bankTx.id }, data: { status: "MATCHED" } });
  const clientId = bankTx.bankAccount.clientId;
  const agg = await tx.journalEntry.aggregate({
    where: { clientId, organizationId: ctx.organizationId },
    _max: { voucherNumber: true },
  });
  await tx.journalEntry.create({
    data: {
      organizationId: ctx.organizationId,
      clientId,
      matchId: match.id,
      date: bankTx.bookingDate,
      text: entryText(doc, bankTx),
      accountNumber: input.accountNumber,
      vatCode: input.vatCode,
      amountOre: journalAmount(bankTx.amountOre),
      documentId: doc.id,
      transactionId: bankTx.id,
      voucherNumber: (agg._max.voucherNumber ?? 0) + 1,
    },
  });
  return { doc, bankTx };
}

async function getOpenMatch(ctx: SessionContext, matchId: string) {
  if (!IdSchema.safeParse(matchId).success) throw notFound("Matchet");
  const match = await ctx.db.match.findUnique({ where: { id: matchId } });
  if (!match) throw notFound("Matchet");
  if (match.status !== "SUGGESTED") throw conflict("Matchet er allerede behandlet.");
  return match;
}

export async function confirmMatch(ctx: SessionContext, matchId: string, raw: unknown) {
  const input = ConfirmSchema.parse(raw);
  const match = await getOpenMatch(ctx, matchId);
  await assertAccountAndVat(ctx.db, input.accountNumber, input.vatCode);
  const { doc, bankTx } = await ctx.db.$transaction(async (tx) => {
    const r = await confirmInTx(tx, ctx, match, input);
    await learnRule(
      tx,
      ctx.organizationId,
      r.doc,
      r.bankTx.text,
      input.accountNumber,
      input.vatCode,
    );
    return r;
  });
  await audit(ctx.db, ctx, "match.confirm", "Match", matchId, { score: match.score });
  return { matchId, documentId: doc.id, transactionId: bankTx.id };
}

export async function rejectMatch(ctx: SessionContext, matchId: string) {
  const match = await getOpenMatch(ctx, matchId);
  await ctx.db.$transaction(async (tx) => {
    await tx.match.update({ where: { id: match.id }, data: { status: "REJECTED" } });
    await tx.bankTransaction.update({
      where: { id: match.transactionId },
      data: { status: "UNMATCHED" },
    });
  });
  await audit(ctx.db, ctx, "match.reject", "Match", matchId, { score: match.score });
  return { matchId };
}

/** Undo a confirmed match (only while its journal entry is not exported). */
export async function undoMatch(ctx: SessionContext, matchId: string) {
  if (!IdSchema.safeParse(matchId).success) throw notFound("Matchet");
  const match = await ctx.db.match.findUnique({ where: { id: matchId } });
  if (!match) throw notFound("Matchet");
  if (match.status !== "CONFIRMED") throw conflict("Kun bekræftede match kan fortrydes.");
  const exported = await ctx.db.journalEntry.count({ where: { matchId, exported: true } });
  if (exported > 0)
    throw conflict("Posteringen er allerede eksporteret og kan ikke fortrydes her.");
  await ctx.db.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { matchId, organizationId: ctx.organizationId } });
    await tx.match.update({
      where: { id: matchId },
      data: { status: "REJECTED", confirmedAt: null, confirmedById: null },
    });
    await tx.bankTransaction.update({
      where: { id: match.transactionId },
      data: { status: "UNMATCHED" },
    });
  });
  await audit(ctx.db, ctx, "match.reject", "Match", matchId, { undo: true });
}

export const ManualMatchSchema = ConfirmSchema.extend({
  transactionId: IdSchema,
  documentId: IdSchema,
});

/** Manually pair a transaction with a document and confirm it in one step. */
export async function manualMatch(ctx: SessionContext, clientId: string, raw: unknown) {
  await getClient(ctx, clientId);
  const input = ManualMatchSchema.parse(raw);
  const [doc, bankTx] = await Promise.all([
    ctx.db.document.findFirst({ where: { id: input.documentId, clientId } }),
    ctx.db.bankTransaction.findFirst({
      where: { id: input.transactionId, bankAccount: { clientId } },
    }),
  ]);
  if (!doc) throw notFound("Bilaget");
  if (!bankTx) throw notFound("Bankposteringen");
  if (bankTx.status === "MATCHED") throw conflict("Bankposteringen er allerede afstemt.");
  const confirmed = await ctx.db.match.count({
    where: { documentId: doc.id, status: "CONFIRMED" },
  });
  if (confirmed > 0) throw conflict("Bilaget er allerede afstemt med en anden postering.");
  await assertAccountAndVat(ctx.db, input.accountNumber, input.vatCode);

  const scored = scorePair(toMatchDoc(doc), toMatchTx(bankTx));
  const reasons = ["Manuelt afstemt af bogholderen", ...(scored?.reasons ?? [])];
  const matchId = await ctx.db.$transaction(async (tx) => {
    const m = await tx.match.create({
      data: {
        organizationId: ctx.organizationId,
        documentId: doc.id,
        transactionId: bankTx.id,
        score: scored?.score ?? 0,
        reasons,
        status: "SUGGESTED",
        createdBy: "MANUAL",
      },
    });
    await confirmInTx(tx, ctx, m, input);
    await learnRule(tx, ctx.organizationId, doc, bankTx.text, input.accountNumber, input.vatCode);
    return m.id;
  });
  await audit(ctx.db, ctx, "match.manual", "Match", matchId);
  return { matchId };
}

export const TransactionActionSchema = z.object({
  action: z.enum(["IGNORE", "MISSING_RECEIPT", "RESET"]),
});

/** Mark a transaction as ignored (e.g. internal transfer), missing receipt, or reset it. */
export async function setTransactionState(
  ctx: SessionContext,
  transactionId: string,
  raw: unknown,
) {
  const { action } = TransactionActionSchema.parse(raw);
  if (!IdSchema.safeParse(transactionId).success) throw notFound("Bankposteringen");
  const t = await ctx.db.bankTransaction.findUnique({ where: { id: transactionId } });
  if (!t) throw notFound("Bankposteringen");
  if (t.status === "MATCHED") throw conflict("Posteringen er afstemt. Fortryd matchet først.");
  const status =
    action === "IGNORE"
      ? "IGNORED"
      : action === "MISSING_RECEIPT"
        ? "MISSING_RECEIPT"
        : "UNMATCHED";
  await ctx.db.$transaction(async (tx) => {
    await tx.match.deleteMany({
      where: { transactionId, status: "SUGGESTED", organizationId: ctx.organizationId },
    });
    await tx.bankTransaction.update({ where: { id: transactionId }, data: { status } });
  });
  await audit(
    ctx.db,
    ctx,
    action === "IGNORE"
      ? "transaction.ignore"
      : action === "MISSING_RECEIPT"
        ? "transaction.missing_receipt"
        : "transaction.reset",
    "BankTransaction",
    transactionId,
  );
  return { transactionId, status };
}

/** Preview of the bulk action: high-confidence suggestions that have an account + VAT suggestion. */
export async function bulkConfirmPreview(ctx: SessionContext, clientId: string) {
  await getClient(ctx, clientId);
  const matches = await ctx.db.match.findMany({
    where: { status: "SUGGESTED", score: { gte: HIGH_CONFIDENCE }, document: { clientId } },
    include: { transaction: { select: { amountOre: true } } },
  });
  const ready = matches.filter((m) => m.suggestedAccount && m.suggestedVatCode);
  return {
    count: ready.length,
    totalOre: ready.reduce((s, m) => s + Math.abs(m.transaction.amountOre), 0),
    skippedWithoutAccount: matches.length - ready.length,
    matchIds: ready.map((m) => m.id),
  };
}

export async function bulkConfirm(ctx: SessionContext, clientId: string) {
  const preview = await bulkConfirmPreview(ctx, clientId);
  let confirmed = 0;
  for (const id of preview.matchIds) {
    const m = await ctx.db.match.findUnique({ where: { id } });
    if (!m || m.status !== "SUGGESTED" || !m.suggestedAccount || !m.suggestedVatCode) continue;
    await assertAccountAndVat(ctx.db, m.suggestedAccount, m.suggestedVatCode);
    await ctx.db.$transaction(async (tx) => {
      const r = await confirmInTx(tx, ctx, m, {
        accountNumber: m.suggestedAccount!,
        vatCode: m.suggestedVatCode!,
      });
      await learnRule(
        tx,
        ctx.organizationId,
        r.doc,
        r.bankTx.text,
        m.suggestedAccount!,
        m.suggestedVatCode!,
      );
    });
    confirmed++;
  }
  await audit(ctx.db, ctx, "match.bulk_confirm", "Client", clientId, { confirmed });
  return { confirmed, skippedWithoutAccount: preview.skippedWithoutAccount };
}

/** Everything the review screen needs: open transactions with their suggestion (if any). */
export async function reviewQueue(ctx: SessionContext, clientId: string) {
  await getClient(ctx, clientId);
  const rules = await loadRules(ctx.db);
  const txs = await ctx.db.bankTransaction.findMany({
    where: { bankAccount: { clientId }, status: { in: ["SUGGESTED", "UNMATCHED"] } },
    orderBy: [{ bookingDate: "asc" }, { createdAt: "asc" }],
    include: {
      matches: {
        where: { status: "SUGGESTED" },
        include: { document: true },
        orderBy: { score: "desc" },
        take: 1,
      },
    },
  });
  // Suggested first (highest score first), then unmatched outgoing, then unmatched incoming.
  const items = txs.map((t) => {
    const m = t.matches[0] ?? null;
    const fallback = m ? null : suggestionFor(null, t, rules);
    return {
      transaction: {
        id: t.id,
        bookingDate: t.bookingDate,
        text: t.text,
        amountOre: t.amountOre,
        status: t.status,
      },
      match: m
        ? {
            id: m.id,
            score: m.score,
            reasons: Array.isArray(m.reasons) ? (m.reasons as string[]) : [],
            suggestedAccount: m.suggestedAccount,
            suggestedVatCode: m.suggestedVatCode,
            suggestionSource: m.suggestionSource,
            document: {
              id: m.document.id,
              originalFilename: m.document.originalFilename,
              mimeType: m.document.mimeType,
              supplierName: m.document.supplierName,
              supplierCvr: m.document.supplierCvr,
              invoiceNumber: m.document.invoiceNumber,
              invoiceDate: m.document.invoiceDate,
              dueDate: m.document.dueDate,
              totalAmountOre: m.document.totalAmountOre,
              vatAmountOre: m.document.vatAmountOre,
              currency: m.document.currency,
              description: m.document.description,
              isCreditNote: m.document.isCreditNote,
              warnings: Array.isArray(m.document.extractionWarnings)
                ? (m.document.extractionWarnings as string[])
                : [],
            },
          }
        : null,
      fallbackSuggestion: fallback
        ? {
            accountNumber: fallback.accountNumber,
            vatCode: fallback.vatCode,
            explanation: fallback.explanation,
          }
        : null,
    };
  });
  items.sort((a, b) => {
    const rank = (x: (typeof items)[number]) => (x.match ? 0 : x.transaction.amountOre < 0 ? 1 : 2);
    return (
      rank(a) - rank(b) ||
      (b.match?.score ?? 0) - (a.match?.score ?? 0) ||
      +a.transaction.bookingDate - +b.transaction.bookingDate
    );
  });
  return items;
}

/** Search candidate documents for a manual match, ranked by match score, then by search text. */
export async function searchDocumentsForTransaction(
  ctx: SessionContext,
  clientId: string,
  transactionId: string,
  q: string,
) {
  await getClient(ctx, clientId);
  const t = await ctx.db.bankTransaction.findFirst({
    where: { id: transactionId, bankAccount: { clientId } },
  });
  if (!t) throw notFound("Bankposteringen");
  const docs = await ctx.db.document.findMany({
    where: { clientId, status: "EXTRACTED", matches: { none: { status: "CONFIRMED" } } },
    orderBy: { invoiceDate: "desc" },
    take: 500,
  });
  const query = q.trim().toLowerCase();
  const ranked = new Map(
    rankDocumentsForTransaction(toMatchTx(t), docs.map(toMatchDoc)).map((c) => [c.documentId, c]),
  );
  const filtered = docs.filter((d) => {
    if (!query) return true;
    const hay =
      `${d.supplierName ?? ""} ${d.invoiceNumber ?? ""} ${d.originalFilename} ${d.totalAmountOre !== null ? (Math.abs(d.totalAmountOre) / 100).toFixed(2).replace(".", ",") : ""}`.toLowerCase();
    return hay.includes(query);
  });
  filtered.sort((a, b) => (ranked.get(b.id)?.score ?? -1) - (ranked.get(a.id)?.score ?? -1));
  const rules = await loadRules(ctx.db);
  return filtered.slice(0, 30).map((d) => {
    const s = suggestionFor(d, t, rules);
    return {
      id: d.id,
      supplierName: d.supplierName,
      invoiceNumber: d.invoiceNumber,
      invoiceDate: d.invoiceDate,
      totalAmountOre: d.totalAmountOre,
      currency: d.currency,
      originalFilename: d.originalFilename,
      score: ranked.get(d.id)?.score ?? null,
      suggestedAccount: s?.accountNumber ?? null,
      suggestedVatCode: s?.vatCode ?? null,
    };
  });
}
