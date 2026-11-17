import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  detectDateFormat,
  formatDate,
  fromIsoDate,
  makeDate,
  parseDanishDate,
  parseDateWithFormat,
  toIsoDate,
} from "@/lib/dates";
import { isValidCvr, normalizeCvr } from "@/lib/cvr";

describe("dates", () => {
  it.each([
    ["24-03-2025", "2025-03-24"],
    ["24.03.2025", "2025-03-24"],
    ["24/03/2025", "2025-03-24"],
    ["2025-03-24", "2025-03-24"],
    ["4-3-2025", "2025-03-04"],
    ["24-03-25", "2025-03-24"],
    ["24.03.2025 00:00", "2025-03-24"],
    ["2025-03-24T10:00:00", "2025-03-24"],
  ])("parses %s", (input, iso) => {
    expect(toIsoDate(parseDanishDate(input))).toBe(iso);
  });

  it.each(["31-02-2025", "00-01-2025", "2025-13-01", "hello", "", "32.01.2025"])(
    "rejects %j",
    (input) => {
      expect(parseDanishDate(input)).toBeNull();
    },
  );

  it("parses leap day only in leap years", () => {
    expect(parseDanishDate("29-02-2024")).not.toBeNull();
    expect(parseDanishDate("29-02-2025")).toBeNull();
  });

  it("formats dd-mm-yyyy in UTC", () => {
    expect(formatDate(makeDate(2025, 1, 5))).toBe("05-01-2025");
    expect(formatDate(null)).toBe("");
  });

  it("detects a format that fits all samples", () => {
    expect(detectDateFormat(["01-02-2025", "28-02-2025"])).toBe("dd-mm-yyyy");
    expect(detectDateFormat(["01.02.2025", ""])).toBe("dd.mm.yyyy");
    expect(detectDateFormat(["2025-02-01"])).toBe("yyyy-mm-dd");
    expect(detectDateFormat(["x"])).toBeNull();
    expect(detectDateFormat([])).toBeNull();
  });

  it("parseDateWithFormat is strict", () => {
    expect(parseDateWithFormat("01-02-2025", "dd.mm.yyyy")).toBeNull();
  });

  it("daysBetween and addDays", () => {
    const a = makeDate(2025, 1, 30)!;
    const b = makeDate(2025, 3, 1)!;
    expect(daysBetween(a, b)).toBe(30);
    expect(daysBetween(b, a)).toBe(-30);
    expect(toIsoDate(addDays(a, 2))).toBe("2025-02-01");
  });

  it("fromIsoDate", () => {
    expect(toIsoDate(fromIsoDate("2025-06-01"))).toBe("2025-06-01");
    expect(fromIsoDate("")).toBeNull();
  });
});

describe("cvr", () => {
  it.each(["12345678", "1234 5678", "DK12345678", "DK 12 34 56 78", "CVR-nr. 12345678"])(
    "accepts %s",
    (v) => expect(isValidCvr(v)).toBe(true),
  );
  it.each(["1234567", "123456789", "abcdefgh", ""])("rejects %j", (v) =>
    expect(isValidCvr(v)).toBe(false),
  );
  it("normalizes", () => expect(normalizeCvr("DK 1234-5678")).toBe("12345678"));
});
