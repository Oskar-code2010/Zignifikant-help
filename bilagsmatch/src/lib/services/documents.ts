import { createHash } from "node:crypto";
import { z } from "zod";
import type { SessionContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { getStorage } from "@/lib/storage";
import { cleanFilename, detectMimeType, EXTENSION_FOR, MAX_UPLOAD_BYTES } from "@/lib/files/validate";
import { enqueueExtraction } from "@/lib/jobs/queue";
import { sanityCheck } from "@/lib/extraction/sanity";
import { fromIsoDate, toIsoDate } from "@/lib/dates";
import { IdSchema, IsoDateSchema, OreSchema } from "@/lib/validation/schemas";
import { isValidCvr, normalizeCvr } from "@/lib/cvr";
import { getClient } from "./clients";

export async function uploadDocument(ctx: SessionContext, clientId: string, form: FormData) {
  await getClient(ctx, clientId);
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Vælg en fil at uploade.");
  if (file.size === 0) throw badRequest("Filen er tom.");
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Filen er for stor (maks. 20 MB).");
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = detectMimeType(bytes);
  if (!mime) throw badRequest("Filtypen understøttes ikke. Upload PDF, JPG eller PNG.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await ctx.db.document.findFirst({ where: { clientId, sha256 } });
  if (existing) {
    throw conflict(`Filen er allerede uploadet som "${existing.originalFilename}".`, {
      duplicateOf: existing.id,
    });
  }

  const storage = getStorage();
  const storagePath = await storage.put({
    organizationId: ctx.organizationId,
    clientId,
    extension: EXTENSION_FOR[mime],
    bytes,
  });
  try {
    const doc = await ctx.db.$transaction(async (tx) => {
      const d = await tx.document.create({
        data: {
          organizationId: ctx.organizationId,
          clientId,
          originalFilename: cleanFilename(file.name),
          storagePath,
          mimeType: mime,
          sizeBytes: bytes.length,
          sha256,
          status: "UPLOADED",
        },
      });
      await enqueueExtraction(tx, ctx.organizationId, d.id);
      return d;
    });
    await audit(ctx.db, ctx, "document.upload", "Document", doc.id);
    return doc;
  } catch (err) {
    await storage.delete(storagePath);
    throw err;
  }
}

export async function listDocuments(ctx: SessionContext, clientId: string) {
  await getClient(ctx, clientId);
  return ctx.db.document.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: {
      matches: { where: { status: { in: ["SUGGESTED", "CONFIRMED"] } }, select: { status: true } },
    },
  });
}

export async function getDocument(ctx: SessionContext, id: string) {
  if (!IdSchema.safeParse(id).success) throw notFound("Bilaget");
  const doc = await ctx.db.document.findUnique({
    where: { id },
    include: { client: { select: { id: true, name: true } } },
  });
  if (!doc) throw notFound("Bilaget");
  return doc;
}

export async function getDocumentFile(ctx: SessionContext, id: string) {
  const doc = await getDocument(ctx, id);
  const bytes = await getStorage().get(doc.storagePath);
  return { doc, bytes };
}

const NullableString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable();

export const DocumentUpdateSchema = z
  .object({
    supplierName: NullableString(200),
    supplierCvr: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidCvr(v), "CVR-nummer skal være 8 cifre")
      .transform((v) => (v === "" ? null : normalizeCvr(v)))
      .nullable(),
    invoiceNumber: NullableString(100),
    invoiceDate: IsoDateSchema.nullable(),
    dueDate: IsoDateSchema.nullable(),
    totalAmountOre: OreSchema.nullable(),
    vatAmountOre: OreSchema.nullable(),
    netAmountOre: OreSchema.nullable(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Valuta skal være en kode som DKK")
      .nullable(),
    description: NullableString(1000),
    isCreditNote: z.boolean(),
  })
  .partial();

/** Manual correction of extracted fields. A failed document becomes EXTRACTED once it has amount + date. */
export async function updateDocument(ctx: SessionContext, id: string, raw: unknown) {
  const doc = await getDocument(ctx, id);
  const input = DocumentUpdateSchema.parse(raw);
  const { invoiceDate, dueDate, ...rest } = input;
  const merged = {
    totalAmountOre: input.totalAmountOre !== undefined ? input.totalAmountOre : doc.totalAmountOre,
    vatAmountOre: input.vatAmountOre !== undefined ? input.vatAmountOre : doc.vatAmountOre,
    netAmountOre: input.netAmountOre !== undefined ? input.netAmountOre : doc.netAmountOre,
    invoiceDate: invoiceDate !== undefined ? invoiceDate : toIsoDate(doc.invoiceDate) || null,
    dueDate: dueDate !== undefined ? dueDate : toIsoDate(doc.dueDate) || null,
    currency: input.currency !== undefined ? input.currency : doc.currency,
  };
  const complete = merged.totalAmountOre !== null && merged.invoiceDate !== null;
  const updated = await ctx.db.document.update({
    where: { id },
    data: {
      ...rest,
      ...(invoiceDate !== undefined ? { invoiceDate: fromIsoDate(invoiceDate) } : {}),
      ...(dueDate !== undefined ? { dueDate: fromIsoDate(dueDate) } : {}),
      extractionWarnings: sanityCheck(merged),
      ...(doc.status === "FAILED" && complete
        ? { status: "EXTRACTED" as const, errorMessage: null, extractedBy: "manual" }
        : {}),
    },
  });
  await audit(ctx.db, ctx, "document.update", "Document", id, { fields: Object.keys(input) });
  return updated;
}

export async function retryExtraction(ctx: SessionContext, id: string) {
  const doc = await getDocument(ctx, id);
  if (doc.status === "EXTRACTING" || doc.status === "UPLOADED") {
    throw conflict("Dokumentet er allerede i kø til aflæsning.");
  }
  await ctx.db.$transaction(async (tx) => {
    await tx.document.update({ where: { id }, data: { status: "UPLOADED", errorMessage: null } });
    await enqueueExtraction(tx, ctx.organizationId, id);
  });
  await audit(ctx.db, ctx, "document.retry", "Document", id);
}

/** Delete a document and its file. Refused when it is part of an exported journal entry. */
export async function deleteDocument(ctx: SessionContext, id: string) {
  const doc = await getDocument(ctx, id);
  const exported = await ctx.db.journalEntry.count({ where: { documentId: id, exported: true } });
  if (exported > 0) {
    throw conflict("Bilaget indgår i en eksporteret kladdepostering og kan ikke slettes.");
  }
  const matches = await ctx.db.match.findMany({
    where: { documentId: id, status: { in: ["SUGGESTED", "CONFIRMED"] } },
    select: { transactionId: true },
  });
  await ctx.db.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { documentId: id } });
    await tx.document.delete({ where: { id } });
    if (matches.length > 0) {
      await tx.bankTransaction.updateMany({
        where: { id: { in: matches.map((m) => m.transactionId) } },
        data: { status: "UNMATCHED" },
      });
    }
  });
  await getStorage().delete(doc.storagePath);
  await audit(ctx.db, ctx, "document.delete", "Document", id);
}
