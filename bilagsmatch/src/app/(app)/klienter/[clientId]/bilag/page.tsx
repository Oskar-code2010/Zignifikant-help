import type { Metadata } from "next";
import { pageData, requirePageContext } from "@/lib/auth/session";
import { listDocuments } from "@/lib/services/documents";
import { DocumentList } from "@/components/documents/document-list";

export const metadata: Metadata = { title: "Bilag" };

export default async function DocumentsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const ctx = await requirePageContext();
  const docs = await pageData(listDocuments(ctx, clientId));
  return (
    <DocumentList
      clientId={clientId}
      initial={docs.map((d) => ({
        id: d.id,
        originalFilename: d.originalFilename,
        status: d.status,
        errorMessage: d.errorMessage,
        supplierName: d.supplierName,
        invoiceDate: d.invoiceDate ? d.invoiceDate.toISOString() : null,
        totalAmountOre: d.totalAmountOre,
        currency: d.currency,
        matchStatus: d.matches.some((m) => m.status === "CONFIRMED")
          ? "CONFIRMED"
          : d.matches.length > 0
            ? "SUGGESTED"
            : null,
      }))}
    />
  );
}
