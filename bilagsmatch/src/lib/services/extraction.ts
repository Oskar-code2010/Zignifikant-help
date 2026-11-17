import { forOrg } from "@/lib/db/scoped";
import { getStorage } from "@/lib/storage";
import { getExtractionProvider, ExtractionError, type ExtractionProvider } from "@/lib/extraction";
import { sanityCheck } from "@/lib/extraction/sanity";
import { fromIsoDate } from "@/lib/dates";
import { normalizeCvr } from "@/lib/cvr";
import type { Prisma } from "@prisma/client";

export type ExtractionOutcome = {
  status: "EXTRACTED" | "FAILED";
  retryable: boolean;
  error?: string;
};

/**
 * Run extraction for one document and persist the result. Never throws for provider errors:
 * the document is marked FAILED with a readable Danish message instead.
 */
export async function extractDocument(
  organizationId: string,
  documentId: string,
  opts: { provider?: ExtractionProvider; finalAttempt?: boolean } = {},
): Promise<ExtractionOutcome> {
  const db = forOrg(organizationId);
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return { status: "FAILED", retryable: false, error: "Dokumentet findes ikke længere." };

  await db.document.update({
    where: { id: doc.id },
    data: { status: "EXTRACTING", errorMessage: null },
  });
  const provider = opts.provider ?? getExtractionProvider();
  try {
    const bytes = await getStorage().get(doc.storagePath);
    const r = await provider.extract({
      bytes,
      mimeType: doc.mimeType,
      filename: doc.originalFilename,
    });
    const warnings = sanityCheck(r);
    const cvr = r.supplierCvr ? normalizeCvr(r.supplierCvr) : null;
    await db.document.update({
      where: { id: doc.id },
      data: {
        status: "EXTRACTED",
        errorMessage: null,
        supplierName: r.supplierName,
        supplierCvr: cvr && /^\d{8}$/.test(cvr) ? cvr : null,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: fromIsoDate(r.invoiceDate),
        dueDate: fromIsoDate(r.dueDate),
        totalAmountOre: r.totalAmountOre,
        vatAmountOre: r.vatAmountOre,
        netAmountOre: r.netAmountOre,
        currency: r.currency ?? "DKK",
        description: r.description,
        isCreditNote: r.isCreditNote || (r.totalAmountOre !== null && r.totalAmountOre < 0),
        extractionConfidence: r.confidence,
        extractionWarnings: warnings,
        rawExtractionJson: r as unknown as Prisma.InputJsonValue,
        extractedBy: provider.name,
      },
    });
    return { status: "EXTRACTED", retryable: false };
  } catch (err) {
    const e =
      err instanceof ExtractionError
        ? err
        : new ExtractionError(
            "Dokumentet kunne ikke aflæses. Prøv igen, eller udfyld felterne manuelt.",
          );
    // While retries remain, keep the document in the queue state instead of FAILED.
    const willRetry = e.retryable && !opts.finalAttempt;
    await db.document.update({
      where: { id: doc.id },
      data: willRetry
        ? { status: "UPLOADED", errorMessage: `${e.message} (prøver igen automatisk)` }
        : { status: "FAILED", errorMessage: e.message },
    });
    return { status: "FAILED", retryable: e.retryable, error: e.message };
  }
}
