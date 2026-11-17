import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { listDocuments, uploadDocument } from "@/lib/services/documents";

type P = { clientId: string };

export const GET = authed<P>(async (ctx, _req, { clientId }) => {
  const docs = await listDocuments(ctx, clientId);
  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      originalFilename: d.originalFilename,
      status: d.status,
      errorMessage: d.errorMessage,
      supplierName: d.supplierName,
      invoiceDate: d.invoiceDate,
      totalAmountOre: d.totalAmountOre,
      currency: d.currency,
      matchStatus: d.matches.some((m) => m.status === "CONFIRMED")
        ? "CONFIRMED"
        : d.matches.length > 0
          ? "SUGGESTED"
          : null,
    })),
  });
});

export const POST = authed<P>(async (ctx, req, { clientId }) => {
  const { document, duplicate } = await uploadDocument(ctx, clientId, await req.formData());
  if (duplicate) {
    // Same content already uploaded for this client: idempotent, nothing new is stored.
    return NextResponse.json({
      duplicate: true,
      document: { id: document.id, status: document.status },
      message: `Filen er allerede uploadet som "${document.originalFilename}".`,
    });
  }
  return NextResponse.json({ duplicate: false, document: { id: document.id, status: document.status } }, { status: 201 });
});
