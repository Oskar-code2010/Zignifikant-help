/**
 * Account + VAT suggestion. Pure functions.
 * Priority: learned CVR rule → learned supplier-name rule → learned bank-text rule → built-in keywords → none.
 */
import { normalizeCvr } from "@/lib/cvr";
import { normalizeBankText, normalizeSupplier } from "@/lib/matching/text";
import { KEYWORD_RULES, type KeywordRule } from "./keywords";

export type RuleMatchType = "SUPPLIER_CVR" | "SUPPLIER_NAME" | "BANK_TEXT_CONTAINS";

export interface RuleLike {
  id: string;
  matchType: RuleMatchType;
  pattern: string;
  accountNumber: string;
  vatCode: string;
  timesApplied: number;
}

export interface SuggestionInput {
  supplierCvr: string | null;
  supplierName: string | null;
  bankText: string | null;
}

export type SuggestionSource = "RULE_CVR" | "RULE_NAME" | "RULE_BANK_TEXT" | "KEYWORD";

export interface Suggestion {
  accountNumber: string;
  vatCode: string;
  source: SuggestionSource;
  ruleId: string | null;
  /** Danish explanation shown in the review screen. */
  explanation: string;
}

/** Canonical form of a supplier name for SUPPLIER_NAME rules ("GLS Denmark A/S" → "gls"). */
export function supplierNamePattern(name: string): string {
  return normalizeSupplier(name).join(" ");
}

function bestRule(rules: RuleLike[]): RuleLike | undefined {
  return [...rules].sort(
    (a, b) => b.timesApplied - a.timesApplied || b.pattern.length - a.pattern.length,
  )[0];
}

function keywordHit(haystack: string, rules: readonly KeywordRule[]): KeywordRule | undefined {
  const h = ` ${haystack.toLowerCase().replace(/[^a-z0-9æøå]+/g, " ")} `;
  return rules.find((r) => r.keywords.some((k) => h.includes(` ${k} `)));
}

export function suggestAccount(
  input: SuggestionInput,
  rules: RuleLike[],
  keywordRules: readonly KeywordRule[] = KEYWORD_RULES,
): Suggestion | null {
  if (input.supplierCvr) {
    const cvr = normalizeCvr(input.supplierCvr);
    const r = bestRule(rules.filter((x) => x.matchType === "SUPPLIER_CVR" && x.pattern === cvr));
    if (r)
      return {
        ...pick(r),
        source: "RULE_CVR",
        ruleId: r.id,
        explanation: `Lært regel for CVR ${cvr} (brugt ${r.timesApplied} gange)`,
      };
  }
  if (input.supplierName) {
    const p = supplierNamePattern(input.supplierName);
    const r = p
      ? bestRule(rules.filter((x) => x.matchType === "SUPPLIER_NAME" && x.pattern === p))
      : undefined;
    if (r)
      return {
        ...pick(r),
        source: "RULE_NAME",
        ruleId: r.id,
        explanation: `Lært regel for leverandøren "${input.supplierName}" (brugt ${r.timesApplied} gange)`,
      };
  }
  if (input.bankText) {
    const text = input.bankText.toLowerCase();
    const r = bestRule(
      rules.filter(
        (x) =>
          x.matchType === "BANK_TEXT_CONTAINS" &&
          x.pattern.length > 0 &&
          text.includes(x.pattern.toLowerCase()),
      ),
    );
    if (r)
      return {
        ...pick(r),
        source: "RULE_BANK_TEXT",
        ruleId: r.id,
        explanation: `Lært regel: bankteksten indeholder "${r.pattern}"`,
      };
  }
  const kw = keywordHit(`${input.supplierName ?? ""} ${input.bankText ?? ""}`, keywordRules);
  if (kw)
    return {
      accountNumber: kw.accountNumber,
      vatCode: kw.vatCode,
      source: "KEYWORD",
      ruleId: null,
      explanation: `Standardforslag: ${kw.label}`,
    };
  return null;
}

function pick(r: RuleLike) {
  return { accountNumber: r.accountNumber, vatCode: r.vatCode };
}

/**
 * Which rule to create/strengthen when the bookkeeper confirms a posting.
 * Prefer the most specific key available: CVR, then supplier name, then a bank-text keyword.
 */
export function learningKey(
  input: SuggestionInput,
): { matchType: RuleMatchType; pattern: string } | null {
  if (input.supplierCvr && /^\d{8}$/.test(normalizeCvr(input.supplierCvr))) {
    return { matchType: "SUPPLIER_CVR", pattern: normalizeCvr(input.supplierCvr) };
  }
  if (input.supplierName) {
    const p = supplierNamePattern(input.supplierName);
    if (p.length >= 2) return { matchType: "SUPPLIER_NAME", pattern: p };
  }
  if (input.bankText) {
    const word = normalizeBankText(input.bankText).find((t) => t.length >= 4 && !/\d/.test(t));
    if (word) return { matchType: "BANK_TEXT_CONTAINS", pattern: word };
  }
  return null;
}
