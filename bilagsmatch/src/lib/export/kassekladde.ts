/**
 * Kassekladde (journal) CSV export. Pure functions.
 * Format: UTF-8 with BOM, ";" delimiter, decimal comma, dd-mm-yyyy dates, CRLF line endings,
 * so Excel opens it with æøå intact and e-conomic/Dinero/Billy can import it after column mapping.
 */
import { formatDate } from "@/lib/dates";
import { formatExportAmount } from "@/lib/money";

export type ExportPreset = "generic" | "economic" | "dinero";

export const PRESET_LABELS: Record<ExportPreset, string> = {
  generic: "Generisk kassekladde",
  economic: "e-conomic-kompatibel",
  dinero: "Dinero-kompatibel",
};

export interface ExportEntry {
  date: Date;
  voucherNumber: number;
  text: string;
  accountNumber: string;
  vatCode: string;
  amountOre: number;
}

type Column = {
  header: string;
  value: (e: ExportEntry, counterAccount: string) => string;
  isText?: boolean;
};

const date: Column["value"] = (e) => formatDate(e.date);
const voucher: Column["value"] = (e) => String(e.voucherNumber);
const text: Column["value"] = (e) => e.text;
const account: Column["value"] = (e) => e.accountNumber;
const vat: Column["value"] = (e) => (e.vatCode === "NONE" ? "" : e.vatCode);
const amount: Column["value"] = (e) => formatExportAmount(e.amountOre);
const counter: Column["value"] = (_e, c) => c;

/** Column layouts. Verify against the target system's current import specification before use. */
export const PRESET_COLUMNS: Record<ExportPreset, Column[]> = {
  generic: [
    { header: "Dato", value: date },
    { header: "Bilagsnr.", value: voucher },
    { header: "Tekst", value: text, isText: true },
    { header: "Konto", value: account },
    { header: "Momskode", value: vat },
    { header: "Beløb", value: amount },
    { header: "Modkonto", value: counter },
  ],
  economic: [
    { header: "Dato", value: date },
    { header: "Bilagsnr.", value: voucher },
    { header: "Konto", value: account },
    { header: "Tekst", value: text, isText: true },
    { header: "Beløb", value: amount },
    { header: "Modkonto", value: counter },
    { header: "Momskode", value: vat },
  ],
  dinero: [
    { header: "Bilagsdato", value: date },
    { header: "Bilagsnummer", value: voucher },
    { header: "Beskrivelse", value: text, isText: true },
    { header: "Beløb", value: amount },
    { header: "Konto", value: account },
    { header: "Momskode", value: vat },
    { header: "Modkonto", value: counter },
  ],
};

export const BOM = "﻿";
const EOL = "\r\n";

/** Quote a CSV field when needed and neutralize spreadsheet formula injection in text fields. */
export function csvField(value: string, isText = false): string {
  let v = value.replace(/\r?\n/g, " ");
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[;"]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildKassekladdeCsv(
  entries: ExportEntry[],
  preset: ExportPreset,
  counterAccount: string,
): string {
  const cols = PRESET_COLUMNS[preset];
  const lines = [cols.map((c) => c.header).join(";")];
  const sorted = [...entries].sort(
    (a, b) => +a.date - +b.date || a.voucherNumber - b.voucherNumber,
  );
  for (const e of sorted) {
    lines.push(cols.map((c) => csvField(c.value(e, counterAccount), c.isText)).join(";"));
  }
  return BOM + lines.join(EOL) + EOL;
}

export function exportFilename(
  clientName: string,
  preset: ExportPreset,
  from: Date | null,
  to: Date | null,
): string {
  const slug = clientName
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const period =
    from || to ? `_${from ? formatDate(from) : "start"}_${to ? formatDate(to) : "slut"}` : "";
  return `kassekladde_${slug}_${preset}${period}.csv`;
}
