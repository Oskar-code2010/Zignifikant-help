import { z } from "zod";
import { MAX_AMOUNT_ORE } from "@/lib/money";

const Ore = z.number().int().min(-MAX_AMOUNT_ORE).max(MAX_AMOUNT_ORE);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dato skal være YYYY-MM-DD");

/** What an extraction provider returns. Amounts in integer øre; dates as YYYY-MM-DD. */
export const ExtractionResultSchema = z.object({
  supplierName: z.string().min(1).max(200).nullable(),
  supplierCvr: z.string().max(20).nullable(),
  invoiceNumber: z.string().max(100).nullable(),
  invoiceDate: IsoDate.nullable(),
  dueDate: IsoDate.nullable(),
  totalAmountOre: Ore.nullable(),
  vatAmountOre: Ore.nullable(),
  netAmountOre: Ore.nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, "valuta skal være en ISO-kode som DKK")
    .nullable(),
  description: z.string().max(1000).nullable(),
  lineItems: z
    .array(z.object({ description: z.string().max(300), amountOre: Ore.nullable() }))
    .max(100),
  isCreditNote: z.boolean(),
  /** 0–100: how sure the provider is about the extracted fields. */
  confidence: z.number().int().min(0).max(100),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export interface ExtractionInput {
  bytes: Buffer;
  mimeType: string;
  filename: string;
}

export interface ExtractionProvider {
  readonly name: string;
  extract(input: ExtractionInput): Promise<ExtractionResult>;
}

/** An extraction failure with a readable Danish message for the user. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}
