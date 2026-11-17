import { detectDateFormat, type DateFormat } from "@/lib/dates";
import { tokenize } from "./parse";
import type { ColumnMapping, Delimiter, DetectionResult } from "./types";

const DELIMITERS: Delimiter[] = [";", ",", "\t"];

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/^﻿/, "")
    .replace(/["'.:]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Header synonyms in priority order (first match wins for each field). */
const HEADER_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  bookingDate: ["bogføringsdato", "bogfoeringsdato", "bogført", "dato", "posteringsdato", "transaktionsdato", "date", "booking date"],
  valueDate: ["rentedato", "valørdato", "valør", "valuta dato", "value date"],
  text: ["tekst", "posteringstekst", "transaktionstekst", "beskrivelse", "text", "description", "navn", "modtager"],
  amount: ["beløb", "beloeb", "beløb i dkk", "beløb dkk", "amount", "beløb (dkk)"],
  debit: ["ud", "udbetaling", "hævet", "hævning", "debet", "debit"],
  credit: ["ind", "indbetaling", "indsat", "kredit", "credit"],
  balance: ["saldo", "bogført saldo", "balance", "disponibel saldo"],
  currency: ["valuta", "currency", "møntenhed"],
};

const ALL_SYNONYMS = new Set(Object.values(HEADER_SYNONYMS).flat());

export function emptyMapping(): ColumnMapping {
  return {
    bookingDate: null,
    valueDate: null,
    text: null,
    amount: null,
    debit: null,
    credit: null,
    balance: null,
    currency: null,
  };
}

/** Pick the delimiter that splits the first lines into the most consistent number (>1) of columns. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 30).join("\n");
  let best: { d: Delimiter; score: number } = { d: ";", score: -1 };
  for (const d of DELIMITERS) {
    const rows = tokenize(sample, d).filter((r) => r.length > 1);
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    const [modeCols, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    // Consistency matters most, then column count.
    const score = modeCount * 100 + modeCols;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

function headerScore(row: string[]): number {
  return row.filter((c) => ALL_SYNONYMS.has(normalizeHeader(c))).length;
}

/** Find the header row in the first 15 rows (≥2 known column names), or -1. */
export function detectHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const s = headerScore(rows[i] ?? []);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

export function mappingFromHeaders(headers: string[]): ColumnMapping {
  const m = emptyMapping();
  const norm = headers.map(normalizeHeader);
  const used = new Set<number>();
  for (const field of Object.keys(HEADER_SYNONYMS) as (keyof ColumnMapping)[]) {
    for (const syn of HEADER_SYNONYMS[field]) {
      const idx = norm.findIndex((h, i) => h === syn && !used.has(i));
      if (idx !== -1) {
        m[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  if (m.amount !== null) {
    m.debit = null;
    m.credit = null;
  }
  return m;
}

const looksLikeDate = (s: string) => detectDateFormat([s]) !== null;
const looksLikeAmount = (s: string) => /^[-+(−]?\s*[\d.,\s]+\s*-?\)?$/.test(s) && /\d/.test(s);

/** For header-less files: infer columns from content (dates, amounts, longest text). */
export function mappingFromContent(rows: string[][]): ColumnMapping {
  const m = emptyMapping();
  const data = rows.filter((r) => r.some((c) => c !== "")).slice(0, 30);
  const cols = Math.max(0, ...data.map((r) => r.length));
  const dateCols: number[] = [];
  const amountCols: number[] = [];
  let textCol: number | null = null;
  let longest = -1;
  for (let c = 0; c < cols; c++) {
    const values = data.map((r) => r[c] ?? "").filter((v) => v !== "");
    if (values.length === 0) continue;
    if (values.every(looksLikeDate)) dateCols.push(c);
    else if (values.every(looksLikeAmount)) amountCols.push(c);
    else {
      const avg = values.reduce((s, v) => s + v.length, 0) / values.length;
      if (avg > longest) {
        longest = avg;
        textCol = c;
      }
    }
  }
  m.bookingDate = dateCols[0] ?? null;
  m.valueDate = dateCols[1] ?? null;
  m.text = textCol;
  m.amount = amountCols[0] ?? null;
  m.balance = amountCols[1] ?? null;
  return m;
}

/** Decimal separator used by amount cells in this file. */
export function detectDecimal(samples: string[]): "," | "." {
  let comma = 0;
  let point = 0;
  for (const s of samples) {
    const v = s.trim();
    if (/\d,\d{1,2}\s*-?\)?$/.test(v)) comma++;
    else if (/\d\.\d{1,2}\s*-?\)?$/.test(v)) point++;
    else if (/\d,\d{3}\.\d/.test(v)) point++;
    else if (/\d\.\d{3},\d/.test(v)) comma++;
  }
  return point > comma ? "." : ",";
}

function guessFormatName(headers: string[], hasDebitCredit: boolean): string {
  const h = headers.map(normalizeHeader);
  if (h.includes("afstemt") || h.includes("status")) return "Ligner Danske Bank-eksport";
  if (h.includes("bogføringsdato") && h.includes("beskrivelse")) return "Ligner Nordea-eksport";
  if (h.includes("valør") || h.includes("valørdato")) return "Ligner Jyske Bank-eksport";
  if (hasDebitCredit) return "Ud/Ind-kolonner (fx Spar Nord)";
  if (h.length > 0 && h.includes("valuta") && h.includes("beskrivelse")) return "Ligner Lunar-eksport";
  return h.length > 0 ? "Generisk CSV med overskrifter" : "CSV uden overskrifter";
}

/** Auto-detect delimiter, header, mapping, decimal and date format from decoded text. */
export function detectFormat(text: string, encoding: string): DetectionResult {
  const delimiter = detectDelimiter(text);
  const rows = tokenize(text, delimiter);
  const headerRowIndex = detectHeaderRow(rows);
  const columnCount = Math.max(0, ...rows.map((r) => r.length));
  let headers: string[];
  let mapping: ColumnMapping;
  if (headerRowIndex >= 0) {
    headers = (rows[headerRowIndex] ?? []).map((h) => h.replace(/^﻿/, ""));
    mapping = mappingFromHeaders(headers);
  } else {
    headers = Array.from({ length: columnCount }, (_, i) => `Kolonne ${i + 1}`);
    mapping = mappingFromContent(rows);
  }
  const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c !== ""));
  const dateSamples = mapping.bookingDate === null ? [] : dataRows.map((r) => r[mapping.bookingDate!] ?? "");
  const dateFormat: DateFormat =
    detectDateFormat(dateSamples.filter(looksLikeDate)) ?? "dd-mm-yyyy";
  const amountIdx = [mapping.amount, mapping.debit, mapping.credit, mapping.balance].filter(
    (x): x is number => x !== null,
  );
  const amountSamples = dataRows.flatMap((r) => amountIdx.map((i) => r[i] ?? "")).filter((s) => s !== "");
  const decimal = detectDecimal(amountSamples);
  const hasDebitCredit = mapping.amount === null && (mapping.debit !== null || mapping.credit !== null);

  return {
    encoding,
    delimiter,
    decimal,
    dateFormat,
    headerRowIndex,
    headers: headers.length < columnCount
      ? [...headers, ...Array.from({ length: columnCount - headers.length }, (_, i) => `Kolonne ${headers.length + i + 1}`)]
      : headers,
    mapping,
    formatName: guessFormatName(headerRowIndex >= 0 ? headers : [], hasDebitCredit),
    columnCount,
  };
}
