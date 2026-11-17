/**
 * Deterministic demo bank statements (~60 lines per client) with the tricky cases the demo needs:
 * identical amounts, foreign currency, late payment, transaction without receipt, receipt without
 * transaction (Kontorland), credit note refund and an internal transfer.
 */
import { formatDanishNumber, formatExportAmount } from "@/lib/money";
import { addDays, formatDate, makeDate, toIsoDate } from "@/lib/dates";
import type { ClientKey } from "./sample-documents";

export interface DemoTx {
  date: string; // YYYY-MM-DD
  text: string;
  amountOre: number;
}

const NORDLYS: DemoTx[] = [
  // Matched to sample documents
  { date: "2026-09-02", text: "Visa/Dankort SHOPIFY* 447120391", amountOre: -53821 }, // USD 79,00 ≈ 1,3 % under reference rate
  { date: "2026-10-01", text: "GOOGLE *ADS4121189921", amountOre: -425000 },
  { date: "2026-09-16", text: "FACEBK *ADS 82JKQ9", amountOre: -218050 },
  { date: "2026-10-14", text: "GLS DENMARK A/S FAKTURA 90881234", amountOre: -187500 }, // paid 18 days after due date
  { date: "2026-10-14", text: "PostNord Danmark A/S", amountOre: -234000 },
  { date: "2026-09-08", text: "POSTNORD PORTO", amountOre: -8995 }, // identical amount #1
  { date: "2026-09-22", text: "POSTNORD PORTO", amountOre: -8995 }, // identical amount #2
  { date: "2026-10-17", text: "Betaling Emballagehuset Vest fakt. 2026-118", amountOre: -378125 }, // 30 days after due date
  { date: "2026-10-06", text: "Emballagehuset Vest A/S kreditnota", amountOre: 50000 }, // credit note refund
  { date: "2026-09-05", text: "MSFT * E0400SB2KQ", amountOre: -39400 },
  { date: "2026-10-01", text: "QUICKPAY GEBYRER SEPT", amountOre: -31240 },
  { date: "2026-09-18", text: "KLAVIYO INC. USD 45,00", amountOre: -30987 }, // foreign amount in bank text
  { date: "2026-10-02", text: "DAO A/S", amountOre: -98000 },
  { date: "2026-09-10", text: "ADOBE *CREATIVE CLD", amountOre: -9900 },
  // Without receipt / special
  { date: "2026-09-12", text: "Dankort-køb Bauhaus Esbjerg", amountOre: -124900 }, // missing receipt
  { date: "2026-10-01", text: "Overførsel til opsparingskonto", amountOre: -2000000 }, // internal transfer
  { date: "2026-09-01", text: "Husleje september – Lagerhotellet", amountOre: -650000 },
  { date: "2026-10-01", text: "Husleje oktober – Lagerhotellet", amountOre: -650000 },
  { date: "2026-09-30", text: "Løn september", amountOre: -1850000 },
  { date: "2026-10-30", text: "Løn oktober", amountOre: -1850000 },
  { date: "2026-09-30", text: "Gebyr kontoudskrift", amountOre: -2500 },
  { date: "2026-10-30", text: "Gebyr kontoudskrift", amountOre: -2500 },
  { date: "2026-09-25", text: "Dankort-køb Q8 Esbjerg", amountOre: -45210 },
  { date: "2026-10-20", text: "MobilePay: Kaffe til lageret", amountOre: -8700 },
];

const KAFFE: DemoTx[] = [
  { date: "2026-09-18", text: "ROESTEREI HAMBURG GMBH EUR 1023,00 KURS 7,4612", amountOre: -763281 }, // EUR invoice
  { date: "2026-10-13", text: "BRING PARCELS A/S", amountOre: -144000 },
  { date: "2026-10-01", text: "STRIPE FEES", amountOre: -48765 },
  { date: "2026-09-14", text: "CANVA* 04381-22917", amountOre: -9900 }, // same amount as Dropbox
  { date: "2026-09-27", text: "DROPBOX*SUBSCRIPTION", amountOre: -9900 },
  { date: "2026-09-22", text: "Kaffeposer.dk ApS faktura 1882", amountOre: -468750 },
  { date: "2026-10-14", text: "PostNord Danmark A/S", amountOre: -140000 },
  { date: "2026-09-21", text: "APPLE.COM/BILL", amountOre: -3900 },
  { date: "2026-10-02", text: "MobilePay MyShop gebyr", amountOre: -23450 },
  { date: "2026-09-08", text: "Dinero Regnskab ApS", amountOre: -93750 },
  { date: "2026-09-03", text: "Dankort-køb Netto Aarhus C", amountOre: -18735 }, // missing receipt
  { date: "2026-09-15", text: "Overførsel fra Lars privat", amountOre: 1000000 }, // owner deposit
  { date: "2026-10-05", text: "Overførsel til skattekonto", amountOre: -1200000 }, // internal transfer
  { date: "2026-09-01", text: "Husleje september – Ristehallen", amountOre: -480000 },
  { date: "2026-10-01", text: "Husleje oktober – Ristehallen", amountOre: -480000 },
  { date: "2026-09-30", text: "Gebyr Nordea", amountOre: -3500 },
  { date: "2026-10-30", text: "Gebyr Nordea", amountOre: -3500 },
  { date: "2026-10-09", text: "Dankort-køb Silvan Aarhus", amountOre: -64900 }, // missing receipt
];

/** Regular incoming payouts (webshop sales) every few days, deterministic amounts. */
function payouts(start: string, count: number, everyDays: number, label: string, base: number): DemoTx[] {
  const [y, m, d] = start.split("-").map(Number);
  const first = makeDate(y!, m!, d!)!;
  return Array.from({ length: count }, (_, i) => ({
    date: toIsoDate(addDays(first, i * everyDays)),
    text: label,
    amountOre: base + ((i * 7919) % 900) * 1000 + ((i * 37) % 100),
  }));
}

export function demoTransactions(client: ClientKey): DemoTx[] {
  const rows =
    client === "nordlys"
      ? [
          ...NORDLYS,
          ...payouts("2026-09-03", 26, 2, "SHOPIFY PAYMENTS UDBETALING", 350000),
          ...payouts("2026-09-07", 10, 5, "MobilePay overførsel – webshopsalg", 120000),
        ]
      : [
          ...KAFFE,
          ...payouts("2026-09-02", 26, 2, "STRIPE PAYOUT", 180000),
          ...payouts("2026-09-04", 16, 4, "MobilePay MyShop udbetaling", 60000),
        ];
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.text < b.text ? -1 : 1));
}

function withBalances(rows: DemoTx[], openingOre: number): { row: DemoTx; balance: number }[] {
  let bal = openingOre;
  return rows.map((row) => {
    bal += row.amountOre;
    return { row, balance: bal };
  });
}

const dmy = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number);
  return formatDate(makeDate(y!, m!, d!));
};

/** Danske Bank style: quoted, ";" separated, dd.mm.yyyy, 1.234,56, status columns. */
export function danskeBankStyleCsv(rows: DemoTx[], openingOre: number): string {
  const lines = ['"Dato";"Tekst";"Beløb";"Saldo";"Status";"Afstemt"'];
  for (const { row, balance } of withBalances(rows, openingOre)) {
    lines.push(
      [dmy(row.date).replace(/-/g, "."), row.text, formatDanishNumber(row.amountOre), formatDanishNumber(balance), "Udført", "Nej"]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(";"),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

/** Nordea style: UTF-8 BOM, yyyy-mm-dd, -1234,56, Navn + Beskrivelse columns. */
export function nordeaStyleCsv(rows: DemoTx[], openingOre: number): string {
  const lines = ["Bogføringsdato;Beløb;Afsender;Modtager;Navn;Beskrivelse;Saldo;Valuta"];
  for (const { row, balance } of withBalances(rows, openingOre)) {
    lines.push([row.date, formatExportAmount(row.amountOre), "", "", "", row.text, formatExportAmount(balance), "DKK"].join(";"));
  }
  return "﻿" + lines.join("\n") + "\n";
}

export function demoBankCsv(client: ClientKey): { filename: string; content: string } {
  const rows = demoTransactions(client);
  return client === "nordlys"
    ? { filename: "nordlys-danske-bank-sep-okt-2026.csv", content: danskeBankStyleCsv(rows, 4520000) }
    : { filename: "kaffekompagniet-nordea-sep-okt-2026.csv", content: nordeaStyleCsv(rows, 2875000) };
}
