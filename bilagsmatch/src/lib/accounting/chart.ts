import type { AccountType } from "@prisma/client";

export interface VatCodeSeed {
  code: string;
  name: string;
  description: string;
  ratePercent: number;
}

/** VAT codes (momskoder). Rates are whole percent. */
export const STANDARD_VAT_CODES: readonly VatCodeSeed[] = [
  {
    code: "I25",
    name: "Købsmoms 25 %",
    description: "Indgående moms 25 % ved køb hos danske leverandører. Momsen kan fratrækkes.",
    ratePercent: 25,
  },
  {
    code: "IEU",
    name: "EU-køb af varer",
    description:
      "Køb af varer fra virksomheder i andre EU-lande. Du beregner selv 25 % erhvervelsesmoms, som også kan fratrækkes (rubrik A-varer).",
    ratePercent: 25,
  },
  {
    code: "IEUY",
    name: "EU-køb af ydelser (omvendt betalingspligt)",
    description:
      "Køb af ydelser fra virksomheder i andre EU-lande, fx Shopify, Google Ads og Meta. Fakturaen er uden moms; du beregner selv 25 % (rubrik A-ydelser).",
    ratePercent: 25,
  },
  {
    code: "IVY",
    name: "Køb af ydelser uden for EU",
    description:
      "Køb af ydelser fra virksomheder uden for EU, fx amerikanske SaaS-abonnementer. Omvendt betalingspligt: du beregner selv 25 % moms.",
    ratePercent: 25,
  },
  {
    code: "U25",
    name: "Salgsmoms 25 %",
    description: "Udgående moms 25 % ved salg i Danmark.",
    ratePercent: 25,
  },
  {
    code: "NONE",
    name: "Ingen moms",
    description: "Momsfri eller uden for momsområdet, fx bankgebyrer, betalingsgebyrer, forsikring og løn.",
    ratePercent: 0,
  },
];

export interface AccountSeed {
  number: string;
  name: string;
  type: AccountType;
  defaultVatCode: string | null;
}

/** Simplified Danish standard chart of accounts for a webshop. */
export const STANDARD_CHART: readonly AccountSeed[] = [
  { number: "1010", name: "Salg af varer, Danmark", type: "REVENUE", defaultVatCode: "U25" },
  { number: "1020", name: "Salg af varer, EU og udland", type: "REVENUE", defaultVatCode: "NONE" },
  { number: "1050", name: "Fragtindtægter", type: "REVENUE", defaultVatCode: "U25" },
  { number: "1310", name: "Varekøb, Danmark", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "1320", name: "Varekøb, EU", type: "EXPENSE", defaultVatCode: "IEU" },
  { number: "1350", name: "Fragt og forsendelse", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "1360", name: "Emballage og forsendelsesmaterialer", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "2210", name: "Annoncering og markedsføring", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "2220", name: "Online annoncering (Google, Meta m.fl.)", type: "EXPENSE", defaultVatCode: "IEUY" },
  { number: "2750", name: "Husleje", type: "EXPENSE", defaultVatCode: "NONE" },
  { number: "2800", name: "Kontorartikler", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "2810", name: "IT og software, Danmark", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "2820", name: "Softwareabonnementer, udland", type: "EXPENSE", defaultVatCode: "IEUY" },
  { number: "2830", name: "Telefon og internet", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "2850", name: "Revisor og bogføring", type: "EXPENSE", defaultVatCode: "I25" },
  { number: "2860", name: "Forsikringer", type: "EXPENSE", defaultVatCode: "NONE" },
  { number: "3610", name: "Webshop-platform og apps", type: "EXPENSE", defaultVatCode: "IEUY" },
  { number: "3620", name: "Betalingsgebyrer (indløsning)", type: "EXPENSE", defaultVatCode: "NONE" },
  { number: "3630", name: "Bankgebyrer", type: "EXPENSE", defaultVatCode: "NONE" },
  { number: "5810", name: "Bankkonto", type: "ASSET", defaultVatCode: null },
  { number: "5820", name: "Mellemregning, overførsler", type: "ASSET", defaultVatCode: null },
];
