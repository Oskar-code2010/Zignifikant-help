/**
 * Matching engine: scores (document, bank transaction) pairs 0–100 and assigns them globally.
 * Pure and deterministic – no DB access, no clock, no randomness.
 */
import { daysBetween } from "@/lib/dates";
import { formatDKK } from "@/lib/money";
import { compact, invoiceNumberInText, supplierSimilarity } from "./text";

export interface MatchDocument {
  id: string;
  supplierName: string | null;
  supplierCvr: string | null;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  totalAmountOre: number | null;
  currency: string | null;
  isCreditNote: boolean;
}

export interface MatchTransaction {
  id: string;
  bookingDate: Date;
  text: string;
  amountOre: number;
}

export interface ScoreBreakdown {
  amount: number;
  date: number;
  text: number;
  invoiceNumber: number;
}

export interface Candidate {
  documentId: string;
  transactionId: string;
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
  /** Smallest day distance to invoice/due date (used for tie-breaking). */
  dayDistance: number;
}

export const HIGH_CONFIDENCE = 85;
export const SUGGEST_THRESHOLD = 60;

export const POINTS = {
  amountExact: 55,
  amountRounding: 50,
  amountForeign: 40,
  amountForeignExact: 55,
  dateMax: 25,
  textMax: 15,
  invoiceNumber: 15,
} as const;

/** DKK per 100 units of foreign currency, approximate reference rates (DKK is pegged to EUR). */
export const APPROX_DKK_RATES: Record<string, number> = {
  EUR: 746,
  USD: 690,
  GBP: 870,
  SEK: 66,
  NOK: 65,
  CHF: 790,
  AUD: 450,
  CAD: 500,
};

const ROUNDING_TOLERANCE_ORE = 100; // ±1 kr
const FOREIGN_TOLERANCE_PCT = 5;

export function confidenceLabel(score: number): "Høj sikkerhed" | "Tjek venligst" | null {
  if (score >= HIGH_CONFIDENCE) return "Høj sikkerhed";
  if (score >= SUGGEST_THRESHOLD) return "Tjek venligst";
  return null;
}

function isDkk(currency: string | null): boolean {
  return currency === null || currency === "" || currency === "DKK";
}

/** Expected sign of the bank amount: expenses go out (negative), credit notes come in (positive). */
function expectsIncoming(doc: MatchDocument): boolean {
  return doc.isCreditNote || (doc.totalAmountOre ?? 0) < 0;
}

function formatForeign(amountMinor: number, currency: string): string {
  return `${formatDKK(amountMinor).replace(" kr.", "")} ${currency}`;
}

/** Find "79,00" / "79.00" style amounts of the original currency in the bank text. */
function foreignAmountInText(amountMinor: number, currency: string, text: string): boolean {
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, "0");
  const variants = [`${whole},${cents}`, `${whole}.${cents}`];
  const t = text.toUpperCase();
  return t.includes(currency) && variants.some((v) => t.includes(v));
}

function scoreAmount(
  doc: MatchDocument,
  tx: MatchTransaction,
): { points: number; reason: string } | null {
  const total = Math.abs(doc.totalAmountOre ?? 0);
  const bank = Math.abs(tx.amountOre);
  if (isDkk(doc.currency)) {
    const diff = Math.abs(bank - total);
    if (diff === 0)
      return { points: POINTS.amountExact, reason: `Beløb matcher præcist (${formatDKK(bank)})` };
    if (diff <= ROUNDING_TOLERANCE_ORE) {
      return {
        points: POINTS.amountRounding,
        reason: `Beløb matcher inden for afrunding (afvigelse ${formatDKK(diff)})`,
      };
    }
    return null;
  }
  const currency = (doc.currency ?? "").toUpperCase();
  if (foreignAmountInText(total, currency, tx.text)) {
    return {
      points: POINTS.amountForeignExact,
      reason: `Bankteksten nævner det præcise valutabeløb (${formatForeign(total, currency)})`,
    };
  }
  const rate = APPROX_DKK_RATES[currency];
  if (!rate) return null;
  const expected = Math.round((total * rate) / 100);
  const diff = Math.abs(bank - expected);
  if (diff * 100 > expected * FOREIGN_TOLERANCE_PCT) return null;
  const pct = Math.round((diff * 1000) / Math.max(1, expected)) / 10;
  return {
    points: POINTS.amountForeign,
    reason: `Fremmed valuta: ${formatForeign(total, currency)} ≈ ${formatDKK(expected)} – banken trak ${formatDKK(bank)} (afvigelse ${String(pct).replace(".", ",")} %, op til ${FOREIGN_TOLERANCE_PCT} % tilladt)`,
  };
}

function datePoints(days: number): number {
  if (days >= 0 && days <= 3) return POINTS.dateMax;
  if (days < 0) return 18; // booked 1–3 days before the document date
  if (days <= 7) return 20;
  if (days <= 14) return 15;
  if (days <= 30) return 10;
  return 5;
}

function dayWord(n: number): string {
  return n === 1 ? "dag" : "dage";
}

function scoreDate(
  doc: MatchDocument,
  tx: MatchTransaction,
): { points: number; reason: string; distance: number } | null {
  if (!doc.invoiceDate) return null;
  const dInv = daysBetween(doc.invoiceDate, tx.bookingDate);
  const dDue = doc.dueDate ? daysBetween(doc.dueDate, tx.bookingDate) : null;
  const inWindow = (d: number | null) => d !== null && d >= -3 && d <= 45;
  if (!inWindow(dInv) && !inWindow(dDue)) return null;

  const invPoints = inWindow(dInv) ? datePoints(dInv) : 0;
  const duePoints = dDue !== null && inWindow(dDue) ? datePoints(dDue) : 0;
  const distance = Math.min(Math.abs(dInv), dDue === null ? Infinity : Math.abs(dDue));
  if (duePoints > invPoints && dDue !== null) {
    const reason =
      dDue === 0
        ? "Betalt på forfaldsdatoen"
        : dDue > 0
          ? `Dato ${dDue} ${dayWord(dDue)} efter forfaldsdato`
          : `Dato ${-dDue} ${dayWord(-dDue)} før forfaldsdato`;
    return { points: duePoints, reason, distance };
  }
  const reason =
    dInv === 0
      ? "Samme dato som fakturadatoen"
      : dInv > 0
        ? `Dato ${dInv} ${dayWord(dInv)} efter fakturadato`
        : `Dato ${-dInv} ${dayWord(-dInv)} før fakturadato`;
  return { points: invPoints, reason, distance };
}

function scoreText(
  doc: MatchDocument,
  tx: MatchTransaction,
): { points: number; reason: string | null } {
  if (doc.supplierCvr && compact(tx.text).includes(compact(doc.supplierCvr))) {
    return {
      points: POINTS.textMax,
      reason: `Leverandørens CVR-nummer ${doc.supplierCvr} står i bankteksten`,
    };
  }
  if (!doc.supplierName) return { points: 0, reason: null };
  const sim = supplierSimilarity(doc.supplierName, tx.text);
  const pct = Math.round(sim * 100);
  if (sim >= 0.85)
    return { points: POINTS.textMax, reason: `Leverandørnavn ligner banktekst (${pct}%)` };
  if (sim >= 0.7)
    return { points: 10, reason: `Leverandørnavn ligner delvist banktekst (${pct}%)` };
  if (sim >= 0.55)
    return { points: 5, reason: `Svag lighed mellem leverandørnavn og banktekst (${pct}%)` };
  return { points: 0, reason: `Leverandørnavn ses ikke i bankteksten (${pct}%)` };
}

/** Score one pair. Returns null when the pair is impossible (direction, amount or date out of range). */
export function scorePair(doc: MatchDocument, tx: MatchTransaction): Candidate | null {
  if (doc.totalAmountOre === null || doc.totalAmountOre === 0 || tx.amountOre === 0) return null;
  const incoming = tx.amountOre > 0;
  if (incoming !== expectsIncoming(doc)) return null;

  const amount = scoreAmount(doc, tx);
  if (!amount) return null;
  const date = scoreDate(doc, tx);
  if (!date) return null;
  const text = scoreText(doc, tx);
  const inv = invoiceNumberInText(doc.invoiceNumber, tx.text);

  const reasons = [amount.reason, date.reason];
  if (text.reason) reasons.push(text.reason);
  if (inv) reasons.push(`Fakturanummer ${doc.invoiceNumber} fundet i bankteksten`);
  if (expectsIncoming(doc)) reasons.push("Kreditnota modsvarer en indbetaling");

  const breakdown: ScoreBreakdown = {
    amount: amount.points,
    date: date.points,
    text: text.points,
    invoiceNumber: inv ? POINTS.invoiceNumber : 0,
  };
  const raw = breakdown.amount + breakdown.date + breakdown.text + breakdown.invoiceNumber;
  return {
    documentId: doc.id,
    transactionId: tx.id,
    score: Math.min(100, raw),
    reasons,
    breakdown,
    dayDistance: date.distance,
  };
}

/**
 * All viable candidate pairs. DKK documents only look at transactions whose absolute amount is within
 * the rounding tolerance (binary search on a sorted index), so 500 × 200 runs in milliseconds.
 */
export function generateCandidates(docs: MatchDocument[], txs: MatchTransaction[]): Candidate[] {
  const sorted = [...txs].sort((a, b) => Math.abs(a.amountOre) - Math.abs(b.amountOre));
  const absAmounts = sorted.map((t) => Math.abs(t.amountOre));
  const lowerBound = (v: number) => {
    let lo = 0;
    let hi = absAmounts.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (absAmounts[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const out: Candidate[] = [];
  for (const doc of docs) {
    if (doc.totalAmountOre === null) continue;
    let pool: MatchTransaction[];
    if (isDkk(doc.currency)) {
      const total = Math.abs(doc.totalAmountOre);
      pool = [];
      for (
        let i = lowerBound(total - ROUNDING_TOLERANCE_ORE);
        i < sorted.length && absAmounts[i]! <= total + ROUNDING_TOLERANCE_ORE;
        i++
      ) {
        pool.push(sorted[i]!);
      }
    } else {
      pool = txs;
    }
    for (const tx of pool) {
      const c = scorePair(doc, tx);
      if (c) out.push(c);
    }
  }
  return out;
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    b.score - a.score ||
    b.breakdown.amount - a.breakdown.amount ||
    a.dayDistance - b.dayDistance ||
    (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0) ||
    (a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0)
  );
}

/**
 * Global one-to-one assignment, greedy best-score-first: repeatedly take the best remaining pair whose
 * document and transaction are both still free. Pairs below `threshold` are never suggested.
 */
export function assignMatches(candidates: Candidate[], threshold = SUGGEST_THRESHOLD): Candidate[] {
  const usedDocs = new Set<string>();
  const usedTx = new Set<string>();
  const result: Candidate[] = [];
  for (const c of [...candidates].filter((x) => x.score >= threshold).sort(compareCandidates)) {
    if (usedDocs.has(c.documentId) || usedTx.has(c.transactionId)) continue;
    usedDocs.add(c.documentId);
    usedTx.add(c.transactionId);
    result.push(c);
  }
  return result;
}

/** Convenience: candidates + assignment. */
export function matchAll(
  docs: MatchDocument[],
  txs: MatchTransaction[],
  threshold = SUGGEST_THRESHOLD,
): Candidate[] {
  return assignMatches(generateCandidates(docs, txs), threshold);
}

/** Ranked candidates for one transaction (manual matching search). */
export function rankDocumentsForTransaction(
  tx: MatchTransaction,
  docs: MatchDocument[],
): Candidate[] {
  return docs
    .map((d) => scorePair(d, tx))
    .filter((c): c is Candidate => c !== null)
    .sort(compareCandidates);
}
