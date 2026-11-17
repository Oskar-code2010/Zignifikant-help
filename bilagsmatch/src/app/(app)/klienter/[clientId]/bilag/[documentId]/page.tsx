import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getDocument } from "@/lib/services/documents";
import { HttpError } from "@/lib/api/errors";
import { toIsoDate } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentStatusBadge } from "@/components/common/status-badge";
import { DocumentEditor } from "@/components/documents/document-editor";
import { DocumentPreview } from "@/components/documents/document-preview";
import { AutoRefresh } from "@/components/common/auto-refresh";

export const metadata: Metadata = { title: "Bilag" };

export default async function DocumentPage({ params }: { params: Promise<{ clientId: string; documentId: string }> }) {
  const { clientId, documentId } = await params;
  const ctx = await requireSessionContext();
  let doc;
  try {
    doc = await getDocument(ctx, documentId);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  if (doc.clientId !== clientId) notFound();
  const warnings = Array.isArray(doc.extractionWarnings) ? (doc.extractionWarnings as string[]) : [];
  const busy = doc.status === "UPLOADED" || doc.status === "EXTRACTING";

  return (
    <div className="flex flex-col gap-4">
      {busy ? <AutoRefresh intervalMs={1500} /> : null}
      <div className="flex items-center gap-3">
        <Link href={`/klienter/${clientId}/bilag`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Alle bilag
        </Link>
        <h2 className="truncate text-lg font-semibold">{doc.originalFilename}</h2>
        <DocumentStatusBadge status={doc.status} />
        {doc.extractionConfidence !== null ? (
          <span className="text-sm text-muted-foreground">Sikkerhed {doc.extractionConfidence} %</span>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="p-3">
          <DocumentPreview id={doc.id} mimeType={doc.mimeType} title={doc.originalFilename} />
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Aflæste oplysninger</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {doc.status === "FAILED" && doc.errorMessage ? (
              <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
                {doc.errorMessage}
              </p>
            ) : null}
            {busy ? (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Bilaget aflæses – felterne udfyldes om et øjeblik.</p>
            ) : null}
            {warnings.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md bg-warning-soft p-3 text-sm text-warning">
                {warnings.map((w) => (
                  <li key={w} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
                  </li>
                ))}
              </ul>
            ) : null}
            <DocumentEditor
              key={doc.updatedAt.toISOString()}
              doc={{
                id: doc.id,
                clientId,
                status: doc.status,
                supplierName: doc.supplierName,
                supplierCvr: doc.supplierCvr,
                invoiceNumber: doc.invoiceNumber,
                invoiceDate: toIsoDate(doc.invoiceDate),
                dueDate: toIsoDate(doc.dueDate),
                totalAmountOre: doc.totalAmountOre,
                vatAmountOre: doc.vatAmountOre,
                netAmountOre: doc.netAmountOre,
                currency: doc.currency,
                description: doc.description,
                isCreditNote: doc.isCreditNote,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
