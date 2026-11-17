/**
 * Text normalization and fuzzy similarity for supplier names vs. bank texts.
 * Pure functions, no dependencies.
 */

/** Legal forms and generic corporate words that carry no identity. */
const COMPANY_NOISE = new Set([
  "aps",
  "as",
  "a/s",
  "ivs",
  "is",
  "k/s",
  "ks",
  "p/s",
  "ltd",
  "limited",
  "inc",
  "incorporated",
  "llc",
  "plc",
  "gmbh",
  "ag",
  "bv",
  "nv",
  "ab",
  "oy",
  "sa",
  "sarl",
  "srl",
  "pty",
  "co",
  "corp",
  "corporation",
  "company",
  "unlimited",
  "international",
  "intl",
  "operations",
  "holding",
  "group",
  "europe",
  "nordic",
  "nordics",
  "ireland",
  "denmark",
  "danmark",
  "distribution",
  "systems",
  "software",
  "platforms",
  "payments",
  "services",
  "the",
  "og",
  "and",
  "of",
]);

/** Card terminal / bank noise in bank texts. */
const BANK_NOISE = new Set([
  "visa",
  "dankort",
  "visa/dankort",
  "mastercard",
  "maestro",
  "mobilepay",
  "mobile",
  "pay",
  "nets",
  "kortkøb",
  "dankortkøb",
  "dankort-køb",
  "købt",
  "køb",
  "pos",
  "betaling",
  "betalt",
  "overførsel",
  "overf",
  "fra",
  "til",
  "kort",
  "nr",
  "ref",
  "dkk",
  "eur",
  "usd",
  "sek",
  "nok",
  "gbp",
  "www",
  "com",
  "dk",
  "faktura",
  "fakt",
  "kurs",
]);

/** Known short-hands that banks print instead of the company name. */
const ALIASES: Record<string, string> = {
  facebk: "meta",
  facebook: "meta",
  fb: "meta",
  msft: "microsoft",
  amzn: "amazon",
  goog: "google",
  shopifycom: "shopify",
};

function baseTokens(input: string): string[] {
  return input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/a\/s|k\/s|p\/s|i\/s/g, " ")
    .replace(/\d{4,}/g, " ") // long numbers: card numbers, references
    .replace(/[^a-z0-9æøåäöüé]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 0)
    .map((t) => ALIASES[t] ?? t);
}

/** Normalize a supplier name into identity tokens. "Google Ireland Limited" → ["google"]. */
export function normalizeSupplier(name: string): string[] {
  const tokens = baseTokens(name).filter((t) => !COMPANY_NOISE.has(t) && t.length > 1);
  return tokens.length > 0 ? tokens : baseTokens(name).filter((t) => t.length > 1);
}

/** Normalize a bank text into tokens. "Visa/Dankort SHOPIFY* 123456" → ["shopify"]. */
export function normalizeBankText(text: string): string[] {
  return baseTokens(text).filter(
    (t) => !BANK_NOISE.has(t) && !COMPANY_NOISE.has(t) && !/^\d+$/.test(t),
  );
}

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1;
  if (a.length === 0 || b.length === 0) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array<boolean>(a.length).fill(false);
  const bMatch = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Similarity in [0, 1] between a supplier name and a bank text:
 * the length-weighted average of each supplier token's best Jaro-Winkler match among the bank tokens,
 * or 1 when the compacted supplier name appears inside the compacted bank text.
 */
export function supplierSimilarity(supplierName: string, bankText: string): number {
  const s = normalizeSupplier(supplierName);
  const b = normalizeBankText(bankText);
  if (s.length === 0 || b.length === 0) return 0;
  const sCompact = s.join("");
  const bCompact = b.join("");
  if (sCompact.length >= 4 && bCompact.includes(sCompact)) return 1;
  let weighted = 0;
  let total = 0;
  for (const token of s) {
    let best = 0;
    for (const bt of b) {
      // Prefix containment ("emballagehuset" vs "emballageh") counts as a strong match.
      const sim =
        token.length >= 4 && bt.length >= 4 && (bt.startsWith(token) || token.startsWith(bt))
          ? 0.97
          : jaroWinkler(token, bt);
      if (sim > best) best = sim;
    }
    weighted += best * token.length;
    total += token.length;
  }
  return total === 0 ? 0 : weighted / total;
}

/** Compact alphanumeric form used for invoice-number search. */
export function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True if the invoice number (≥4 significant chars) appears in the bank text. */
export function invoiceNumberInText(invoiceNumber: string | null, bankText: string): boolean {
  if (!invoiceNumber) return false;
  const inv = compact(invoiceNumber);
  if (inv.length < 4 || /^0+$/.test(inv)) return false;
  return compact(bankText).includes(inv);
}
