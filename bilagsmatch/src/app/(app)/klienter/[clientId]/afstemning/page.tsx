import type { Metadata } from "next";
import { pageData, requirePageContext } from "@/lib/auth/session";
import { reviewQueue } from "@/lib/services/reconciliation";
import { ReviewScreen } from "@/components/review/review-screen";
import type { ReviewItem } from "@/components/review/types";

export const metadata: Metadata = { title: "Afstemning" };

export default async function ReviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const ctx = await requirePageContext();
  const [items, accounts, vatCodes] = await pageData(
    Promise.all([
      reviewQueue(ctx, clientId),
      ctx.db.account.findMany({
        where: { type: { in: ["EXPENSE", "REVENUE", "ASSET"] } },
        orderBy: { number: "asc" },
      }),
      ctx.db.vatCode.findMany({ orderBy: { code: "asc" } }),
    ]),
  );
  // Serialize dates to ISO strings, same shape as GET /api/clients/:id/review.
  const serialized = JSON.parse(JSON.stringify(items)) as ReviewItem[];
  return (
    <ReviewScreen
      clientId={clientId}
      initialItems={serialized}
      accounts={accounts.map((a) => ({
        number: a.number,
        name: a.name,
        defaultVatCode: a.defaultVatCode,
      }))}
      vatCodes={vatCodes.map((v) => ({ code: v.code, name: v.name }))}
    />
  );
}
