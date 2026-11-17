import { describe, expect, it } from "vitest";
import { matchAll, type MatchDocument, type MatchTransaction } from "@/lib/matching";
import { makeDate, addDays } from "@/lib/dates";

/** Deterministic pseudo-random generator (mulberry32) so the benchmark data is stable. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUPPLIERS = [
  "GLS Denmark A/S",
  "PostNord Danmark A/S",
  "Google Ireland Limited",
  "Shopify International",
  "DAO A/S",
  "Emballagehuset Vest A/S",
  "Microsoft Ireland",
  "QuickPay ApS",
  "Bring Parcels A/S",
  "Kontorland",
];

describe("matching performance", () => {
  it("matches 500 transactions × 200 documents in under 2 seconds", () => {
    const r = rng(42);
    const start = makeDate(2026, 1, 1)!;
    const docs: MatchDocument[] = [];
    const txs: MatchTransaction[] = [];
    for (let i = 0; i < 200; i++) {
      const total = 1000 + Math.floor(r() * 500000);
      const date = addDays(start, Math.floor(r() * 300));
      const supplier = SUPPLIERS[i % SUPPLIERS.length]!;
      docs.push({
        id: `d${i}`,
        supplierName: supplier,
        supplierCvr: null,
        invoiceNumber: `INV${10000 + i}`,
        invoiceDate: date,
        dueDate: addDays(date, 14),
        totalAmountOre: total,
        currency: i % 25 === 0 ? "EUR" : "DKK",
        isCreditNote: false,
      });
      if (i < 170) {
        txs.push({
          id: `m${i}`,
          amountOre: -(i % 25 === 0 ? Math.round((total * 746) / 100) : total),
          bookingDate: addDays(date, Math.floor(r() * 20)),
          text: `${supplier.toUpperCase()} ${Math.floor(r() * 1e6)}`,
        });
      }
    }
    while (txs.length < 500) {
      txs.push({
        id: `n${txs.length}`,
        amountOre: (r() < 0.5 ? -1 : 1) * (1000 + Math.floor(r() * 500000)),
        bookingDate: addDays(start, Math.floor(r() * 300)),
        text: `Diverse ${txs.length}`,
      });
    }
    const t0 = performance.now();
    const result = matchAll(docs, txs);
    const ms = performance.now() - t0;
    console.info(`matchAll 500×200: ${ms.toFixed(1)} ms, ${result.length} matches`);
    expect(ms).toBeLessThan(2000);
    expect(result.length).toBeGreaterThanOrEqual(160);
  });
});
