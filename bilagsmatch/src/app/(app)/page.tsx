import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FileText, Landmark, ListChecks, Download } from "lucide-react";
import { requirePageContext } from "@/lib/auth/session";
import { dashboardOverview } from "@/lib/services/dashboard";
import { formatDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Overblik" };

function Stat({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof FileText }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className="rounded-md bg-accent p-2 text-primary">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="tabular text-2xl font-semibold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const ctx = await requirePageContext();
  const rows = await dashboardOverview(ctx);
  const sum = (k: "unmatchedDocuments" | "unmatchedTransactions" | "awaitingReview") => rows.reduce((s, r) => s + r[k], 0);
  const lastExport = rows.map((r) => r.lastExportAt).filter((d): d is Date => d !== null).sort((a, b) => +b - +a)[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Overblik</h1>
        <p className="text-sm text-muted-foreground">Status på tværs af alle klienter.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Bilag uden match" value={sum("unmatchedDocuments")} icon={FileText} />
        <Stat label="Bankposter uden bilag" value={sum("unmatchedTransactions")} icon={Landmark} />
        <Stat label="Forslag til gennemsyn" value={sum("awaitingReview")} icon={ListChecks} />
        <Stat label="Seneste eksport" value={lastExport ? formatDate(lastExport) : "–"} icon={Download} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Klienter</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState title="Ingen klienter endnu" icon={<Building2 className="h-8 w-8" />}>
              <p>Opret en klient for at komme i gang.</p>
              <Button asChild className="mt-3">
                <Link href="/klienter">Gå til klienter</Link>
              </Button>
            </EmptyState>
          ) : (
            <Table data-testid="dashboard-table">
              <THead>
                <TR>
                  <TH>Klient</TH>
                  <TH className="text-right">Bilag uden match</TH>
                  <TH className="text-right">Bankposter uden bilag</TH>
                  <TH className="text-right">Forslag</TH>
                  <TH className="text-right">Fejlede bilag</TH>
                  <TH>Seneste eksport</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id} className="hover:bg-muted/50">
                    <TD>
                      <Link href={`/klienter/${r.id}/afstemning`} className="font-medium text-primary hover:underline">
                        {r.name}
                      </Link>
                    </TD>
                    <TD className="tabular text-right">{r.unmatchedDocuments}</TD>
                    <TD className="tabular text-right">{r.unmatchedTransactions}</TD>
                    <TD className="tabular text-right">{r.awaitingReview}</TD>
                    <TD className={`tabular text-right ${r.failedDocuments > 0 ? "text-danger" : ""}`}>{r.failedDocuments}</TD>
                    <TD className="tabular">{r.lastExportAt ? formatDate(r.lastExportAt) : "–"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
