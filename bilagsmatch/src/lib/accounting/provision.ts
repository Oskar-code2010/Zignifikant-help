import type { PrismaClient } from "@prisma/client";
import { STANDARD_CHART, STANDARD_VAT_CODES } from "./chart";

/** Give a new organization the standard VAT codes and chart of accounts. */
export async function provisionOrganizationDefaults(
  db: Pick<PrismaClient, "vatCode" | "account">,
  organizationId: string,
): Promise<void> {
  await db.vatCode.createMany({
    data: STANDARD_VAT_CODES.map((v) => ({ ...v, organizationId })),
  });
  await db.account.createMany({
    data: STANDARD_CHART.map((a) => ({ ...a, organizationId })),
  });
}
