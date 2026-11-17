import { describe, expect, it } from "vitest";
import {
  AmountParseError,
  formatAmountInput,
  formatDanishNumber,
  formatDKK,
  formatExportAmount,
  parseDanishAmount,
  ratioBasisPoints,
  tryParseDanishAmount,
} from "@/lib/money";

describe("parseDanishAmount", () => {
  it.each([
    ["1.234,56", 123456],
    ["1234,56", 123456],
    ["0,01", 1],
    ["0,5", 50],
    [",50", 50],
    ["12", 1200],
    ["1.234", 123400],
    ["1.234.567,89", 123456789],
    ["1 234,56", 123456],
    ["1 234,56", 123456],
    ["  42,00  ", 4200],
    ["-1.234,56", -123456],
    ["−1.234,56", -123456],
    ["1.234,56-", -123456],
    ["(1.234,56)", -123456],
    ["+99,95", 9995],
    ["kr. 1.234,56", 123456],
    ["1.234,56 kr.", 123456],
    ["1.234,56 kr", 123456],
    ["DKK 1.234,56", 123456],
    ["1.234,56 DKK", 123456],
    ["-kr. 50,00", -5000],
    ["0,00", 0],
    ["-0,00", 0],
    ["10,005", 1001],
    ["10,004", 1000],
  ])("parses %s → %d (decimal comma)", (input, expected) => {
    expect(parseDanishAmount(input)).toBe(expected);
  });

  it.each([
    ["1234.56", 123456],
    ["-1234.56", -123456],
    ["1,234.56", 123456],
    ["1,234,567.89", 123456789],
    ["0.5", 50],
    ["1234", 123400],
  ])("parses %s → %d (decimal point)", (input, expected) => {
    expect(parseDanishAmount(input, ".")).toBe(expected);
  });

  it.each([
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["1234,5", 123450],
    ["1.234", 123400],
    ["12.5", 1250],
    ["1.234.567", 123456700],
  ])("auto-detects %s → %d", (input, expected) => {
    expect(parseDanishAmount(input, "auto")).toBe(expected);
  });

  it.each(["", "   ", "abc", "12,34,56", "1.23,45", "--", "kr.", "12a", "1,2,3", "1..2"])(
    "rejects %j",
    (input) => {
      expect(() => parseDanishAmount(input)).toThrow(AmountParseError);
    },
  );

  it("rejects amounts too large for storage", () => {
    expect(() => parseDanishAmount("99.999.999,00")).toThrow(/for stort/);
  });

  it("never produces floats", () => {
    for (const s of ["0,1", "0,07", "19,99", "1.000,10", "33,33"]) {
      expect(Number.isInteger(parseDanishAmount(s))).toBe(true);
    }
  });

  it("tryParseDanishAmount returns null on bad input", () => {
    expect(tryParseDanishAmount("x")).toBeNull();
    expect(tryParseDanishAmount(null)).toBeNull();
    expect(tryParseDanishAmount(undefined)).toBeNull();
    expect(tryParseDanishAmount("12,00")).toBe(1200);
  });
});

describe("formatting", () => {
  it.each([
    [123456, "1.234,56 kr."],
    [0, "0,00 kr."],
    [1, "0,01 kr."],
    [-5000, "-50,00 kr."],
    [100000000, "1.000.000,00 kr."],
    [99, "0,99 kr."],
    [-123456789, "-1.234.567,89 kr."],
  ])("formatDKK(%d) = %s", (ore, expected) => {
    expect(formatDKK(ore)).toBe(expected);
  });

  it("formatDanishNumber has no suffix", () => {
    expect(formatDanishNumber(124900)).toBe("1.249,00");
  });

  it("formatExportAmount has no thousands separator", () => {
    expect(formatExportAmount(123456)).toBe("1234,56");
    expect(formatExportAmount(-123456)).toBe("-1234,56");
    expect(formatExportAmount(5)).toBe("0,05");
  });

  it("formatAmountInput handles null", () => {
    expect(formatAmountInput(null)).toBe("");
    expect(formatAmountInput(1050)).toBe("10,50");
  });

  it("rejects non-integer øre", () => {
    expect(() => formatDKK(12.5)).toThrow(TypeError);
  });

  it("round-trips", () => {
    for (const ore of [0, 1, 99, 100, 123456, -98765, 2147483647]) {
      expect(parseDanishAmount(formatDKK(ore))).toBe(ore);
    }
  });

  it("ratioBasisPoints", () => {
    expect(ratioBasisPoints(2000, 10000)).toBe(2000);
    expect(ratioBasisPoints(1, 0)).toBe(0);
  });
});
