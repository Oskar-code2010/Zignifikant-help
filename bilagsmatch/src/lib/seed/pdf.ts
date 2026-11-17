import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDanishNumber } from "@/lib/money";
import { formatDate, parseDateWithFormat } from "@/lib/dates";
import { totals, type SampleDocument } from "./sample-documents";

export interface Buyer {
  name: string;
  cvr: string;
  address: string;
}

const FIXED_DATE = new Date(Date.UTC(2026, 9, 31, 12, 0, 0));

function money(ore: number, currency: string): string {
  return currency === "DKK"
    ? `${formatDanishNumber(ore)} kr.`
    : `${currency} ${formatDanishNumber(ore)}`;
}

function iso(d: string | null): string {
  return d ? formatDate(parseDateWithFormat(d, "yyyy-mm-dd")) : "";
}

/** Render a synthetic Danish-style invoice, credit note or till receipt as a real PDF. */
export async function renderSamplePdf(doc: SampleDocument, buyer: Buyer): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.supplierName} ${doc.invoiceNumber}`);
  pdf.setAuthor(doc.supplierName);
  pdf.setProducer("Bilagsmatch demo-generator");
  pdf.setCreator("Bilagsmatch");
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const t = totals(doc);
  if (doc.kind === "receipt") renderReceipt(pdf.addPage([300, 520]), doc, t, regular, bold);
  else renderInvoice(pdf.addPage([595, 842]), doc, buyer, t, regular, bold);
  return pdf.save({ useObjectStreams: false });
}

type Totals = ReturnType<typeof totals>;

function renderInvoice(
  page: PDFPage,
  doc: SampleDocument,
  buyer: Buyer,
  t: Totals,
  regular: PDFFont,
  bold: PDFFont,
) {
  const ink = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.4, 0.43, 0.5);
  const accent = rgb(0.12, 0.23, 0.54);
  const text = (s: string, x: number, y: number, size = 10, font = regular, color = ink) =>
    page.drawText(s, { x, y, size, font, color });
  const right = (s: string, xRight: number, y: number, size = 10, font = regular, color = ink) =>
    text(s, xRight - font.widthOfTextAtSize(s, size), y, size, font, color);

  page.drawRectangle({ x: 0, y: 802, width: 595, height: 40, color: accent });
  text(doc.supplierName, 40, 816, 16, bold, rgb(1, 1, 1));
  text(doc.supplierAddress, 40, 784, 9, regular, muted);
  text(
    doc.supplierCvr ? `CVR-nr. ${doc.supplierCvr}` : `Momsnr. ${doc.supplierVatId ?? ""}`,
    40,
    771,
    9,
    regular,
    muted,
  );

  const title = doc.isCreditNote ? "KREDITNOTA" : "FAKTURA";
  right(title, 555, 760, 20, bold, accent);
  const meta: [string, string][] = [
    [doc.isCreditNote ? "Kreditnotanr." : "Fakturanr.", doc.invoiceNumber],
    [doc.isCreditNote ? "Dato" : "Fakturadato", iso(doc.invoiceDate)],
  ];
  if (doc.dueDate) meta.push(["Forfaldsdato", iso(doc.dueDate)]);
  meta.push(["Valuta", doc.currency]);
  meta.forEach(([k, v], i) => {
    text(k, 380, 730 - i * 15, 9, regular, muted);
    right(v, 555, 730 - i * 15, 10, bold);
  });

  text("Faktureres til", 40, 730, 9, regular, muted);
  text(buyer.name, 40, 716, 11, bold);
  text(buyer.address, 40, 702, 9);
  text(`CVR-nr. ${buyer.cvr}`, 40, 689, 9);

  let y = 630;
  page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 20, color: rgb(0.94, 0.95, 0.97) });
  text("Beskrivelse", 46, y, 9, bold);
  right("Antal", 360, y, 9, bold);
  right("Enhedspris", 450, y, 9, bold);
  right("Beløb", 549, y, 9, bold);
  y -= 22;
  const sign = doc.isCreditNote ? -1 : 1;
  for (const l of doc.lines) {
    const lineTotal = sign * Math.round(l.quantity * l.unitPriceOre);
    text(l.description.slice(0, 60), 46, y, 9);
    right(String(l.quantity).replace(".", ","), 360, y, 9);
    right(formatDanishNumber(l.unitPriceOre), 450, y, 9);
    right(formatDanishNumber(lineTotal), 549, y, 9);
    y -= 16;
  }
  page.drawLine({
    start: { x: 300, y: y + 4 },
    end: { x: 555, y: y + 4 },
    thickness: 0.5,
    color: muted,
  });
  y -= 14;
  const vatLabel = doc.vatRate === 25 ? "Moms 25 %" : "Moms 0 %";
  const rows: [string, string, boolean][] = [
    ["Subtotal ekskl. moms", money(t.netOre, doc.currency), false],
    [vatLabel, money(t.vatOre, doc.currency), false],
    ["I alt", money(t.totalOre, doc.currency), true],
  ];
  for (const [k, v, strong] of rows) {
    text(k, 330, y, strong ? 11 : 10, strong ? bold : regular);
    right(v, 549, y, strong ? 11 : 10, strong ? bold : regular);
    y -= strong ? 20 : 16;
  }

  if (doc.note) {
    text(doc.note, 40, y - 20, 9, regular, muted);
  }
  const footerY = 80;
  page.drawLine({
    start: { x: 40, y: footerY + 18 },
    end: { x: 555, y: footerY + 18 },
    thickness: 0.5,
    color: muted,
  });
  if (doc.isCreditNote) {
    text("Beløbet krediteres og udbetales til jeres bankkonto.", 40, footerY, 9, regular, muted);
  } else if (doc.currency === "DKK" && doc.supplierCvr) {
    text(
      `Betales senest ${iso(doc.dueDate ?? doc.invoiceDate)} til reg.nr. 9070 kontonr. 1234567. Angiv fakturanr. ${doc.invoiceNumber}.`,
      40,
      footerY,
      9,
      regular,
      muted,
    );
  } else {
    text("Betalt med kort. Tak for jeres køb.", 40, footerY, 9, regular, muted);
  }
  text(
    "Syntetisk demobilag genereret af Bilagsmatch – ikke en rigtig faktura.",
    40,
    footerY - 14,
    7,
    regular,
    muted,
  );
}

function renderReceipt(
  page: PDFPage,
  doc: SampleDocument,
  t: Totals,
  regular: PDFFont,
  bold: PDFFont,
) {
  const ink = rgb(0.1, 0.1, 0.1);
  const center = (s: string, y: number, size = 9, font = regular) =>
    page.drawText(s, { x: (300 - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color: ink });
  const row = (l: string, r: string, y: number, font = regular, size = 9) => {
    page.drawText(l, { x: 20, y, size, font, color: ink });
    page.drawText(r, { x: 280 - font.widthOfTextAtSize(r, size), y, size, font, color: ink });
  };
  let y = 490;
  center(doc.supplierName, y, 12, bold);
  y -= 15;
  center(doc.supplierAddress, y, 7);
  y -= 12;
  if (doc.supplierCvr) center(`CVR ${doc.supplierCvr}`, y, 8);
  y -= 22;
  center("KVITTERING", y, 11, bold);
  y -= 16;
  row(`Bon: ${doc.invoiceNumber}`, iso(doc.invoiceDate), y, regular, 8);
  y -= 20;
  for (const l of doc.lines) {
    const amount = Math.round(l.quantity * l.unitPriceOre * (1 + doc.vatRate / 100));
    row(`${l.quantity} x ${l.description}`.slice(0, 40), formatDanishNumber(amount), y);
    y -= 14;
  }
  y -= 6;
  page.drawLine({
    start: { x: 20, y: y + 8 },
    end: { x: 280, y: y + 8 },
    thickness: 0.5,
    color: ink,
  });
  row("I ALT DKK", formatDanishNumber(t.totalOre), y - 4, bold, 11);
  y -= 22;
  row("Heraf moms 25 %", formatDanishNumber(t.vatOre), y, regular, 8);
  y -= 12;
  row("Netto", formatDanishNumber(t.netOre), y, regular, 8);
  y -= 22;
  row("Betalt med", "Visa/Dankort", y, regular, 8);
  y -= 30;
  center("Tak for besøget", y, 9);
  center("Syntetisk demobilag – ikke en rigtig kvittering.", 30, 6);
}
