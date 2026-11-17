import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { pageData, requirePageContext } from "@/lib/auth/session";
import { listBankAccounts, listImports, listTransactions } from "@/lib/services/bank";
import { formatDate } from "@/lib/dates";
import { formatDKK, tryParseDanishAmount } from "@/lib/money";
import { BankImport } from "@/components/bank/bank-import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { TransactionStatusBadge, TX_STATUS_LABELS } from "@/components/common/status-badge";

export const metadata: Metadata = { title: "Bank" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function BankPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<SP>;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const ctx = await requirePageContext();
  const min = tryParseDanishAmount(one(sp.min) || null);
  const max = tryParseDanishAmount(one(sp.max) || null);
  const [accounts, imports, transactions] = await pageData(
    Promise.all([
      listBankAccounts(ctx, clientId),
      listImports(ctx, clientId),
      listTransactions(ctx, clientId, {
        from: one(sp.from) || undefined,
        to: one(sp.to) || undefined,
        status: one(sp.status) || undefined,
        q: one(sp.q) || undefined,
        minOre: min === null ? undefined : Math.abs(min),
        maxOre: max === null ? undefined : Math.abs(max),
      }),
    ]),
  );
  const hasFilter = ["from", "to", "status", "q", "min", "max"].some((k) => one(sp[k]) !== "");

  return (
    <div className="flex flex-col gap-5">
      <BankImport
        clientId={clientId}
        bankAccounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Bankposteringer</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="grid grid-cols-2 items-end gap-3 md:grid-cols-7" method="get">
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-from">Fra dato</Label>
              <Input id="f-from" name="from" type="date" defaultValue={one(sp.from)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-to">Til dato</Label>
              <Input id="f-to" name="to" type="date" defaultValue={one(sp.to)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-status">Status</Label>
              <Select id="f-status" name="status" defaultValue={one(sp.status)}>
                <option value="">Alle</option>
                {Object.entries(TX_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-min">Beløb fra</Label>
              <Input
                id="f-min"
                name="min"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={one(sp.min)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-max">Beløb til</Label>
              <Input
                id="f-max"
                name="max"
                inputMode="decimal"
                placeholder="10.000,00"
                defaultValue={one(sp.max)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="f-q">Søg i tekst</Label>
              <Input id="f-q" name="q" defaultValue={one(sp.q)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                Filtrér
              </Button>
              {hasFilter ? (
                <Button asChild variant="ghost">
                  <a href={`/klienter/${clientId}/bank`}>Nulstil</a>
                </Button>
              ) : null}
            </div>
          </form>

          {transactions.length === 0 ? (
            <EmptyState
              title={
                hasFilter ? "Ingen posteringer matcher filteret" : "Ingen bankposteringer endnu"
              }
              icon={<Landmark className="h-8 w-8" />}
            >
              {hasFilter
                ? "Prøv at ændre eller nulstille filteret."
                : "Importér et bankudtog som CSV ovenfor for at komme i gang."}
            </EmptyState>
          ) : (
            <Table data-testid="transactions-table">
              <THead>
                <TR>
                  <TH>Dato</TH>
                  <TH>Tekst</TH>
                  <TH>Konto</TH>
                  <TH className="text-right">Beløb</TH>
                  <TH className="text-right">Saldo</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {transactions.map((t) => (
                  <TR key={t.id}>
                    <TD className="tabular whitespace-nowrap">{formatDate(t.bookingDate)}</TD>
                    <TD>{t.text}</TD>
                    <TD className="text-muted-foreground">{t.bankAccount.name}</TD>
                    <TD
                      className={`tabular whitespace-nowrap text-right ${t.amountOre < 0 ? "" : "text-success"}`}
                    >
                      {formatDKK(t.amountOre)}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right text-muted-foreground">
                      {t.balanceOre === null ? "" : formatDKK(t.balanceOre)}
                    </TD>
                    <TD>
                      <TransactionStatusBadge status={t.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
          {transactions.length === 1000 ? (
            <p className="text-sm text-muted-foreground">
              Viser de første 1.000 posteringer. Brug filteret for at indsnævre.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {imports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Seneste importer</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Fil</TH>
                  <TH>Format</TH>
                  <TH>Importeret</TH>
                  <TH className="text-right">Nye</TH>
                  <TH className="text-right">Dubletter</TH>
                  <TH className="text-right">Fejl</TH>
                </TR>
              </THead>
              <TBody>
                {imports.map((i) => (
                  <TR key={i.id}>
                    <TD>{i.filename}</TD>
                    <TD className="text-muted-foreground">{i.detectedFormat}</TD>
                    <TD className="tabular">{formatDate(i.importedAt)}</TD>
                    <TD className="tabular text-right">{i.importedCount}</TD>
                    <TD className="tabular text-right">{i.duplicateCount}</TD>
                    <TD className="tabular text-right">{i.failedCount}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
