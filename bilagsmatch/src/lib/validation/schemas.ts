import { z } from "zod";
import { isValidCvr, normalizeCvr } from "@/lib/cvr";
import { MAX_AMOUNT_ORE } from "@/lib/money";

export const IdSchema = z.string().regex(/^[a-z0-9]{10,40}$/i, "ugyldigt id");

export const CvrSchema = z
  .string()
  .trim()
  .refine(isValidCvr, "CVR-nummer skal være 8 cifre")
  .transform(normalizeCvr);

export const ClientInputSchema = z.object({
  name: z.string().trim().min(1, "Navn skal udfyldes").max(200),
  cvr: CvrSchema,
  notes: z.string().max(5000).optional().default(""),
  bankLedgerAccount: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/, "Kontonummer skal være tal")
    .optional(),
});
export type ClientInput = z.infer<typeof ClientInputSchema>;

export const ClientUpdateSchema = ClientInputSchema.partial();

export const DeleteClientSchema = z.object({ confirmName: z.string() });

export const OreSchema = z
  .number()
  .int("Beløb skal være hele øre")
  .min(-MAX_AMOUNT_ORE)
  .max(MAX_AMOUNT_ORE);

/** yyyy-mm-dd */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dato skal være åååå-mm-dd");
