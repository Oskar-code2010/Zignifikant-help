/**
 * Money helpers. All money is integer øre (1 kr = 100 øre). No floats anywhere.
 */

export type DecimalSeparator = "," | ".";

/** Largest absolute amount we store (Prisma Int is 32-bit). */
export const MAX_AMOUNT_ORE = 2_147_483_647;

export class AmountParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Ugyldigt beløb "${input}": ${reason}`);
    this.name = "AmountParseError";
  }
}

const CURRENCY_TOKENS = /\b(?:dkk|kr\.?|kroner|eur|usd|sek|nok|gbp)(?=\s|$|[^a-z])/gi;

/**
 * Decide which character is the decimal separator in a cleaned numeric string
 * that contains only digits, "." and ",".
 */
function resolveDecimalSeparator(
  body: string,
  preferred: DecimalSeparator | "auto",
): DecimalSeparator | null {
  const lastComma = body.lastIndexOf(",");
  const lastDot = body.lastIndexOf(".");
  if (lastComma === -1 && lastDot === -1) return null;
  if (preferred !== "auto") {
    const other = preferred === "," ? "." : ",";
    // Explicit format: the preferred char is decimal; the other may only be a thousands separator.
    if (body.includes(preferred)) return preferred;
    // Only the thousands separator present, e.g. "1.234" with decimal comma.
    if (body.includes(other)) return null;
    return null;
  }
  if (lastComma !== -1 && lastDot !== -1) return lastComma > lastDot ? "," : ".";
  const sep: DecimalSeparator = lastComma !== -1 ? "," : ".";
  const count = body.split(sep).length - 1;
  if (count > 1) return null; // "1.234.567" => thousands separators
  const digitsAfter = body.length - body.lastIndexOf(sep) - 1;
  if (sep === ",") return ","; // Danish bias: a single comma is decimal
  // Single dot: "12.5" / "12.50" decimal; "1.234" is Danish thousands.
  return digitsAfter === 3 ? null : ".";
}

/**
 * Parse a Danish (or plain) amount string into integer øre.
 *
 * Handles: "1.234,56", "1234,56", "1 234,56", "-1.234,56", "1.234,56-", "(1.234,56)",
 * "kr. 1.234,56", "1.234,56 kr.", "DKK 1234.56", "−12,50" (unicode minus), "+12", "1.234".
 *
 * @param decimal "," (Danish, default), "." or "auto" to guess per value.
 * @throws AmountParseError when the value is not a valid amount.
 */
export function parseDanishAmount(input: string, decimal: DecimalSeparator | "auto" = ","): number {
  const original = input;
  let s = input.normalize("NFKC").trim();
  if (s === "") throw new AmountParseError(original, "tomt felt");

  s = s.replace(CURRENCY_TOKENS, " ");
  s = s.replace(/[−–—]/g, "-"); // unicode minus / dashes
  s = s.replace(/[\s  ']/g, ""); // spaces, nbsp, thin space, swiss apostrophe

  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s === "") throw new AmountParseError(original, "intet tal");
  if (!/^[\d.,]+$/.test(s)) throw new AmountParseError(original, "indeholder ugyldige tegn");
  if (!/\d/.test(s)) throw new AmountParseError(original, "intet tal");

  const sep = resolveDecimalSeparator(s, decimal);
  let intPart: string;
  let fracPart = "";
  if (sep === null) {
    if (/[.,]/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s) && !/^\d{1,3}(,\d{3})+$/.test(s)) {
      throw new AmountParseError(original, "forkert tusindtalsseparator");
    }
    intPart = s.replace(/[.,]/g, "");
  } else {
    const idx = s.lastIndexOf(sep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
    if (fracPart.includes(".") || fracPart.includes(",") || fracPart === "") {
      throw new AmountParseError(original, "forkert decimalformat");
    }
    const thousands = sep === "," ? "." : ",";
    if (intPart.includes(sep)) throw new AmountParseError(original, "flere decimaltegn");
    if (intPart.includes(thousands)) {
      // Validate thousands grouping: 1.234.567
      if (!/^\d{1,3}([.,]\d{3})+$/.test(intPart)) {
        throw new AmountParseError(original, "forkert tusindtalsseparator");
      }
      intPart = intPart.split(thousands).join("");
    }
  }
  if (intPart === "") intPart = "0";
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    throw new AmountParseError(original, "forkert format");
  }

  // Round half away from zero on the third decimal (sign is applied afterwards).
  const padded = (fracPart + "000").slice(0, 3);
  let ore = Number(intPart) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) ore += 1;
  if (!Number.isSafeInteger(ore) || ore > MAX_AMOUNT_ORE) {
    throw new AmountParseError(original, "beløbet er for stort");
  }
  return negative && ore !== 0 ? -ore : ore;
}

/** Like parseDanishAmount but returns null instead of throwing. */
export function tryParseDanishAmount(
  input: string | null | undefined,
  decimal: DecimalSeparator | "auto" = ",",
): number | null {
  if (input === null || input === undefined) return null;
  try {
    return parseDanishAmount(input, decimal);
  } catch {
    return null;
  }
}

function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Format øre as a Danish number without currency, e.g. 123456 → "1.234,56". */
export function formatDanishNumber(ore: number): string {
  assertInteger(ore);
  const negative = ore < 0;
  const abs = Math.abs(ore);
  const kr = Math.floor(abs / 100);
  const rest = abs % 100;
  const text = `${groupThousands(String(kr))},${String(rest).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** Format øre for display, e.g. 123456 → "1.234,56 kr.", -5000 → "-50,00 kr.". */
export function formatDKK(ore: number): string {
  return `${formatDanishNumber(ore)} kr.`;
}

/** Format øre for CSV export: decimal comma, no thousands separator, e.g. -123456 → "-1234,56". */
export function formatExportAmount(ore: number): string {
  assertInteger(ore);
  const negative = ore < 0;
  const abs = Math.abs(ore);
  const text = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** Format a value for an editable input field (no thousands separators): 123456 → "1234,56". */
export function formatAmountInput(ore: number | null | undefined): string {
  if (ore === null || ore === undefined) return "";
  return formatExportAmount(ore);
}

function assertInteger(ore: number): void {
  if (!Number.isInteger(ore)) {
    throw new TypeError(`Money must be integer øre, got ${ore}`);
  }
}

/** Integer percentage of `part` over `whole` in basis points (1/100 %), avoids float money math. */
export function ratioBasisPoints(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part * 10_000) / whole);
}
