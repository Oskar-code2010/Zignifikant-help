import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { SessionContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { badRequest } from "@/lib/api/errors";
import { fromIsoDate, formatDate } from "@/lib/dates";
import { buildKassekladdeCsv, exportFilename } from "@/lib/export/kassekladde";
import { formatDKK } from "@/lib/money";
import { getClient } from "./clients";

const Period = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export const ExportSchema = Period.extend({
  preset: z.enum(["generic", "economic", "dinero"]),
  includeExported: z.boolean().default(false),
});

function periodWhere(
  clientId: string,
  from: string | undefined,
  to: string | undefined,
): Prisma.JournalEntryWhereInput {
  const f = fromIsoDate(from);
  const t = fromIsoDate(to);
  return {
    clientId,
    ...(f || t ? { date: { ...(f ? { gte: f } : {}), ...(t ? { lte: t } : {}) } } : {}),
  };
}

export async function exportPreview(ctx: SessionContext, clientId: string, raw: unknown) {
  await getClient(ctx, clientId);
  const p = Period.parse(raw);
  const entries = await ctx.db.journalEntry.findMany({
    where: periodWhere(clientId, p.from || undefined, p.to || undefined),
    orderBy: [{ date: "asc" }, { voucherNumber: "asc" }],
  });
  return {
    entries,
    newCount: entries.filter((e) => !e.exported).length,
    exportedCount: entries.filter((e) => e.exported).length,
  };
}

/** Build the CSV and mark the included entries as exported. */
export async function createExport(ctx: SessionContext, clientId: string, raw: unknown) {
  const client = await getClient(ctx, clientId);
  const input = ExportSchema.parse(raw);
  const where = periodWhere(clientId, input.from || undefined, input.to || undefined);
  const entries = await ctx.db.journalEntry.findMany({
    where: input.includeExported ? where : { ...where, exported: false },
  });
  if (entries.length === 0) {
    throw badRequest(
      input.includeExported
        ? "Der er ingen kladdeposteringer i perioden."
        : "Der er ingen nye kladdeposteringer i perioden. Vælg 'Medtag allerede eksporterede' for at eksportere igen.",
    );
  }
  const csv = buildKassekladdeCsv(entries, input.preset, client.bankLedgerAccount);
  const now = new Date();
  await ctx.db.journalEntry.updateMany({
    where: { id: { in: entries.map((e) => e.id) } },
    data: { exported: true, exportedAt: now },
  });
  await audit(ctx.db, ctx, "export.create", "Client", clientId, {
    preset: input.preset,
    entries: entries.length,
    reexported: entries.filter((e) => e.exported).length,
  });
  return {
    csv,
    filename: exportFilename(
      client.name,
      input.preset,
      fromIsoDate(input.from || undefined),
      fromIsoDate(input.to || undefined),
    ),
    count: entries.length,
  };
}

/** Outgoing transactions without a matched document ("Mangler bilag"). */
export async function missingReceipts(ctx: SessionContext, clientId: string) {
  const client = await getClient(ctx, clientId);
  const txs = await ctx.db.bankTransaction.findMany({
    where: {
      bankAccount: { clientId },
      amountOre: { lt: 0 },
      status: { in: ["UNMATCHED", "MISSING_RECEIPT"] },
    },
    orderBy: { bookingDate: "asc" },
  });
  const total = txs.reduce((s, t) => s + t.amountOre, 0);
  const lines = txs.map(
    (t) => `- ${formatDate(t.bookingDate)}  ${t.text}  ${formatDKK(t.amountOre)}`,
  );
  const email = [
    `Emne: Manglende bilag – ${client.name}`,
    "",
    "Hej",
    "",
    `Vi mangler bilag til følgende ${txs.length} ${txs.length === 1 ? "betaling" : "betalinger"} på jeres bankkonto:`,
    "",
    ...lines,
    "",
    `I alt: ${formatDKK(total)}`,
    "",
    "Vil I sende fakturaer eller kvitteringer for posterne? Hvis en betaling er privat eller en overførsel mellem egne konti, så skriv det gerne.",
    "",
    "På forhånd tak.",
    "",
    "Venlig hilsen",
  ].join("\n");
  return { client, transactions: txs, totalOre: total, email };
}
