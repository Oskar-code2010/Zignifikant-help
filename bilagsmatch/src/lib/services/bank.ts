import { z } from "zod";
import type { SessionContext } from "@/lib/auth/session";
import { analyzeCsv, dedupeHashes, ENCODING_LABELS, MAPPING_FIELDS, type ParseOptions } from "@/lib/bank-csv";
import type { CsvEncoding } from "@/lib/bank-csv/decode";
import { DATE_FORMATS, formatDate, fromIsoDate } from "@/lib/dates";
import { badRequest, notFound } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { getClient } from "./clients";
import { IdSchema } from "@/lib/validation/schemas";
import type { Prisma, TransactionStatus } from "@prisma/client";

export const MAX_CSV_BYTES = 5 * 1024 * 1024;

const ColIdx = z.number().int().min(0).max(200).nullable();
export const MappingSchema = z.object({
  bookingDate: ColIdx,
  valueDate: ColIdx,
  text: ColIdx,
  amount: ColIdx,
  debit: ColIdx,
  credit: ColIdx,
  balance: ColIdx,
  currency: ColIdx,
});

export const ImportOptionsSchema = z
  .object({
    delimiter: z.enum([";", ",", "\t"]),
    decimal: z.enum([",", "."]),
    dateFormat: z.enum(DATE_FORMATS),
    headerRowIndex: z.number().int().min(-1).max(50),
    mapping: MappingSchema,
    bankAccountId: IdSchema.optional(),
    newBankAccountName: z.string().trim().min(1).max(100).optional(),
  })
  .refine((o) => o.mapping.bookingDate !== null, { message: "Vælg en kolonne for dato" })
  .refine((o) => o.mapping.text !== null, { message: "Vælg en kolonne for tekst" })
  .refine((o) => o.mapping.amount !== null || o.mapping.debit !== null || o.mapping.credit !== null, {
    message: "Vælg en beløbskolonne (eller Ud/Ind-kolonner)",
  });

/** PDF, PNG, JPEG, ZIP/XLSX signatures or NUL bytes mean this is not a text CSV. */
export function looksBinary(bytes: Uint8Array): boolean {
  const head = Array.from(bytes.subarray(0, 4));
  const sigs = [
    [0x25, 0x50, 0x44, 0x46],
    [0x89, 0x50, 0x4e, 0x47],
    [0xff, 0xd8, 0xff],
    [0x50, 0x4b, 0x03, 0x04],
  ];
  if (sigs.some((sig) => sig.every((b, i) => head[i] === b))) return true;
  return bytes.subarray(0, 1024).includes(0);
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw badRequest("Ugyldige importindstillinger.");
  }
}

async function readCsvFile(form: FormData): Promise<{ bytes: Uint8Array; filename: string }> {
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Vælg en CSV-fil.");
  if (file.size === 0) throw badRequest("Filen er tom.");
  if (file.size > MAX_CSV_BYTES) throw badRequest("CSV-filen er for stor (maks. 5 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksBinary(bytes)) {
    throw badRequest("Filen ligner ikke en CSV-fil. Eksportér kontoudtoget som CSV fra netbanken.");
  }
  return { bytes, filename: file.name.slice(0, 200) };
}

/** Parse the uploaded CSV with detected (or user-adjusted) settings and return a preview. */
export async function previewBankCsv(ctx: SessionContext, clientId: string, form: FormData) {
  await getClient(ctx, clientId);
  const { bytes } = await readCsvFile(form);
  const overridesRaw = form.get("options");
  let overrides: Partial<ParseOptions> | undefined;
  if (typeof overridesRaw === "string" && overridesRaw !== "") {
    const parsed = z
      .object({
        delimiter: z.enum([";", ",", "\t"]).optional(),
        decimal: z.enum([",", "."]).optional(),
        dateFormat: z.enum(DATE_FORMATS).optional(),
        headerRowIndex: z.number().int().min(-1).max(50).optional(),
        mapping: MappingSchema.optional(),
      })
      .parse(safeJson(overridesRaw));
    overrides = {
      ...(parsed.delimiter ? { delimiter: parsed.delimiter } : {}),
      ...(parsed.decimal ? { decimal: parsed.decimal } : {}),
      ...(parsed.dateFormat ? { dateFormat: parsed.dateFormat } : {}),
      ...(parsed.headerRowIndex !== undefined ? { headerRowIndex: parsed.headerRowIndex } : {}),
      ...(parsed.mapping ? { mapping: parsed.mapping } : {}),
    };
  }
  const { detection, options, result, rawRows } = analyzeCsv(bytes, overrides);
  const headers =
    options.headerRowIndex >= 0
      ? (rawRows[options.headerRowIndex] ?? []).map((h, i) => h || `Kolonne ${i + 1}`)
      : detection.headers;
  return {
    detection: {
      ...detection,
      encodingLabel: ENCODING_LABELS[detection.encoding as CsvEncoding] ?? detection.encoding,
    },
    options,
    headers,
    rawPreview: rawRows.slice(Math.max(0, options.headerRowIndex + 1), options.headerRowIndex + 11),
    preview: result.rows.slice(0, 10).map((r) => ({
      line: r.line,
      bookingDate: formatDate(r.bookingDate),
      text: r.text,
      amountOre: r.amountOre,
      balanceOre: r.balanceOre,
    })),
    totals: { rows: result.rows.length, failed: result.failed.length, skipped: result.skipped },
    failed: result.failed.slice(0, 50).map((f) => ({ line: f.line, reason: f.reason })),
  };
}

async function resolveBankAccount(
  ctx: SessionContext,
  clientId: string,
  opts: { bankAccountId?: string; newBankAccountName?: string },
) {
  if (opts.bankAccountId) {
    const acc = await ctx.db.bankAccount.findFirst({ where: { id: opts.bankAccountId, clientId } });
    if (!acc) throw notFound("Bankkontoen");
    return acc;
  }
  const name = opts.newBankAccountName ?? "Bankkonto";
  const existing = await ctx.db.bankAccount.findFirst({ where: { clientId, name } });
  if (existing) return existing;
  return ctx.db.bankAccount.create({ data: { organizationId: ctx.organizationId, clientId, name } });
}

/** Import transactions. Duplicates (same dedupe hash on the same bank account) are skipped. */
export async function importBankCsv(ctx: SessionContext, clientId: string, form: FormData) {
  await getClient(ctx, clientId);
  const { bytes, filename } = await readCsvFile(form);
  const optionsRaw = form.get("options");
  if (typeof optionsRaw !== "string") throw badRequest("Mangler importindstillinger.");
  const opts = ImportOptionsSchema.parse(safeJson(optionsRaw));
  const { result, detection } = analyzeCsv(bytes, {
    delimiter: opts.delimiter,
    decimal: opts.decimal,
    dateFormat: opts.dateFormat,
    headerRowIndex: opts.headerRowIndex,
    mapping: opts.mapping,
  });
  if (result.rows.length === 0) {
    throw badRequest("Ingen gyldige rækker fundet. Tjek kolonnevalg, datoformat og decimaltegn.", {
      failed: result.failed.slice(0, 20),
    });
  }
  const account = await resolveBankAccount(ctx, clientId, opts);
  const hashes = dedupeHashes(result.rows);
  const existing = await ctx.db.bankTransaction.findMany({
    where: { bankAccountId: account.id, dedupeHash: { in: hashes } },
    select: { dedupeHash: true },
  });
  const existingSet = new Set(existing.map((e) => e.dedupeHash));
  const toInsert = result.rows
    .map((r, i) => ({ r, hash: hashes[i]! }))
    .filter(({ hash }) => !existingSet.has(hash));

  const imp = await ctx.db.$transaction(async (tx) => {
    const created = await tx.bankImport.create({
      data: {
        organizationId: ctx.organizationId,
        bankAccountId: account.id,
        filename,
        rowCount: result.rows.length + result.failed.length,
        importedCount: toInsert.length,
        duplicateCount: result.rows.length - toInsert.length,
        failedCount: result.failed.length,
        detectedFormat: `${detection.formatName} · ${ENCODING_LABELS[detection.encoding as CsvEncoding] ?? detection.encoding}`,
      },
    });
    if (toInsert.length > 0) {
      await tx.bankTransaction.createMany({
        data: toInsert.map(({ r, hash }) => ({
          organizationId: ctx.organizationId,
          bankAccountId: account.id,
          bankImportId: created.id,
          bookingDate: r.bookingDate,
          valueDate: r.valueDate,
          text: r.text,
          amountOre: r.amountOre,
          balanceOre: r.balanceOre,
          currency: r.currency,
          dedupeHash: hash,
        })),
      });
    }
    return created;
  });
  await audit(ctx.db, ctx, "bank.import", "BankImport", imp.id, {
    imported: imp.importedCount,
    duplicates: imp.duplicateCount,
    failed: imp.failedCount,
  });
  return {
    importId: imp.id,
    bankAccountId: account.id,
    imported: imp.importedCount,
    duplicates: imp.duplicateCount,
    failed: result.failed.map((f) => ({ line: f.line, reason: f.reason })),
  };
}

export const TransactionFilterSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.enum(["UNMATCHED", "SUGGESTED", "MATCHED", "IGNORED", "MISSING_RECEIPT", "ALL"]).optional(),
  minOre: z.coerce.number().int().optional(),
  maxOre: z.coerce.number().int().optional(),
  q: z.string().max(100).optional(),
  bankAccountId: IdSchema.optional(),
});

export async function listTransactions(ctx: SessionContext, clientId: string, raw: unknown) {
  await getClient(ctx, clientId);
  const f = TransactionFilterSchema.parse(raw);
  const where: Prisma.BankTransactionWhereInput = { bankAccount: { clientId } };
  if (f.bankAccountId) where.bankAccountId = f.bankAccountId;
  const from = fromIsoDate(f.from);
  const to = fromIsoDate(f.to);
  if (from || to) where.bookingDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (f.status && f.status !== "ALL") where.status = f.status as TransactionStatus;
  if (f.q) where.text = { contains: f.q };
  // Amount range filters on the absolute amount.
  if (f.minOre !== undefined || f.maxOre !== undefined) {
    const min = f.minOre ?? 0;
    const max = f.maxOre ?? 2_147_483_647;
    where.OR = [
      { amountOre: { gte: min, lte: max } },
      { amountOre: { gte: -max, lte: -min } },
    ];
  }
  const transactions = await ctx.db.bankTransaction.findMany({
    where,
    orderBy: [{ bookingDate: "desc" }, { createdAt: "asc" }],
    take: 1000,
    include: { bankAccount: { select: { name: true } } },
  });
  return transactions;
}

export async function listBankAccounts(ctx: SessionContext, clientId: string) {
  await getClient(ctx, clientId);
  return ctx.db.bankAccount.findMany({ where: { clientId }, orderBy: { createdAt: "asc" } });
}

export async function listImports(ctx: SessionContext, clientId: string) {
  await getClient(ctx, clientId);
  return ctx.db.bankImport.findMany({
    where: { bankAccount: { clientId } },
    orderBy: { importedAt: "desc" },
    take: 20,
  });
}

export { MAPPING_FIELDS };
