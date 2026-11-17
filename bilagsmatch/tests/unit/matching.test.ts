import { describe, expect, it } from "vitest";
import {
  assignMatches,
  confidenceLabel,
  generateCandidates,
  HIGH_CONFIDENCE,
  matchAll,
  rankDocumentsForTransaction,
  scorePair,
  SUGGEST_THRESHOLD,
  type MatchDocument,
  type MatchTransaction,
} from "@/lib/matching";
import {
  invoiceNumberInText,
  jaroWinkler,
  normalizeBankText,
  normalizeSupplier,
  supplierSimilarity,
} from "@/lib/matching/text";
import { makeDate } from "@/lib/dates";

const d = (iso: string) => {
  const [y, m, day] = iso.split("-").map(Number);
  return makeDate(y!, m!, day!)!;
};

let seq = 0;
function doc(p: Partial<MatchDocument> & { total: number; date: string }): MatchDocument {
  seq++;
  const { total, date, ...rest } = p;
  return {
    id: rest.id ?? `doc${seq}`,
    supplierName: "GLS Denmark A/S",
    supplierCvr: null,
    invoiceNumber: null,
    dueDate: null,
    currency: "DKK",
    isCreditNote: false,
    ...rest,
    invoiceDate: d(date),
    totalAmountOre: total,
  };
}

function tx(p: { amount: number; date: string; text?: string; id?: string }): MatchTransaction {
  seq++;
  return { id: p.id ?? `tx${seq}`, amountOre: p.amount, bookingDate: d(p.date), text: p.text ?? "GLS DENMARK" };
}

describe("text normalization", () => {
  it("removes legal forms and noise from supplier names", () => {
    expect(normalizeSupplier("GLS Denmark A/S")).toEqual(["gls"]);
    expect(normalizeSupplier("Google Ireland Limited")).toEqual(["google"]);
    expect(normalizeSupplier("Kaffeposer.dk ApS")).toEqual(["kaffeposer", "dk"]);
    expect(normalizeSupplier("Emballagehuset Vest A/S")).toEqual(["emballagehuset", "vest"]);
  });

  it("removes card terminal noise, stars and long numbers from bank texts", () => {
    expect(normalizeBankText("Visa/Dankort SHOPIFY* 123456")).toEqual(["shopify"]);
    expect(normalizeBankText("MobilePay: Kaffe; kage")).toEqual(["kaffe", "kage"]);
    expect(normalizeBankText("DANKORT-KØB 4571 1234 NETTO")).toEqual(["netto"]);
    expect(normalizeBankText("FACEBK *ADS 82JK")).toEqual(["meta", "ads", "82jk"]);
  });

  it("jaroWinkler basics", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(jaroWinkler("abc", "abc")).toBe(1);
    expect(jaroWinkler("", "abc")).toBe(0);
    expect(jaroWinkler("google", "xyz")).toBe(0);
  });

  it("supplier similarity on messy bank texts", () => {
    expect(supplierSimilarity("Shopify International Limited", "Visa/Dankort SHOPIFY* 123456")).toBe(1);
    expect(supplierSimilarity("Google Ireland Limited", "GOOGLE *ADS1234567")).toBe(1);
    expect(supplierSimilarity("Meta Platforms Ireland Limited", "FACEBK *ADS 82JK")).toBe(1);
    expect(supplierSimilarity("Emballagehuset Vest A/S", "Betaling EMBALLAGEHUSET VEST")).toBe(1);
    expect(supplierSimilarity("PostNord Danmark A/S", "POST NORD PORTO 448812")).toBe(1);
    expect(supplierSimilarity("GLS Denmark A/S", "Netto Esbjerg")).toBeLessThan(0.6);
  });

  it("finds invoice numbers ignoring punctuation, but not trivially short ones", () => {
    expect(invoiceNumberInText("2026-118", "Faktura 2026118 Emballagehuset")).toBe(true);
    expect(invoiceNumberInText("12", "Faktura 12")).toBe(false);
    expect(invoiceNumberInText(null, "x")).toBe(false);
  });
});

describe("scorePair", () => {
  it("exact amount, same day and matching name → high confidence", () => {
    const c = scorePair(doc({ total: 187500, date: "2026-09-12" }), tx({ amount: -187500, date: "2026-09-12" }))!;
    expect(c.score).toBe(95);
    expect(confidenceLabel(c.score)).toBe("Høj sikkerhed");
    expect(c.reasons[0]).toBe("Beløb matcher præcist (1.875,00 kr.)");
    expect(c.reasons).toContain("Samme dato som fakturadatoen");
    expect(c.reasons.some((r) => r.startsWith("Leverandørnavn ligner banktekst (100%)"))).toBe(true);
  });

  it("explains the date offset in Danish", () => {
    const c = scorePair(doc({ total: 124900, date: "2026-09-01" }), tx({ amount: -124900, date: "2026-09-03" }))!;
    expect(c.reasons).toContain("Dato 2 dage efter fakturadato");
  });

  it("allows ±1 kr rounding difference with slightly fewer points", () => {
    const exact = scorePair(doc({ total: 10000, date: "2026-09-01" }), tx({ amount: -10000, date: "2026-09-01" }))!;
    const round = scorePair(doc({ total: 10000, date: "2026-09-01" }), tx({ amount: -10060, date: "2026-09-01" }))!;
    expect(round.score).toBeLessThan(exact.score);
    expect(round.reasons[0]).toBe("Beløb matcher inden for afrunding (afvigelse 0,60 kr.)");
    expect(scorePair(doc({ total: 10000, date: "2026-09-01" }), tx({ amount: -10101, date: "2026-09-01" }))).toBeNull();
  });

  it("rejects amount mismatches", () => {
    expect(scorePair(doc({ total: 50000, date: "2026-09-01" }), tx({ amount: -51000, date: "2026-09-01" }))).toBeNull();
  });

  it("requires the right direction: expense ↔ money out", () => {
    expect(scorePair(doc({ total: 50000, date: "2026-09-01" }), tx({ amount: 50000, date: "2026-09-01" }))).toBeNull();
  });

  it("matches credit notes to incoming money", () => {
    const credit = doc({ total: -50000, date: "2026-10-02", isCreditNote: true, supplierName: "Emballagehuset Vest A/S" });
    expect(scorePair(credit, tx({ amount: -50000, date: "2026-10-03", text: "Emballagehuset" }))).toBeNull();
    const c = scorePair(credit, tx({ amount: 50000, date: "2026-10-05", text: "Emballagehuset Vest kreditnota" }))!;
    expect(c.score).toBeGreaterThanOrEqual(HIGH_CONFIDENCE);
    expect(c.reasons).toContain("Kreditnota modsvarer en indbetaling");
  });

  it("treats a positive-amount credit note flagged isCreditNote as incoming", () => {
    const credit = doc({ total: 50000, date: "2026-10-02", isCreditNote: true });
    expect(scorePair(credit, tx({ amount: 50000, date: "2026-10-02" }))).not.toBeNull();
  });

  it("date window: −3 to +45 days of the invoice date", () => {
    const base = { total: 10000, date: "2026-09-10" };
    expect(scorePair(doc(base), tx({ amount: -10000, date: "2026-09-07" }))).not.toBeNull();
    expect(scorePair(doc(base), tx({ amount: -10000, date: "2026-09-06" }))).toBeNull();
    expect(scorePair(doc(base), tx({ amount: -10000, date: "2026-10-25" }))).not.toBeNull();
    expect(scorePair(doc(base), tx({ amount: -10000, date: "2026-10-26" }))).toBeNull();
  });

  it("closer dates score higher", () => {
    const scores = ["2026-09-10", "2026-09-15", "2026-09-22", "2026-10-05", "2026-10-20"].map(
      (date) => scorePair(doc({ total: 10000, date: "2026-09-10" }), tx({ amount: -10000, date }))!.breakdown.date,
    );
    expect(scores).toEqual([25, 20, 15, 10, 5]);
  });

  it("uses the due date when present (payment 30 days after invoice, on the due date)", () => {
    const c = scorePair(
      doc({ total: 10000, date: "2026-09-01", dueDate: d("2026-10-01") }),
      tx({ amount: -10000, date: "2026-10-01" }),
    )!;
    expect(c.breakdown.date).toBe(25);
    expect(c.reasons).toContain("Betalt på forfaldsdatoen");
  });

  it("accepts a payment 30 days after the due date via the due-date window", () => {
    const late = doc({ total: 343750, date: "2026-08-01", dueDate: d("2026-09-01"), supplierName: "Emballagehuset Vest A/S" });
    const c = scorePair(late, tx({ amount: -343750, date: "2026-10-01", text: "EMBALLAGEHUSET VEST" }))!;
    expect(c).not.toBeNull();
    expect(c.reasons).toContain("Dato 30 dage efter forfaldsdato");
    expect(c.score).toBeGreaterThanOrEqual(SUGGEST_THRESHOLD);
  });

  it("gives a strong bonus for the invoice number in the bank text", () => {
    const withInv = doc({ total: 343750, date: "2026-09-03", invoiceNumber: "2026-118", supplierName: "Ukendt Firma" });
    const c = scorePair(withInv, tx({ amount: -343750, date: "2026-09-20", text: "Faktura 2026-118" }))!;
    expect(c.breakdown.invoiceNumber).toBe(15);
    expect(c.reasons).toContain("Fakturanummer 2026-118 fundet i bankteksten");
  });

  it("recognises the supplier CVR in the bank text", () => {
    const c = scorePair(
      doc({ total: 10000, date: "2026-09-01", supplierName: null, supplierCvr: "16291824" }),
      tx({ amount: -10000, date: "2026-09-01", text: "Overførsel CVR 16291824" }),
    )!;
    expect(c.breakdown.text).toBe(15);
  });

  it("foreign currency: converted amount within ±5 % is accepted and explained", () => {
    const usd = doc({ total: 7900, date: "2026-09-01", currency: "USD", supplierName: "Shopify International Limited" });
    const c = scorePair(usd, tx({ amount: -53821, date: "2026-09-02", text: "Visa SHOPIFY* 123456" }))!;
    expect(c).not.toBeNull();
    expect(c.breakdown.amount).toBe(40);
    expect(c.reasons[0]).toMatch(/^Fremmed valuta: 79,00 USD ≈ 545,10 kr\. – banken trak 538,21 kr\./);
    expect(c.reasons[0]).toMatch(/op til 5 % tilladt/);
  });

  it("foreign currency: more than 5 % off is rejected", () => {
    const usd = doc({ total: 7900, date: "2026-09-01", currency: "USD" });
    expect(scorePair(usd, tx({ amount: -60000, date: "2026-09-01" }))).toBeNull();
  });

  it("foreign currency: exact original amount in bank text gives full amount points", () => {
    const eur = doc({ total: 102300, date: "2026-09-04", currency: "EUR", supplierName: "Rösterei Hamburg GmbH" });
    const c = scorePair(eur, tx({ amount: -765000, date: "2026-09-18", text: "ROESTEREI HAMBURG EUR 1023,00 KURS 7,478" }))!;
    expect(c.breakdown.amount).toBe(55);
  });

  it("unknown foreign currency without text evidence cannot be matched", () => {
    expect(scorePair(doc({ total: 1000, date: "2026-09-01", currency: "JPY" }), tx({ amount: -60, date: "2026-09-01" }))).toBeNull();
  });

  it("documents without amount or date never match", () => {
    expect(scorePair({ ...doc({ total: 1, date: "2026-09-01" }), totalAmountOre: null }, tx({ amount: -1, date: "2026-09-01" }))).toBeNull();
    expect(scorePair({ ...doc({ total: 100, date: "2026-09-01" }), invoiceDate: null }, tx({ amount: -100, date: "2026-09-01" }))).toBeNull();
  });

  it("caps the score at 100", () => {
    const c = scorePair(
      doc({ total: 10000, date: "2026-09-01", invoiceNumber: "90881234" }),
      tx({ amount: -10000, date: "2026-09-01", text: "GLS 90881234" }),
    )!;
    expect(c.score).toBe(100);
  });

  it("amount + date alone (unknown text) lands in 'Tjek venligst'", () => {
    const c = scorePair(
      doc({ total: 45900, date: "2026-09-24", supplierName: "Kontorland Esbjerg" }),
      tx({ amount: -45900, date: "2026-09-24", text: "Dankort-køb 4571" }),
    )!;
    expect(confidenceLabel(c.score)).toBe("Tjek venligst");
  });
});

describe("assignment", () => {
  it("two receipts with the same amount: dates decide", () => {
    const a = doc({ id: "a", total: 8995, date: "2026-09-08", supplierName: "PostNord Danmark A/S" });
    const b = doc({ id: "b", total: 8995, date: "2026-09-22", supplierName: "PostNord Danmark A/S" });
    const t1 = tx({ id: "t1", amount: -8995, date: "2026-09-08", text: "POSTNORD PORTO" });
    const t2 = tx({ id: "t2", amount: -8995, date: "2026-09-22", text: "POSTNORD PORTO" });
    const m = matchAll([b, a], [t2, t1]);
    expect(m.map((x) => [x.documentId, x.transactionId]).sort()).toEqual([
      ["a", "t1"],
      ["b", "t2"],
    ]);
  });

  it("two receipts with the same amount and date: text decides", () => {
    const canva = doc({ id: "canva", total: 9900, date: "2026-09-14", supplierName: "Canva Pty Ltd" });
    const dbx = doc({ id: "dropbox", total: 9900, date: "2026-09-14", supplierName: "Dropbox International Unlimited Company" });
    const t1 = tx({ id: "t-dbx", amount: -9900, date: "2026-09-14", text: "DROPBOX*SUBSCR" });
    const t2 = tx({ id: "t-canva", amount: -9900, date: "2026-09-14", text: "CANVA* 04381" });
    const m = matchAll([canva, dbx], [t1, t2]);
    expect(Object.fromEntries(m.map((x) => [x.documentId, x.transactionId]))).toEqual({
      canva: "t-canva",
      dropbox: "t-dbx",
    });
  });

  it("one-to-one: a document is never assigned to two transactions", () => {
    const one = doc({ id: "one", total: 10000, date: "2026-09-01" });
    const m = matchAll([one], [tx({ amount: -10000, date: "2026-09-01" }), tx({ amount: -10000, date: "2026-09-02" })]);
    expect(m).toHaveLength(1);
    expect(m[0]!.transactionId).toBeDefined();
  });

  it("duplicate documents compete for one transaction: only the best gets it", () => {
    const original = doc({ id: "orig", total: 187500, date: "2026-09-12", invoiceNumber: "90881234" });
    const copy = doc({ id: "copy", total: 187500, date: "2026-09-12", invoiceNumber: "90881234" });
    const m = matchAll([copy, original], [tx({ amount: -187500, date: "2026-09-14", text: "GLS 90881234" })]);
    expect(m).toHaveLength(1);
  });

  it("many documents, few transactions: unmatched documents stay unmatched", () => {
    const docs = [10000, 20000, 30000, 40000].map((total, i) => doc({ id: `d${i}`, total, date: "2026-09-01" }));
    const txs = [tx({ id: "x", amount: -20000, date: "2026-09-02" }), tx({ id: "y", amount: -40000, date: "2026-09-03" })];
    const m = matchAll(docs, txs);
    expect(m.map((c) => c.documentId).sort()).toEqual(["d1", "d3"]);
  });

  it("many transactions, few documents", () => {
    const docs = [doc({ id: "only", total: 5000, date: "2026-09-10" })];
    const txs = Array.from({ length: 30 }, (_, i) => tx({ amount: -(5000 + i * 100), date: "2026-09-10", text: `Ting ${i}` }));
    const m = matchAll(docs, [...txs, tx({ id: "right", amount: -5000, date: "2026-09-10" })]);
    expect(m).toHaveLength(1);
    expect(m[0]!.transactionId).toBe("right");
  });

  it("no possible match returns nothing", () => {
    expect(matchAll([doc({ total: 99999, date: "2026-01-01" })], [tx({ amount: -1, date: "2026-09-01" })])).toEqual([]);
    expect(matchAll([], [])).toEqual([]);
  });

  it("scores below the threshold are not suggested", () => {
    const weak = doc({ id: "weak", total: 10000, date: "2026-09-01", supplierName: "Noget Helt Andet" });
    const t = tx({ amount: -10060, date: "2026-10-10", text: "Q8 tankstation" });
    const cands = generateCandidates([weak], [t]);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.score).toBeLessThan(SUGGEST_THRESHOLD);
    expect(assignMatches(cands)).toEqual([]);
  });

  it("greedy assignment prefers the higher score when two documents want the same transaction", () => {
    const good = doc({ id: "good", total: 10000, date: "2026-09-01" });
    const worse = doc({ id: "worse", total: 10000, date: "2026-08-20", supplierName: "Noget Andet" });
    const m = matchAll([worse, good], [tx({ id: "t", amount: -10000, date: "2026-09-01" })]);
    expect(m.map((c) => c.documentId)).toEqual(["good"]);
  });

  it("is deterministic regardless of input order", () => {
    const docs = [10000, 10000, 20000].map((total, i) => doc({ id: `p${i}`, total, date: "2026-09-01" }));
    const txs = [tx({ id: "q1", amount: -10000, date: "2026-09-01" }), tx({ id: "q2", amount: -10000, date: "2026-09-01" }), tx({ id: "q3", amount: -20000, date: "2026-09-05" })];
    const a = matchAll(docs, txs);
    const b = matchAll([...docs].reverse(), [...txs].reverse());
    expect(a).toEqual(b);
  });

  it("internal transfers without documents are never suggested", () => {
    const docs = [doc({ total: 2000000, date: "2026-09-01", supplierName: "Leverandør" })];
    const m = matchAll(docs, [tx({ amount: 2000000, date: "2026-09-01", text: "Overførsel fra opsparing" })]);
    expect(m).toEqual([]);
  });

  it("messy bank text with card noise still matches the right supplier", () => {
    const shop = doc({ id: "shop", total: 29900, date: "2026-01-06", supplierName: "Shopify International Limited" });
    const other = doc({ id: "other", total: 29900, date: "2026-01-06", supplierName: "Føtex" });
    const t = tx({ id: "t", amount: -29900, date: "2026-01-06", text: "Visa/Dankort SHOPIFY* 123456" });
    const m = matchAll([other, shop], [t]);
    expect(m[0]!.documentId).toBe("shop");
  });

  it("rankDocumentsForTransaction orders manual search results", () => {
    const t = tx({ amount: -10000, date: "2026-09-05" });
    const r = rankDocumentsForTransaction(t, [
      doc({ id: "far", total: 10000, date: "2026-08-25" }),
      doc({ id: "near", total: 10000, date: "2026-09-05" }),
      doc({ id: "wrong", total: 999, date: "2026-09-05" }),
    ]);
    expect(r.map((c) => c.documentId)).toEqual(["near", "far"]);
  });
});
