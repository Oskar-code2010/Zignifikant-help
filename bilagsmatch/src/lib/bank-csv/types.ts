import type { DateFormat } from "@/lib/dates";

export type Delimiter = ";" | "," | "\t";

export interface ColumnMapping {
  bookingDate: number | null;
  valueDate: number | null;
  text: number | null;
  /** Single signed amount column. Either this or debit/credit. */
  amount: number | null;
  /** "Ud" column: money out (positive numbers become negative amounts). */
  debit: number | null;
  /** "Ind" column: money in. */
  credit: number | null;
  balance: number | null;
  currency: number | null;
}

export const MAPPING_FIELDS: readonly (keyof ColumnMapping)[] = [
  "bookingDate",
  "valueDate",
  "text",
  "amount",
  "debit",
  "credit",
  "balance",
  "currency",
];

export const MAPPING_LABELS: Record<keyof ColumnMapping, string> = {
  bookingDate: "Bogføringsdato",
  valueDate: "Rentedato / valør",
  text: "Tekst",
  amount: "Beløb (+/-)",
  debit: "Ud (hævet)",
  credit: "Ind (indsat)",
  balance: "Saldo",
  currency: "Valuta",
};

export interface ParseOptions {
  delimiter: Delimiter;
  decimal: "," | ".";
  dateFormat: DateFormat;
  /** Index of the header row in the raw rows, or -1 when the file has no header. */
  headerRowIndex: number;
  mapping: ColumnMapping;
}

export interface ParsedRow {
  /** 1-based line number in the file (for error messages). */
  line: number;
  bookingDate: Date;
  valueDate: Date | null;
  text: string;
  amountOre: number;
  balanceOre: number | null;
  currency: string;
}

export interface FailedRow {
  line: number;
  reason: string;
  raw: string[];
}

export interface ParseResult {
  rows: ParsedRow[];
  failed: FailedRow[];
  /** Junk lines (empty, summary lines) silently skipped. */
  skipped: number;
}

export interface DetectionResult {
  encoding: string;
  delimiter: Delimiter;
  decimal: "," | ".";
  dateFormat: DateFormat;
  headerRowIndex: number;
  headers: string[];
  mapping: ColumnMapping;
  formatName: string;
  columnCount: number;
}
