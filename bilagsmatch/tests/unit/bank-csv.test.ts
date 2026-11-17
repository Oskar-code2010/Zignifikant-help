import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeCsv, decodeCsvBytes, dedupeHashes, detectFormat, parseRows, tokenize } from "@/lib/bank-csv";
import { detectDecimal, detectDelimiter, mappingFromHeaders } from "@/lib/bank-csv/detect";
import { toIsoDate } from "@/lib/dates";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "..", "fixtures", "bank", name));

function summarize(name: string) {
  const { detection, result } = analyzeCsv(fixture(name));
  return {
    detection,
    result,
    rows: result.rows.map((r) => [toIsoDate(r.bookingDate), r.text, r.amountOre, r.balanceOre]),
  };
}

describe("fixtures", () => {
  it("Danske Bank style: Windows-1252, quoted, dd.mm.yyyy, summary line", () => {
    const { detection, result, rows } = summarize("danske-bank.csv");
    expect(detection.encoding).toBe("windows-1252");
    expect(detection.delimiter).toBe(";");
    expect(detection.decimal).toBe(",");
    expect(detection.dateFormat).toBe("dd.mm.yyyy");
    expect(detection.formatName).toContain("Danske Bank");
    expect(rows).toEqual([
      ["2025-01-02", "Dankort-køb Føtex Århus", -24550, 1275450],
      ["2025-01-03", "Overførsel fra Ærø Æblemost ApS", 125000, 1400450],
      ["2025-01-06", "Visa/Dankort SHOPIFY* 123456", -29900, 1370550],
      ["2025-01-07", "Gebyr for kontoudskrift", -2500, 1368050],
      ["2025-01-10", "Løn til Søren Østergård", -1250000, 118050],
    ]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
  });

  it("Nordea style: UTF-8 BOM, yyyy-mm-dd, Beskrivelse preferred over Navn", () => {
    const { detection, result, rows } = summarize("nordea.csv");
    expect(detection.encoding).toBe("utf-8-bom");
    expect(detection.headers[0]).toBe("Bogføringsdato");
    expect(detection.dateFormat).toBe("yyyy-mm-dd");
    expect(detection.mapping.currency).toBe(7);
    expect(detection.formatName).toContain("Nordea");
    expect(rows[0]).toEqual(["2025-02-03", "GOOGLE *ADS1234567", -124900, 875100]);
    expect(rows[3]).toEqual(["2025-02-05", "Gebyr overførsel", -75, 2366030]);
    expect(result.rows.every((r) => r.currency === "DKK")).toBe(true);
    expect(result.failed).toEqual([]);
  });

  it("Jyske Bank style: valørdato, quoted text with delimiter", () => {
    const { detection, result, rows } = summarize("jyske-bank.csv");
    expect(detection.encoding).toBe("utf-8");
    expect(detection.mapping.valueDate).toBe(1);
    expect(detection.dateFormat).toBe("dd-mm-yyyy");
    expect(rows[0]).toEqual(["2025-03-01", "MobilePay: Kaffe; kage og kop", -8700, 491300]);
    expect(rows[1]?.[2]).toBe(-343750);
    expect(toIsoDate(result.rows[1]!.valueDate)).toBe("2025-03-04");
    expect(result.rows).toHaveLength(4);
  });

  it("Lunar style: comma delimiter and decimal point", () => {
    const { detection, rows } = summarize("lunar.csv");
    expect(detection.delimiter).toBe(",");
    expect(detection.decimal).toBe(".");
    expect(rows).toEqual([
      ["2025-04-01", "Klaviyo, Inc.", -112340, 2087660],
      ["2025-04-02", "Canva Pty Ltd", -8900, 2078760],
      ["2025-04-03", "Overførsel, egen konto", -500000, 1578760],
      ["2025-04-04", "Refusion Zalando", 34995, 1613755],
    ]);
  });

  it("Spar Nord style: Ud/Ind columns, preamble and trailing empty lines", () => {
    const { detection, result, rows } = summarize("spar-nord.csv");
    expect(detection.headerRowIndex).toBe(3);
    expect(detection.mapping.amount).toBeNull();
    expect(detection.mapping.debit).toBe(2);
    expect(detection.mapping.credit).toBe(3);
    expect(detection.dateFormat).toBe("dd/mm/yyyy");
    expect(rows).toEqual([
      ["2025-05-02", "GLS Denmark fragt", -187500, 812500],
      ["2025-05-06", "Webshop udbetaling QuickPay", 1234055, 2046555],
      ["2025-05-12", "Husleje maj", -650000, 1396555],
      ["2025-05-15", "Renter", 45, 1396600],
    ]);
    expect(result.failed).toEqual([]);
  });

  it("file without header: infers columns from content", () => {
    const { detection, rows } = summarize("no-header.csv");
    expect(detection.headerRowIndex).toBe(-1);
    expect(detection.headers).toEqual(["Kolonne 1", "Kolonne 2", "Kolonne 3", "Kolonne 4", "Kolonne 5"]);
    expect(detection.mapping).toMatchObject({ bookingDate: 0, valueDate: 1, text: 2, amount: 3, balance: 4 });
    expect(rows[1]).toEqual(["2025-06-03", "Microsoft 365 abonnement", -105000, 883100]);
  });

  it("reports each broken row with a reason and skips the total line", () => {
    const { result } = analyzeCsv(fixture("broken-rows.csv"));
    expect(result.rows.map((r) => r.text)).toEqual(["Gyldig række", "Anden gyldig række"]);
    expect(result.failed.map((f) => f.line)).toEqual([3, 4, 5]);
    expect(result.failed[0]?.reason).toMatch(/Ugyldig dato/);
    expect(result.failed[1]?.reason).toMatch(/Ugyldigt beløb/);
    expect(result.failed[2]?.reason).toMatch(/Teksten er tom/);
    expect(result.skipped).toBe(1);
    expect(result.rows[1]?.balanceOre).toBe(-16050);
  });
});

describe("decoding", () => {
  it("decodes Windows-1252 æøå correctly", () => {
    const bytes = Buffer.from([0xe6, 0xf8, 0xe5, 0xc6, 0xd8, 0xc5]);
    expect(decodeCsvBytes(bytes)).toEqual({ text: "æøåÆØÅ", encoding: "windows-1252" });
  });
  it("strips the UTF-8 BOM", () => {
    expect(decodeCsvBytes(Buffer.from("﻿Dato", "utf8"))).toEqual({ text: "Dato", encoding: "utf-8-bom" });
  });
  it("keeps plain UTF-8", () => {
    expect(decodeCsvBytes(Buffer.from("Beløb", "utf8")).encoding).toBe("utf-8");
  });
});

describe("detection helpers", () => {
  it("detects delimiters", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter('Dato;Tekst;Beløb\n01-01-2025;"a, b, c";1,00')).toBe(";");
  });

  it("detects decimal separators", () => {
    expect(detectDecimal(["1.234,56", "-12,00"])).toBe(",");
    expect(detectDecimal(["1234.56", "-12.00"])).toBe(".");
    expect(detectDecimal(["1,234.56"])).toBe(".");
  });

  it("maps varying Danish header names", () => {
    expect(mappingFromHeaders(["Bogført", "Rentedato", "Posteringstekst", "Beløb i DKK", "Bogført saldo"])).toMatchObject(
      { bookingDate: 0, valueDate: 1, text: 2, amount: 3, balance: 4 },
    );
    expect(mappingFromHeaders(["Dato", "Beskrivelse", "Hævet", "Indsat"])).toMatchObject({
      bookingDate: 0,
      text: 1,
      amount: null,
      debit: 2,
      credit: 3,
    });
  });

  it("handles CRLF and quoted newlines", () => {
    const rows = tokenize('a;"b\nc";d\r\n1;2;3', ";");
    expect(rows[0]).toEqual(["a", "b\nc", "d"]);
  });

  it("handles parentheses and trailing minus in amounts", () => {
    const text = "Dato;Tekst;Beløb\n01-01-2025;A;(100,00)\n02-01-2025;B;250,00-";
    const d = detectFormat(text, "utf-8");
    const r = parseRows(tokenize(text, ";"), { ...d });
    expect(r.rows.map((x) => x.amountOre)).toEqual([-10000, -25000]);
  });

  it("supports user overrides of the mapping", () => {
    const { result } = analyzeCsv(fixture("nordea.csv"), {
      mapping: {
        bookingDate: 0,
        valueDate: null,
        text: 4,
        amount: 1,
        debit: null,
        credit: null,
        balance: null,
        currency: null,
      },
    });
    expect(result.rows[0]?.text).toBe("Google Ireland");
    expect(result.rows[0]?.balanceOre).toBeNull();
  });
});

describe("dedupe hashes", () => {
  it("are stable across imports and distinguish identical rows within a file", () => {
    const { result } = analyzeCsv(fixture("jyske-bank.csv"));
    const h1 = dedupeHashes(result.rows);
    const h2 = dedupeHashes(analyzeCsv(fixture("jyske-bank.csv")).result.rows);
    expect(h1).toEqual(h2);
    // Rows 3 and 4 are identical except for balance.
    expect(new Set(h1).size).toBe(4);
    const same = { bookingDate: new Date(Date.UTC(2025, 0, 1)), amountOre: -100, text: "Kaffe", balanceOre: null };
    const [x, y] = dedupeHashes([same, same]);
    expect(x).not.toBe(y);
  });
});
