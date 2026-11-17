/**
 * Built-in keyword map for common webshop suppliers → account + VAT code.
 * Used only when no learned rule matches. Account numbers refer to the standard chart (src/lib/accounting/chart.ts).
 */
export interface KeywordRule {
  keywords: string[];
  accountNumber: string;
  vatCode: string;
  label: string;
}

export const KEYWORD_RULES: readonly KeywordRule[] = [
  { keywords: ["shopify"], accountNumber: "3610", vatCode: "IEUY", label: "Shopify (webshop-platform, EU-ydelse)" },
  { keywords: ["google ads", "google"], accountNumber: "2220", vatCode: "IEUY", label: "Google Ads (EU-ydelse)" },
  { keywords: ["meta platforms", "facebook", "facebk", "instagram", "meta"], accountNumber: "2220", vatCode: "IEUY", label: "Meta/Facebook-annoncer (EU-ydelse)" },
  { keywords: ["tiktok"], accountNumber: "2220", vatCode: "IEUY", label: "TikTok-annoncer (EU-ydelse)" },
  { keywords: ["gls"], accountNumber: "1350", vatCode: "I25", label: "GLS fragt" },
  { keywords: ["postnord", "post nord"], accountNumber: "1350", vatCode: "I25", label: "PostNord fragt" },
  { keywords: ["dao"], accountNumber: "1350", vatCode: "I25", label: "DAO fragt" },
  { keywords: ["bring"], accountNumber: "1350", vatCode: "I25", label: "Bring fragt" },
  { keywords: ["dhl"], accountNumber: "1350", vatCode: "I25", label: "DHL fragt" },
  { keywords: ["shipmondo"], accountNumber: "1350", vatCode: "I25", label: "Shipmondo fragt" },
  { keywords: ["quickpay"], accountNumber: "3620", vatCode: "NONE", label: "QuickPay betalingsgebyrer (momsfri)" },
  { keywords: ["stripe"], accountNumber: "3620", vatCode: "NONE", label: "Stripe betalingsgebyrer (momsfri)" },
  { keywords: ["mobilepay", "vipps"], accountNumber: "3620", vatCode: "NONE", label: "MobilePay gebyrer (momsfri)" },
  { keywords: ["paypal"], accountNumber: "3620", vatCode: "NONE", label: "PayPal gebyrer (momsfri)" },
  { keywords: ["nets", "clearhaus"], accountNumber: "3620", vatCode: "NONE", label: "Kortindløsning (momsfri)" },
  { keywords: ["klaviyo"], accountNumber: "2820", vatCode: "IVY", label: "Klaviyo (ydelse uden for EU)" },
  { keywords: ["mailchimp"], accountNumber: "2820", vatCode: "IVY", label: "Mailchimp (ydelse uden for EU)" },
  { keywords: ["canva"], accountNumber: "2820", vatCode: "IVY", label: "Canva (ydelse uden for EU)" },
  { keywords: ["microsoft", "msft"], accountNumber: "2820", vatCode: "IEUY", label: "Microsoft (EU-ydelse)" },
  { keywords: ["adobe"], accountNumber: "2820", vatCode: "IEUY", label: "Adobe (EU-ydelse)" },
  { keywords: ["apple", "itunes", "icloud"], accountNumber: "2820", vatCode: "IEUY", label: "Apple (EU-ydelse)" },
  { keywords: ["dropbox"], accountNumber: "2820", vatCode: "IEUY", label: "Dropbox (EU-ydelse)" },
  { keywords: ["slack", "zoom", "notion"], accountNumber: "2820", vatCode: "IVY", label: "SaaS uden for EU" },
  { keywords: ["dinero", "e-conomic", "economic", "billy"], accountNumber: "2810", vatCode: "I25", label: "Regnskabsprogram (dansk)" },
  { keywords: ["emballage", "kaffeposer", "papkasser"], accountNumber: "1360", vatCode: "I25", label: "Emballage" },
  { keywords: ["kontorland", "lomax", "staples"], accountNumber: "2800", vatCode: "I25", label: "Kontorartikler" },
  { keywords: ["telia", "telenor", "yousee", "tdc", "3 danmark"], accountNumber: "2830", vatCode: "I25", label: "Telefon og internet" },
  { keywords: ["husleje"], accountNumber: "2750", vatCode: "NONE", label: "Husleje" },
  { keywords: ["gebyr", "kontogebyr", "renter"], accountNumber: "3630", vatCode: "NONE", label: "Bankgebyrer" },
];
