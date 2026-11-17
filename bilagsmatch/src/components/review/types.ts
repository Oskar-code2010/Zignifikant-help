/** Review queue item as sent to the browser (dates are ISO strings). */
export interface ReviewItem {
  transaction: { id: string; bookingDate: string; text: string; amountOre: number; status: string };
  match: {
    id: string;
    score: number;
    reasons: string[];
    suggestedAccount: string | null;
    suggestedVatCode: string | null;
    suggestionSource: string | null;
    document: {
      id: string;
      originalFilename: string;
      mimeType: string;
      supplierName: string | null;
      supplierCvr: string | null;
      invoiceNumber: string | null;
      invoiceDate: string | null;
      dueDate: string | null;
      totalAmountOre: number | null;
      vatAmountOre: number | null;
      currency: string | null;
      description: string | null;
      isCreditNote: boolean;
      warnings: string[];
    };
  } | null;
  fallbackSuggestion: { accountNumber: string; vatCode: string; explanation: string } | null;
}

export interface AccountOption {
  number: string;
  name: string;
  defaultVatCode: string | null;
}

export interface VatOption {
  code: string;
  name: string;
}

export interface CandidateDoc {
  id: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmountOre: number | null;
  currency: string | null;
  originalFilename: string;
  score: number | null;
  suggestedAccount: string | null;
  suggestedVatCode: string | null;
}
