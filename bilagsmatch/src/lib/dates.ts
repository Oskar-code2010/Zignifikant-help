/**
 * Date-only helpers. A date-only value is a Date at 00:00 UTC. Always formatted in UTC.
 */

export type DateFormat = "dd-mm-yyyy" | "dd.mm.yyyy" | "dd/mm/yyyy" | "yyyy-mm-dd" | "dd-mm-yy";

export const DATE_FORMATS = [
  "dd-mm-yyyy",
  "dd.mm.yyyy",
  "dd/mm/yyyy",
  "yyyy-mm-dd",
  "dd-mm-yy",
] as const satisfies readonly DateFormat[];

const PATTERNS: Record<DateFormat, RegExp> = {
  "dd-mm-yyyy": /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  "dd.mm.yyyy": /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
  "dd/mm/yyyy": /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  "yyyy-mm-dd": /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  "dd-mm-yy": /^(\d{1,2})[-./](\d{1,2})[-./](\d{2})$/,
};

/** Build a UTC date-only value, or null if the date does not exist (e.g. 31-02). */
export function makeDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2200) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/** Parse a date in one specific format. Strips a trailing time part ("12-03-2025 00:00"). */
export function parseDateWithFormat(input: string, format: DateFormat): Date | null {
  const s = input.trim().split(/[ T]/)[0] ?? "";
  const m = PATTERNS[format].exec(s);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (format === "yyyy-mm-dd") return makeDate(a, b, c);
  if (format === "dd-mm-yy") return makeDate(2000 + c, b, a);
  return makeDate(c, b, a);
}

/** Parse a date in any supported format (Danish day-first convention). */
export function parseDanishDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  for (const f of DATE_FORMATS) {
    const d = parseDateWithFormat(input, f);
    if (d) return d;
  }
  return null;
}

/** Detect which format fits all given (non-empty) samples. */
export function detectDateFormat(samples: string[]): DateFormat | null {
  const values = samples.map((s) => s.trim()).filter((s) => s !== "");
  if (values.length === 0) return null;
  for (const f of DATE_FORMATS) {
    if (values.every((v) => parseDateWithFormat(v, f) !== null)) return f;
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Format as dd-mm-yyyy (UTC). */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** Format as yyyy-mm-dd (UTC), the value format of <input type="date">. */
export function toIsoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Parse yyyy-mm-dd from <input type="date"> (or empty → null). */
export function fromIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  return parseDateWithFormat(s, "yyyy-mm-dd");
}

const DAY_MS = 86_400_000;

/** Whole days from `a` to `b` (b - a), based on UTC calendar dates. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ub - ua) / DAY_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Today as a date-only value. */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
