import Papa from "papaparse";
import { parseDateWithFormat, toIsoDate } from "@/lib/dates";
import { parseDanishAmount, AmountParseError } from "@/lib/money";
import { createHash } from "node:crypto";
import type { Delimiter, FailedRow, ParseOptions, ParseResult, ParsedRow } from "./types";

/** Split CSV text into rows of cells (quotes and embedded delimiters/newlines handled by papaparse). */
export function tokenize(text: string, delimiter: Delimiter): string[][] {
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false, quoteChar: '"' });
  return result.data.map((row) => row.map((c) => (c ?? "").trim()));
}

const SUMMARY_WORDS = /\b(saldo|i alt|ialt|total|sum|primo|ultimo|udskrevet|periode|kontonr|konto)\b/i;

function isBlankRow(cells: string[]): boolean {
  return cells.every((c) => c === "");
}

function cell(cells: string[], idx: number | null): string {
  return idx === null ? "" : (cells[idx] ?? "");
}

/** Parse all data rows with an explicit mapping. Never throws for bad rows; they are reported. */
export function parseRows(rows: string[][], opts: ParseOptions): ParseResult {
  const { mapping } = opts;
  const out: ParsedRow[] = [];
  const failed: FailedRow[] = [];
  let skipped = 0;
  const start = opts.headerRowIndex + 1;

  for (let i = Math.max(0, start); i < rows.length; i++) {
    const cells = rows[i] ?? [];
    const line = i + 1;
    if (isBlankRow(cells)) {
      skipped++;
      continue;
    }
    const dateRaw = cell(cells, mapping.bookingDate);
    const hasAmountCells =
      cell(cells, mapping.amount) !== "" || cell(cells, mapping.debit) !== "" || cell(cells, mapping.credit) !== "";
    const bookingDate = parseDateWithFormat(dateRaw, opts.dateFormat);

    if (!bookingDate) {
      // Junk: summary/footer lines without a date ("Saldo i alt;;12.345,67").
      const joined = cells.join(" ");
      if (dateRaw === "" || !hasAmountCells || SUMMARY_WORDS.test(joined)) {
        skipped++;
        continue;
      }
      failed.push({ line, reason: `Ugyldig dato "${dateRaw}" (forventet ${opts.dateFormat})`, raw: cells });
      continue;
    }

    let amountOre: number;
    try {
      if (mapping.amount !== null) {
        const raw = cell(cells, mapping.amount);
        if (raw === "") throw new AmountParseError(raw, "beløb mangler");
        amountOre = parseDanishAmount(raw, opts.decimal);
      } else if (mapping.debit !== null || mapping.credit !== null) {
        const d = cell(cells, mapping.debit);
        const c = cell(cells, mapping.credit);
        if (d === "" && c === "") throw new AmountParseError("", "både Ud og Ind er tomme");
        const outOre = d === "" ? 0 : Math.abs(parseDanishAmount(d, opts.decimal));
        const inOre = c === "" ? 0 : Math.abs(parseDanishAmount(c, opts.decimal));
        amountOre = inOre - outOre;
      } else {
        throw new AmountParseError("", "ingen beløbskolonne valgt");
      }
    } catch (e) {
      failed.push({ line, reason: e instanceof Error ? e.message : "Ugyldigt beløb", raw: cells });
      continue;
    }

    let balanceOre: number | null = null;
    const balRaw = cell(cells, mapping.balance);
    if (balRaw !== "") {
      try {
        balanceOre = parseDanishAmount(balRaw, opts.decimal);
      } catch {
        balanceOre = null; // A broken balance should not reject the transaction.
      }
    }

    const text = cell(cells, mapping.text).replace(/\s+/g, " ").trim();
    if (text === "") {
      failed.push({ line, reason: "Teksten er tom", raw: cells });
      continue;
    }
    const valueRaw = cell(cells, mapping.valueDate);
    const currency = (cell(cells, mapping.currency) || "DKK").toUpperCase().slice(0, 3);

    out.push({
      line,
      bookingDate,
      valueDate: valueRaw ? parseDateWithFormat(valueRaw, opts.dateFormat) : null,
      text: text.slice(0, 500),
      amountOre,
      balanceOre,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "DKK",
    });
  }
  return { rows: out, failed, skipped };
}

/** Normalize bank text for dedupe hashing (case/whitespace-insensitive). */
function normalizeForHash(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Compute a dedupe hash per row. Identical rows inside the same file (two equal coffees on the same day)
 * get an occurrence counter, so re-importing the file yields the same hashes and is fully deduplicated.
 */
export function dedupeHashes(rows: Pick<ParsedRow, "bookingDate" | "amountOre" | "text" | "balanceOre">[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${toIsoDate(r.bookingDate)}|${r.amountOre}|${normalizeForHash(r.text)}|${r.balanceOre ?? ""}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha256").update(`${base}|${n}`).digest("hex");
  });
}
