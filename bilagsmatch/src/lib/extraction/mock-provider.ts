import { createHash } from "node:crypto";
import { findSampleDocument, totals } from "@/lib/seed/sample-documents";
import { parseDanishDate, toIsoDate } from "@/lib/dates";
import { tryParseDanishAmount } from "@/lib/money";
import type { ExtractionInput, ExtractionProvider, ExtractionResult } from "./types";

/**
 * Deterministic offline provider ("Demo-tilstand").
 * - Known sample documents (by filename) → their real data with high confidence.
 * - Unknown files → plausible data derived from the filename (supplier words, amount, date) and
 *   the file hash, with low confidence so the bookkeeper is prompted to check it.
 */
export class MockExtractionProvider implements ExtractionProvider {
  readonly name = "mock";

  async extract(input: ExtractionInput): Promise<ExtractionResult> {
    const sample = findSampleDocument(input.filename);
    if (sample) {
      const t = totals(sample);
      return {
        supplierName: sample.supplierName,
        supplierCvr: sample.supplierCvr,
        invoiceNumber: sample.invoiceNumber,
        invoiceDate: sample.invoiceDate,
        dueDate: sample.dueDate,
        totalAmountOre: t.totalOre,
        vatAmountOre: t.vatOre,
        netAmountOre: t.netOre,
        currency: sample.currency,
        description: sample.lines.map((l) => l.description).join("; "),
        lineItems: sample.lines.map((l) => ({
          description: l.description,
          amountOre: Math.round(l.quantity * l.unitPriceOre),
        })),
        isCreditNote: Boolean(sample.isCreditNote),
        confidence: 96,
      };
    }
    return guessFromFilename(input);
  }
}

const STOP_WORDS = new Set(["faktura", "kvittering", "invoice", "receipt", "bilag", "rechnung", "pdf", "scan", "img"]);

export function guessFromFilename(input: ExtractionInput): ExtractionResult {
  const hash = createHash("sha256").update(input.bytes).digest();
  const base = input.filename.replace(/\.[a-z0-9]+$/i, "");

  const dateMatch = /(\d{4}-\d{2}-\d{2})|(\d{2}[-.]\d{2}[-.]\d{4})/.exec(base);
  const date = dateMatch ? parseDanishDate(dateMatch[0]) : null;
  const withoutDate = dateMatch ? base.replace(dateMatch[0], " ") : base;

  // An amount in the name, e.g. "gls_1.249,00" or "telia-349.00".
  const amountMatch = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})(?!\d)/.exec(withoutDate);
  let total = amountMatch ? tryParseDanishAmount(amountMatch[0], "auto") : null;
  if (total === null) total = 5000 + (hash.readUInt32BE(0) % 495000); // 50–5.000 kr, deterministic

  const words = withoutDate
    .replace(amountMatch?.[0] ?? "", " ")
    .split(/[^a-zA-ZæøåÆØÅ]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));
  const supplier = words.length > 0 ? words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ") : null;

  const vat = Math.round((total * 20) / 100);
  return {
    supplierName: supplier,
    supplierCvr: null,
    invoiceNumber: hash.toString("hex").slice(0, 8).toUpperCase(),
    invoiceDate: date ? toIsoDate(date) : null,
    dueDate: null,
    totalAmountOre: total,
    vatAmountOre: vat,
    netAmountOre: total - vat,
    currency: "DKK",
    description: "Demo-aflæsning baseret på filnavnet – kontrollér felterne.",
    lineItems: [],
    isCreditNote: false,
    confidence: 35,
  };
}
