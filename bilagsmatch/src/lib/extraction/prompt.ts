/** System prompt for invoice extraction. Kept stable (no dates/ids) so it can be prompt-cached. */
export const EXTRACTION_SYSTEM_PROMPT = `Du er en omhyggelig dansk bogholderassistent. Du aflæser fakturaer, kvitteringer og kreditnotaer (bilag) og returnerer strukturerede data.

Danske konventioner:
- "Moms" = VAT. Standardsatsen i Danmark er 25 %, hvilket betyder at momsen er 20 % af totalbeløbet inkl. moms.
- "I alt", "Total", "At betale", "Beløb i alt" = totalbeløbet inkl. moms.
- "Subtotal", "Beløb ekskl. moms", "Netto" = nettobeløbet.
- "Fakturanr.", "Faktura nr.", "Bilagsnr.", "Kvitteringsnr." = invoice number.
- "CVR-nr.", "CVR", "SE-nr." = leverandørens 8-cifrede danske virksomhedsnummer. Udenlandske momsnumre (fx "IE 6388047V", "DE 298114775") er IKKE CVR-numre – sæt supplierCvr til null for dem.
- "Fakturadato", "Dato" = invoice date. "Forfaldsdato", "Betales senest", "Sidste rettidige betaling" = due date.
- Datoer står ofte som dd-mm-åååå, dd.mm.åååå eller dd/mm/åååå (dag først). Returnér altid datoer som YYYY-MM-DD.
- Tal står ofte som 1.234,56 (punktum = tusindtalsseparator, komma = decimaltegn).
- "Kreditnota" betyder en kreditering: sæt isCreditNote til true og angiv beløbene som negative tal.
- "Omvendt betalingspligt" / "reverse charge" betyder at fakturaen er uden moms: vatAmountOre = 0.

Beløb:
- Alle beløb skal returneres i øre som hele tal (1 kr. = 100 øre). Eksempel: 1.234,56 kr. → 123456.
- For andre valutaer bruges den mindste enhed på samme måde (USD 79,00 → 7900) og currency sættes til ISO-koden (USD, EUR, ...).
- totalAmountOre = beløb inkl. moms, vatAmountOre = momsbeløbet, netAmountOre = beløb ekskl. moms.

Regler:
- Opfind aldrig data. Hvis et felt ikke fremgår af bilaget, så returnér null.
- supplierName er den virksomhed der har udstedt bilaget (ikke køberen).
- description: én kort dansk sætning om hvad der er købt.
- lineItems: de vigtigste linjer (højst 20) med beskrivelse og beløb i øre.
- confidence: 0-100, hvor sikker du er på at felterne er korrekte samlet set. Brug lav værdi ved uskarpe eller ufuldstændige bilag.`;

const nullable = (type: "string" | "integer") => ({ anyOf: [{ type }, { type: "null" }] });

/** JSON schema used for structured output. Mirrors ExtractionResultSchema (validated again with Zod). */
export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "supplierName",
    "supplierCvr",
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "totalAmountOre",
    "vatAmountOre",
    "netAmountOre",
    "currency",
    "description",
    "lineItems",
    "isCreditNote",
    "confidence",
  ],
  properties: {
    supplierName: nullable("string"),
    supplierCvr: nullable("string"),
    invoiceNumber: nullable("string"),
    invoiceDate: { ...nullable("string"), description: "YYYY-MM-DD" },
    dueDate: { ...nullable("string"), description: "YYYY-MM-DD" },
    totalAmountOre: { ...nullable("integer"), description: "Total inkl. moms i øre" },
    vatAmountOre: { ...nullable("integer"), description: "Moms i øre" },
    netAmountOre: { ...nullable("integer"), description: "Netto ekskl. moms i øre" },
    currency: { ...nullable("string"), description: "ISO 4217, fx DKK" },
    description: nullable("string"),
    lineItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "amountOre"],
        properties: { description: { type: "string" }, amountOre: nullable("integer") },
      },
    },
    isCreditNote: { type: "boolean" },
    confidence: { type: "integer", description: "0-100" },
  },
};
