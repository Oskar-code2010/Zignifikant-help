import { formatDKK } from "@/lib/money";
import type { ExtractionResult } from "./types";

const TOLERANCE_ORE = 100; // ±1 kr

/**
 * Plausibility checks on extracted data. Returns Danish warnings; never throws.
 * - net + VAT ≈ total (±1 kr)
 * - VAT ≈ 20 % of total (25 % VAT) – other rates are allowed but noted
 */
export function sanityCheck(r: Pick<ExtractionResult, "totalAmountOre" | "vatAmountOre" | "netAmountOre" | "invoiceDate" | "dueDate" | "currency">): string[] {
  const warnings: string[] = [];
  const { totalAmountOre: total, vatAmountOre: vat, netAmountOre: net } = r;

  if (total === null) warnings.push("Totalbeløbet kunne ikke aflæses.");
  if (r.invoiceDate === null) warnings.push("Fakturadatoen kunne ikke aflæses.");

  if (total !== null && vat !== null && net !== null) {
    const diff = Math.abs(net + vat - total);
    if (diff > TOLERANCE_ORE) {
      warnings.push(
        `Netto + moms (${formatDKK(net + vat)}) svarer ikke til totalen (${formatDKK(total)}) – forskel ${formatDKK(diff)}.`,
      );
    }
  }
  if (total !== null && vat !== null && total !== 0 && vat !== 0) {
    // Expected VAT for 25 % VAT is total × 0.2. Compare in integer math.
    const expected = Math.round((total * 20) / 100);
    if (Math.abs(vat - expected) > Math.max(TOLERANCE_ORE, Math.abs(total) / 200)) {
      const pct = Math.round((Math.abs(vat) * 1000) / Math.abs(total)) / 10;
      warnings.push(
        `Momsen er ${pct.toString().replace(".", ",")} % af totalen – forventet 20 % ved 25 % moms. Tjek momssatsen.`,
      );
    }
  }
  if (r.invoiceDate && r.dueDate && r.dueDate < r.invoiceDate) {
    warnings.push("Forfaldsdatoen ligger før fakturadatoen.");
  }
  return warnings;
}
