"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DocumentStatusBadge } from "@/components/common/status-badge";
import { DocumentUploader } from "./document-uploader";
import { formatDKK } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export interface DocRow {
  id: string;
  originalFilename: string;
  status: string;
  errorMessage: string | null;
  supplierName: string | null;
  invoiceDate: string | null;
  totalAmountOre: number | null;
  currency: string | null;
  matchStatus: "CONFIRMED" | "SUGGESTED" | null;
}

export function DocumentList({ clientId, initial }: { clientId: string; initial: DocRow[] }) {
  const [docs, setDocs] = useState<DocRow[]>(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/documents`, { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as { documents: DocRow[] };
        setDocs(body.documents);
      }
    } catch {
      // Network hiccup: the next poll will try again.
    }
  }, [clientId]);

  const pending = docs.some((d) => d.status === "UPLOADED" || d.status === "EXTRACTING");

  // Poll while any document is queued or being extracted.
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [pending, refresh]);

  return (
    <div className="flex flex-col gap-5">
      <DocumentUploader clientId={clientId} onUploaded={() => void refresh()} />
      {docs.length === 0 ? (
        <EmptyState title="Ingen bilag endnu" icon={<FileText className="h-8 w-8" />}>
          Upload fakturaer og kvitteringer ovenfor. De bliver aflæst automatisk, så du kan afstemme
          dem mod banken.
        </EmptyState>
      ) : (
        <Card>
          <Table data-testid="documents-table">
            <THead>
              <TR>
                <TH>Fil</TH>
                <TH>Leverandør</TH>
                <TH>Fakturadato</TH>
                <TH className="text-right">Beløb</TH>
                <TH>Status</TH>
                <TH>Afstemning</TH>
              </TR>
            </THead>
            <TBody>
              {docs.map((d) => (
                <TR key={d.id} className="hover:bg-muted/50">
                  <TD className="max-w-xs">
                    <Link
                      href={`/klienter/${clientId}/bilag/${d.id}`}
                      className="block truncate font-medium text-primary hover:underline"
                    >
                      {d.originalFilename}
                    </Link>
                    {d.status === "FAILED" && d.errorMessage ? (
                      <p className="truncate text-xs text-danger">{d.errorMessage}</p>
                    ) : null}
                  </TD>
                  <TD>{d.supplierName ?? <span className="text-muted-foreground">–</span>}</TD>
                  <TD className="tabular">
                    {d.invoiceDate ? formatDate(new Date(d.invoiceDate)) : "–"}
                  </TD>
                  <TD className="tabular whitespace-nowrap text-right">
                    {d.totalAmountOre === null
                      ? "–"
                      : d.currency && d.currency !== "DKK"
                        ? `${formatDKK(d.totalAmountOre).replace(" kr.", "")} ${d.currency}`
                        : formatDKK(d.totalAmountOre)}
                  </TD>
                  <TD>
                    <DocumentStatusBadge status={d.status} />
                  </TD>
                  <TD>
                    {d.matchStatus === "CONFIRMED" ? (
                      <Badge variant="success">Afstemt</Badge>
                    ) : d.matchStatus === "SUGGESTED" ? (
                      <Badge variant="warning">Forslag</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
