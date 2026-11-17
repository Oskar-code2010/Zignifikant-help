import { describe, expect, it } from "vitest";
import {
  learningKey,
  suggestAccount,
  supplierNamePattern,
  type RuleLike,
} from "@/lib/categorization/suggest";
import { KEYWORD_RULES } from "@/lib/categorization/keywords";
import { STANDARD_CHART, STANDARD_VAT_CODES } from "@/lib/accounting/chart";

const rule = (p: Partial<RuleLike> & Pick<RuleLike, "matchType" | "pattern">): RuleLike => ({
  id: `${p.matchType}-${p.pattern}`,
  accountNumber: "9999",
  vatCode: "I25",
  timesApplied: 1,
  ...p,
});

describe("suggestAccount priority", () => {
  const rules: RuleLike[] = [
    rule({ matchType: "SUPPLIER_CVR", pattern: "16291824", accountNumber: "1001" }),
    rule({ matchType: "SUPPLIER_NAME", pattern: "gls", accountNumber: "1002" }),
    rule({ matchType: "BANK_TEXT_CONTAINS", pattern: "gls", accountNumber: "1003" }),
  ];

  it("1. CVR rule wins", () => {
    const s = suggestAccount(
      { supplierCvr: "DK 16291824", supplierName: "GLS Denmark A/S", bankText: "GLS" },
      rules,
    );
    expect(s).toMatchObject({ accountNumber: "1001", source: "RULE_CVR" });
  });

  it("2. supplier-name rule when CVR has no rule", () => {
    const s = suggestAccount(
      { supplierCvr: "11111111", supplierName: "GLS Denmark ApS", bankText: "x" },
      rules,
    );
    expect(s).toMatchObject({ accountNumber: "1002", source: "RULE_NAME" });
    expect(s?.explanation).toContain("GLS Denmark ApS");
  });

  it("3. bank-text rule", () => {
    const s = suggestAccount(
      { supplierCvr: null, supplierName: null, bankText: "Betaling GLS fragt" },
      rules,
    );
    expect(s).toMatchObject({ accountNumber: "1003", source: "RULE_BANK_TEXT" });
  });

  it("4. built-in keyword map", () => {
    expect(
      suggestAccount(
        { supplierCvr: null, supplierName: "Shopify International Limited", bankText: null },
        [],
      ),
    ).toMatchObject({
      accountNumber: "3610",
      vatCode: "IEUY",
      source: "KEYWORD",
    });
    expect(
      suggestAccount({ supplierCvr: null, supplierName: null, bankText: "FACEBK *ADS 82JK" }, []),
    ).toMatchObject({ accountNumber: "2220" });
    expect(
      suggestAccount({ supplierCvr: null, supplierName: "QuickPay ApS", bankText: null }, []),
    ).toMatchObject({ vatCode: "NONE" });
    expect(
      suggestAccount({ supplierCvr: null, supplierName: "Klaviyo, Inc.", bankText: null }, []),
    ).toMatchObject({ vatCode: "IVY" });
  });

  it("5. no suggestion when nothing matches", () => {
    expect(
      suggestAccount(
        { supplierCvr: null, supplierName: "Helt Ukendt Firma", bankText: "Overførsel" },
        [],
      ),
    ).toBeNull();
  });

  it("prefers the most used rule when several match", () => {
    const s = suggestAccount(
      { supplierCvr: null, supplierName: null, bankText: "POSTNORD PORTO" },
      [
        rule({
          matchType: "BANK_TEXT_CONTAINS",
          pattern: "postnord",
          accountNumber: "A",
          timesApplied: 2,
        }),
        rule({
          matchType: "BANK_TEXT_CONTAINS",
          pattern: "porto",
          accountNumber: "B",
          timesApplied: 9,
        }),
      ],
    );
    expect(s?.accountNumber).toBe("B");
  });

  it("keywords match whole words only", () => {
    expect(
      suggestAccount({ supplierCvr: null, supplierName: "Daoist Café", bankText: null }, []),
    ).toBeNull();
  });

  it("every keyword rule points to an account and VAT code in the standard chart", () => {
    const accounts = new Set(STANDARD_CHART.map((a) => a.number));
    const vat = new Set(STANDARD_VAT_CODES.map((v) => v.code));
    for (const r of KEYWORD_RULES) {
      expect(accounts.has(r.accountNumber), r.label).toBe(true);
      expect(vat.has(r.vatCode), r.label).toBe(true);
    }
  });
});

describe("learningKey", () => {
  it("uses the CVR when valid", () => {
    expect(learningKey({ supplierCvr: "16291824", supplierName: "GLS", bankText: null })).toEqual({
      matchType: "SUPPLIER_CVR",
      pattern: "16291824",
    });
  });
  it("falls back to the normalized supplier name", () => {
    expect(
      learningKey({
        supplierCvr: "123",
        supplierName: "Shopify International Limited",
        bankText: null,
      }),
    ).toEqual({
      matchType: "SUPPLIER_NAME",
      pattern: "shopify",
    });
  });
  it("falls back to a bank-text word", () => {
    expect(
      learningKey({
        supplierCvr: null,
        supplierName: null,
        bankText: "Dankort-køb 1234 BAUHAUS ESBJERG",
      }),
    ).toEqual({
      matchType: "BANK_TEXT_CONTAINS",
      pattern: "bauhaus",
    });
  });
  it("returns null without anything to learn from", () => {
    expect(learningKey({ supplierCvr: null, supplierName: null, bankText: null })).toBeNull();
  });
  it("supplierNamePattern is stable across legal forms", () => {
    expect(supplierNamePattern("GLS Denmark A/S")).toBe(supplierNamePattern("GLS Denmark ApS"));
  });
});
