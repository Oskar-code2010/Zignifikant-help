/**
 * Synthetic sample invoices/receipts used by the seed script (to generate real PDFs and bank CSVs)
 * and by the mock extraction provider (so the demo works offline with correct data).
 * All companies, CVR numbers and invoice numbers are fictitious, although some supplier
 * names are well-known services that webshops typically pay for.
 */

export type ClientKey = "nordlys" | "kaffe";

export interface SampleLine {
  description: string;
  quantity: number;
  /** Unit price excl. VAT, in øre (or minor unit of the currency). */
  unitPriceOre: number;
}

export interface SampleDocument {
  filename: string;
  client: ClientKey;
  supplierName: string;
  supplierCvr: string | null;
  /** Foreign VAT id shown on the invoice when there is no CVR. */
  supplierVatId?: string;
  supplierAddress: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate: string | null;
  currency: "DKK" | "USD" | "EUR";
  lines: SampleLine[];
  /** 25 for Danish VAT, 0 for reverse charge / VAT-exempt. */
  vatRate: 25 | 0;
  isCreditNote?: boolean;
  /** Printed note, e.g. reverse charge text. */
  note?: string;
  /** "receipt" renders a till receipt layout instead of an invoice. */
  kind?: "invoice" | "receipt";
}

export function totals(doc: SampleDocument): { netOre: number; vatOre: number; totalOre: number } {
  const sign = doc.isCreditNote ? -1 : 1;
  const net = doc.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPriceOre), 0);
  const vat = Math.round((net * doc.vatRate) / 100);
  return { netOre: sign * net, vatOre: sign * vat, totalOre: sign * (net + vat) };
}

export const SAMPLE_DOCUMENTS: readonly SampleDocument[] = [
  // ---------------- Nordlys Webshop ApS ----------------
  {
    filename: "shopify-faktura-2026-09.pdf",
    client: "nordlys",
    supplierName: "Shopify International Limited",
    supplierCvr: null,
    supplierVatId: "IE 3347103LH",
    supplierAddress: "2nd Floor Victoria Buildings, 1-2 Haddington Road, Dublin 4, Irland",
    invoiceNumber: "SHP-447120391",
    invoiceDate: "2026-09-01",
    dueDate: "2026-09-01",
    currency: "USD",
    lines: [
      { description: "Shopify Basic – månedligt abonnement", quantity: 1, unitPriceOre: 3900 },
      { description: "App: Klaviyo Reviews", quantity: 1, unitPriceOre: 1500 },
      { description: "App: Shipmondo fragtlabels", quantity: 1, unitPriceOre: 2500 },
    ],
    vatRate: 0,
    note: "Reverse charge – VAT to be accounted for by the recipient (omvendt betalingspligt).",
  },
  {
    filename: "google-ads-2026-09.pdf",
    client: "nordlys",
    supplierName: "Google Ireland Limited",
    supplierCvr: null,
    supplierVatId: "IE 6388047V",
    supplierAddress: "Gordon House, Barrow Street, Dublin 4, Irland",
    invoiceNumber: "5193827741",
    invoiceDate: "2026-09-30",
    dueDate: "2026-09-30",
    currency: "DKK",
    lines: [{ description: "Google Ads – klik september 2026, konto 412-118-9921", quantity: 1, unitPriceOre: 425000 }],
    vatRate: 0,
    note: "Omvendt betalingspligt – køber afregner dansk moms.",
  },
  {
    filename: "meta-ads-2026-09.pdf",
    client: "nordlys",
    supplierName: "Meta Platforms Ireland Limited",
    supplierCvr: null,
    supplierVatId: "IE 9692928F",
    supplierAddress: "4 Grand Canal Square, Dublin 2, Irland",
    invoiceNumber: "FBADS-104-338120",
    invoiceDate: "2026-09-15",
    dueDate: "2026-09-15",
    currency: "DKK",
    lines: [{ description: "Facebook- og Instagram-annoncer, 1.–15. september", quantity: 1, unitPriceOre: 218050 }],
    vatRate: 0,
    note: "Omvendt betalingspligt.",
  },
  {
    filename: "gls-faktura-90881234.pdf",
    client: "nordlys",
    supplierName: "GLS Denmark A/S",
    supplierCvr: "16291824",
    supplierAddress: "Gl. Højmevej 2, 5250 Odense SV",
    invoiceNumber: "90881234",
    invoiceDate: "2026-09-12",
    dueDate: "2026-09-26",
    currency: "DKK",
    lines: [
      { description: "Pakkeforsendelser Danmark, 52 stk.", quantity: 52, unitPriceOre: 2500 },
      { description: "Brændstoftillæg", quantity: 1, unitPriceOre: 20000 },
    ],
    vatRate: 25,
  },
  {
    filename: "postnord-faktura-2026-09.pdf",
    client: "nordlys",
    supplierName: "PostNord Danmark A/S",
    supplierCvr: "26663903",
    supplierAddress: "Hedegaardsvej 88, 2300 København S",
    invoiceNumber: "PN-7720015583",
    invoiceDate: "2026-09-30",
    dueDate: "2026-10-14",
    currency: "DKK",
    lines: [{ description: "MyPack Collect, september (78 pakker)", quantity: 78, unitPriceOre: 2400 }],
    vatRate: 25,
  },
  {
    filename: "postnord-porto-0908.pdf",
    client: "nordlys",
    supplierName: "PostNord Danmark A/S",
    supplierCvr: "26663903",
    supplierAddress: "Hedegaardsvej 88, 2300 København S",
    invoiceNumber: "KV-448812",
    invoiceDate: "2026-09-08",
    dueDate: null,
    currency: "DKK",
    lines: [{ description: "Porto, pakke til udlandet", quantity: 1, unitPriceOre: 7196 }],
    vatRate: 25,
    kind: "receipt",
  },
  {
    filename: "postnord-porto-0922.pdf",
    client: "nordlys",
    supplierName: "PostNord Danmark A/S",
    supplierCvr: "26663903",
    supplierAddress: "Hedegaardsvej 88, 2300 København S",
    invoiceNumber: "KV-451977",
    invoiceDate: "2026-09-22",
    dueDate: null,
    currency: "DKK",
    lines: [{ description: "Porto, pakke til udlandet", quantity: 1, unitPriceOre: 7196 }],
    vatRate: 25,
    kind: "receipt",
  },
  {
    filename: "emballagehuset-faktura-2026-118.pdf",
    client: "nordlys",
    supplierName: "Emballagehuset Vest A/S",
    supplierCvr: "35118274",
    supplierAddress: "Industrivej 14, 6700 Esbjerg",
    invoiceNumber: "2026-118",
    invoiceDate: "2026-09-03",
    dueDate: "2026-09-17",
    currency: "DKK",
    lines: [
      { description: "Papkasser 30x20x15, 250 stk.", quantity: 250, unitPriceOre: 750 },
      { description: "Silkepapir, hvid, 500 ark", quantity: 1, unitPriceOre: 47500 },
      { description: "Tape med logo, 36 ruller", quantity: 36, unitPriceOre: 1875 },
    ],
    vatRate: 25,
  },
  {
    filename: "emballagehuset-kreditnota-2026-131.pdf",
    client: "nordlys",
    supplierName: "Emballagehuset Vest A/S",
    supplierCvr: "35118274",
    supplierAddress: "Industrivej 14, 6700 Esbjerg",
    invoiceNumber: "2026-131",
    invoiceDate: "2026-10-02",
    dueDate: null,
    currency: "DKK",
    lines: [{ description: "Kreditering: 40 beskadigede papkasser (faktura 2026-118)", quantity: 40, unitPriceOre: 1000 }],
    vatRate: 25,
    isCreditNote: true,
  },
  {
    filename: "microsoft-365-2026-09.pdf",
    client: "nordlys",
    supplierName: "Microsoft Ireland Operations Ltd",
    supplierCvr: null,
    supplierVatId: "IE 8256796U",
    supplierAddress: "One Microsoft Place, South County Business Park, Dublin 18, Irland",
    invoiceNumber: "E0400SB2KQ",
    invoiceDate: "2026-09-05",
    dueDate: "2026-09-05",
    currency: "DKK",
    lines: [{ description: "Microsoft 365 Business Standard, 4 brugere", quantity: 4, unitPriceOre: 9850 }],
    vatRate: 0,
    note: "Omvendt betalingspligt.",
  },
  {
    filename: "quickpay-gebyrer-2026-09.pdf",
    client: "nordlys",
    supplierName: "QuickPay ApS",
    supplierCvr: "29827869",
    supplierAddress: "Søren Frichs Vej 39, 8230 Åbyhøj",
    invoiceNumber: "QP-2026-09-11873",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-01",
    currency: "DKK",
    lines: [
      { description: "Transaktionsgebyrer, 412 betalinger", quantity: 412, unitPriceOre: 25 },
      { description: "Abonnement QuickPay Professional", quantity: 1, unitPriceOre: 20940 },
    ],
    vatRate: 0,
    note: "Betalingsformidling er momsfri.",
  },
  {
    filename: "klaviyo-invoice-2026-09.pdf",
    client: "nordlys",
    supplierName: "Klaviyo, Inc.",
    supplierCvr: null,
    supplierVatId: "US EIN 46-2123479",
    supplierAddress: "125 Summer Street, Boston, MA 02110, USA",
    invoiceNumber: "KL-2026-0918-5521",
    invoiceDate: "2026-09-18",
    dueDate: "2026-09-18",
    currency: "USD",
    lines: [{ description: "Email plan – up to 1,500 profiles", quantity: 1, unitPriceOre: 4500 }],
    vatRate: 0,
    note: "Services supplied from outside the EU – reverse charge.",
  },
  {
    filename: "dao-faktura-771203.pdf",
    client: "nordlys",
    supplierName: "DAO A/S",
    supplierCvr: "15131117",
    supplierAddress: "Avedøreholmen 50, 2650 Hvidovre",
    invoiceNumber: "771203",
    invoiceDate: "2026-09-19",
    dueDate: "2026-10-03",
    currency: "DKK",
    lines: [{ description: "Pakkeshop-levering, 40 forsendelser", quantity: 40, unitPriceOre: 1960 }],
    vatRate: 25,
  },
  {
    filename: "kontorland-kvittering.pdf",
    client: "nordlys",
    supplierName: "Kontorland Esbjerg",
    supplierCvr: "27348823",
    supplierAddress: "Kongensgade 61, 6700 Esbjerg",
    invoiceNumber: "Bon 0042-118",
    invoiceDate: "2026-09-24",
    dueDate: null,
    currency: "DKK",
    lines: [
      { description: "Printerpapir A4, 5 pakker", quantity: 5, unitPriceOre: 4400 },
      { description: "Labelprinter-ruller, 4 stk.", quantity: 4, unitPriceOre: 3680 },
    ],
    vatRate: 25,
    kind: "receipt",
  },
  {
    filename: "adobe-creative-cloud-2026-09.pdf",
    client: "nordlys",
    supplierName: "Adobe Systems Software Ireland Ltd",
    supplierCvr: null,
    supplierVatId: "IE 6364992H",
    supplierAddress: "4-6 Riverwalk, Citywest Business Campus, Dublin 24, Irland",
    invoiceNumber: "IEE2026007718342",
    invoiceDate: "2026-09-10",
    dueDate: "2026-09-10",
    currency: "DKK",
    lines: [{ description: "Creative Cloud Photography plan", quantity: 1, unitPriceOre: 9900 }],
    vatRate: 0,
    note: "Omvendt betalingspligt.",
  },

  // ---------------- Kaffekompagniet IVS ----------------
  {
    filename: "roesterei-hamburg-rechnung-2026-4471.pdf",
    client: "kaffe",
    supplierName: "Rösterei Hamburg GmbH",
    supplierCvr: null,
    supplierVatId: "DE 298114775",
    supplierAddress: "Speicherstadt 12, 20457 Hamburg, Tyskland",
    invoiceNumber: "2026-4471",
    invoiceDate: "2026-09-04",
    dueDate: "2026-09-18",
    currency: "EUR",
    lines: [
      { description: "Rohkaffee Brasilien Santos, 60 kg", quantity: 60, unitPriceOre: 980 },
      { description: "Rohkaffee Äthiopien Sidamo, 30 kg", quantity: 30, unitPriceOre: 1450 },
    ],
    vatRate: 0,
    note: "Steuerfreie innergemeinschaftliche Lieferung – EU-køb af varer.",
  },
  {
    filename: "bring-faktura-2026-09.pdf",
    client: "kaffe",
    supplierName: "Bring Parcels A/S",
    supplierCvr: "31175968",
    supplierAddress: "Ventrupvej 6, 2670 Greve",
    invoiceNumber: "BR-55118802",
    invoiceDate: "2026-09-30",
    dueDate: "2026-10-15",
    currency: "DKK",
    lines: [{ description: "Pakker til erhverv, september (36 stk.)", quantity: 36, unitPriceOre: 3200 }],
    vatRate: 25,
  },
  {
    filename: "stripe-fees-2026-09.pdf",
    client: "kaffe",
    supplierName: "Stripe Payments Europe Ltd",
    supplierCvr: null,
    supplierVatId: "IE 3206488LH",
    supplierAddress: "1 Grand Canal Street Lower, Dublin 2, Irland",
    invoiceNumber: "STR-FEE-2026-09-889",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-01",
    currency: "DKK",
    lines: [{ description: "Card processing fees, September 2026", quantity: 1, unitPriceOre: 48765 }],
    vatRate: 0,
    note: "Momsfri finansiel ydelse.",
  },
  {
    filename: "canva-pro-2026-09.pdf",
    client: "kaffe",
    supplierName: "Canva Pty Ltd",
    supplierCvr: null,
    supplierVatId: "AU ABN 80 158 929 938",
    supplierAddress: "110 Kippax Street, Surry Hills NSW 2010, Australien",
    invoiceNumber: "04381-22917",
    invoiceDate: "2026-09-14",
    dueDate: "2026-09-14",
    currency: "DKK",
    lines: [{ description: "Canva Pro, månedligt", quantity: 1, unitPriceOre: 9900 }],
    vatRate: 0,
    note: "Ydelse fra land uden for EU – omvendt betalingspligt.",
  },
  {
    filename: "kaffeposer-dk-faktura-1882.pdf",
    client: "kaffe",
    supplierName: "Kaffeposer.dk ApS",
    supplierCvr: "38811042",
    supplierAddress: "Håndværkervej 3, 8600 Silkeborg",
    invoiceNumber: "1882",
    invoiceDate: "2026-09-09",
    dueDate: "2026-09-23",
    currency: "DKK",
    lines: [
      { description: "Kaffeposer m. ventil, 250 g, kraft, 1.000 stk.", quantity: 1000, unitPriceOre: 290 },
      { description: "Tryk af etiketter, 1.000 stk.", quantity: 1000, unitPriceOre: 85 },
    ],
    vatRate: 25,
  },
  {
    filename: "postnord-faktura-kaffe-2026-09.pdf",
    client: "kaffe",
    supplierName: "PostNord Danmark A/S",
    supplierCvr: "26663903",
    supplierAddress: "Hedegaardsvej 88, 2300 København S",
    invoiceNumber: "PN-7720016120",
    invoiceDate: "2026-09-30",
    dueDate: "2026-10-14",
    currency: "DKK",
    lines: [{ description: "Breve og småpakker, september", quantity: 1, unitPriceOre: 112000 }],
    vatRate: 25,
  },
  {
    filename: "apple-icloud-2026-09.pdf",
    client: "kaffe",
    supplierName: "Apple Distribution International Ltd",
    supplierCvr: null,
    supplierVatId: "IE 9700053D",
    supplierAddress: "Hollyhill Industrial Estate, Hollyhill, Cork, Irland",
    invoiceNumber: "MSC7Q1X9LZ",
    invoiceDate: "2026-09-21",
    dueDate: "2026-09-21",
    currency: "DKK",
    lines: [{ description: "iCloud+ 200 GB", quantity: 1, unitPriceOre: 3900 }],
    vatRate: 0,
    note: "Omvendt betalingspligt.",
  },
  {
    filename: "mobilepay-gebyrer-2026-09.pdf",
    client: "kaffe",
    supplierName: "Vipps MobilePay AS",
    supplierCvr: null,
    supplierVatId: "NO 918713867",
    supplierAddress: "Robert Levins gate 5, 0154 Oslo, Norge",
    invoiceNumber: "MP-2026-09-77120",
    invoiceDate: "2026-10-02",
    dueDate: "2026-10-02",
    currency: "DKK",
    lines: [{ description: "MobilePay MyShop transaktionsgebyrer, september", quantity: 1, unitPriceOre: 23450 }],
    vatRate: 0,
    note: "Betalingsgebyrer er momsfri.",
  },
  {
    filename: "dinero-abonnement-2026-q3.pdf",
    client: "kaffe",
    supplierName: "Dinero Regnskab ApS",
    supplierCvr: "32562392",
    supplierAddress: "Gothersgade 24, 1123 København K",
    invoiceNumber: "D-2026-118204",
    invoiceDate: "2026-09-01",
    dueDate: "2026-09-08",
    currency: "DKK",
    lines: [{ description: "Dinero Pro, kvartal 3", quantity: 3, unitPriceOre: 25000 }],
    vatRate: 25,
  },
  {
    filename: "dropbox-2026-09.pdf",
    client: "kaffe",
    supplierName: "Dropbox International Unlimited Company",
    supplierCvr: null,
    supplierVatId: "IE 9852817J",
    supplierAddress: "One Park Place, Hatch Street Upper, Dublin 2, Irland",
    invoiceNumber: "DBX-112993012",
    invoiceDate: "2026-09-27",
    dueDate: "2026-09-27",
    currency: "DKK",
    lines: [{ description: "Dropbox Plus, månedligt", quantity: 1, unitPriceOre: 9900 }],
    vatRate: 0,
    note: "Omvendt betalingspligt.",
  },
];

export function findSampleDocument(filename: string): SampleDocument | undefined {
  const base = filename.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  return SAMPLE_DOCUMENTS.find((d) => d.filename.toLowerCase() === base);
}
