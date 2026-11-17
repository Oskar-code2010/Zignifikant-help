import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { pageData, requirePageContext } from "@/lib/auth/session";
import { missingReceipts } from "@/lib/services/export";
import { formatDate } from "@/lib/dates";
import { formatDKK } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { TransactionStatusBadge } from "@/components/common/status-badge";
import { CopyButton } from "@/components/common/copy-button";

export const metadata: Metadata = { title: "Mangler bilag" };

export default async function MissingPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const ctx = await requirePageContext();
  const { transactions, totalOre, email } = await pageData(missingReceipts(ctx, clientId));
  if (transactions.length === 0) {
    return (
      <EmptyState title="Ingen udgifter mangler bilag" icon={<CheckCircle2 className="h-8 w-8" />}>
        Alle udgående bankposteringer er enten afstemt eller ignoreret.
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Udgifter uden bilag</CardTitle>
          <CardDescription>
            {transactions.length} posteringer · i alt <span className="tabular">{formatDKK(totalOre)}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table data-testid="missing-table">
            <THead>
              <TR>
                <TH>Dato</TH>
                <TH>Tekst</TH>
                <TH className="text-right">Beløb</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {transactions.map((t) => (
                <TR key={t.id}>
                  <TD className="tabular">{formatDate(t.bookingDate)}</TD>
                  <TD>{t.text}</TD>
                  <TD className="tabular whitespace-nowrap text-right">{formatDKK(t.amountOre)}</TD>
                  <TD>
                    <TransactionStatusBadge status={t.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Spørg kunden</CardTitle>
            <CardDescription>Klar til at kopiere ind i en e-mail.</CardDescription>
          </div>
          <CopyButton text={email} label="Kopiér e-mail" />
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-sans text-sm" data-testid="missing-email">
            {email}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
