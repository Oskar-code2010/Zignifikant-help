import { describe, expect, it } from "vitest";
import { BOM, buildKassekladdeCsv, csvField, exportFilename, type ExportEntry } from "@/lib/export/kassekladde";
import { makeDate } from "@/lib/dates";

const entries: ExportEntry[] = [
  { date: makeDate(2026, 9, 20)!, voucherNumber: 2, text: "GLS Denmark A/S – Faktura 90881234", accountNumber: "1350", vatCode: "I25", amountOre: 187500 },
  { date: makeDate(2026, 9, 2)!, voucherNumber: 1, text: "Shopify; abonnement", accountNumber: "3610", vatCode: "IEUY", amountOre: 53821 },
  { date: makeDate(2026, 10, 5)!, voucherNumber: 3, text: "Emballagehuset – Kreditnota 2026-131", accountNumber: "1360", vatCode: "I25", amountOre: -50000 },
  { date: makeDate(2026, 10, 6)!, voucherNumber: 4, text: "QuickPay gebyrer", accountNumber: "3620", vatCode: "NONE", amountOre: 1234567 },
];

describe("kassekladde CSV", () => {
  it("generic preset: exact output with BOM, semicolons, decimal comma, dd-mm-yyyy and CRLF", () => {
    const csv = buildKassekladdeCsv(entries, "generic", "5810");
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(
      BOM +
        [
          "Dato;Bilagsnr.;Tekst;Konto;Momskode;Beløb;Modkonto",
          '02-09-2026;1;"Shopify; abonnement";3610;IEUY;538,21;5810',
          "20-09-2026;2;GLS Denmark A/S – Faktura 90881234;1350;I25;1875,00;5810",
          "05-10-2026;3;Emballagehuset – Kreditnota 2026-131;1360;I25;-500,00;5810",
          "06-10-2026;4;QuickPay gebyrer;3620;;12345,67;5810",
        ].join("\r\n") +
        "\r\n",
    );
  });

  it("e-conomic preset column order", () => {
    const lines = buildKassekladdeCsv(entries.slice(0, 1), "economic", "5810").slice(1).split("\r\n");
    expect(lines[0]).toBe("Dato;Bilagsnr.;Konto;Tekst;Beløb;Modkonto;Momskode");
    expect(lines[1]).toBe("20-09-2026;2;1350;GLS Denmark A/S – Faktura 90881234;1875,00;5810;I25");
  });

  it("Dinero preset column order", () => {
    const lines = buildKassekladdeCsv(entries.slice(0, 1), "dinero", "5820").slice(1).split("\r\n");
    expect(lines[0]).toBe("Bilagsdato;Bilagsnummer;Beskrivelse;Beløb;Konto;Momskode;Modkonto");
    expect(lines[1]).toBe("20-09-2026;2;GLS Denmark A/S – Faktura 90881234;1875,00;1350;I25;5820");
  });

  it("keeps æøå as UTF-8 bytes after the BOM", () => {
    const csv = buildKassekladdeCsv([{ ...entries[0]!, text: "Køb af æbler på Ærø" }], "generic", "5810");
    const bytes = Buffer.from(csv, "utf8");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.toString("utf8")).toContain("Køb af æbler på Ærø");
  });

  it("empty export still has a header", () => {
    expect(buildKassekladdeCsv([], "generic", "5810")).toBe(`${BOM}Dato;Bilagsnr.;Tekst;Konto;Momskode;Beløb;Modkonto\r\n`);
  });

  it("escapes quotes and neutralizes formula injection in text", () => {
    expect(csvField('Firma "Nord"')).toBe('"Firma ""Nord"""');
    expect(csvField('a;"b"')).toBe('"a;""b"""');
    expect(csvField("=HYPERLINK(1)", true)).toBe("'=HYPERLINK(1)");
    expect(csvField("-500,00")).toBe("-500,00");
    expect(csvField("linje1\nlinje2", true)).toBe("linje1 linje2");
  });

  it("builds a safe filename", () => {
    expect(exportFilename("Kaffekompagniet IVS", "dinero", makeDate(2026, 9, 1), makeDate(2026, 9, 30))).toBe(
      "kassekladde_kaffekompagniet-ivs_dinero_01-09-2026_30-09-2026.csv",
    );
    expect(exportFilename("Ærø Æbler ApS", "generic", null, null)).toBe("kassekladde_aeroe-aebler-aps_generic.csv");
  });
});
