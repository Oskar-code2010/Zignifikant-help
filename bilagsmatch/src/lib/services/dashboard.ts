import type { SessionContext } from "@/lib/auth/session";

export interface ClientOverview {
  id: string;
  name: string;
  unmatchedDocuments: number;
  unmatchedTransactions: number;
  awaitingReview: number;
  failedDocuments: number;
  lastExportAt: Date | null;
}

/** Overview across all clients of the organization. */
export async function dashboardOverview(ctx: SessionContext): Promise<ClientOverview[]> {
  const clients = await ctx.db.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return Promise.all(
    clients.map(async (c) => {
      const [unmatchedDocuments, unmatchedTransactions, awaitingReview, failedDocuments, lastExport] = await Promise.all([
        ctx.db.document.count({ where: { clientId: c.id, status: "EXTRACTED", matches: { none: { status: "CONFIRMED" } } } }),
        ctx.db.bankTransaction.count({ where: { bankAccount: { clientId: c.id }, status: { in: ["UNMATCHED", "MISSING_RECEIPT"] } } }),
        ctx.db.match.count({ where: { status: "SUGGESTED", document: { clientId: c.id } } }),
        ctx.db.document.count({ where: { clientId: c.id, status: "FAILED" } }),
        ctx.db.journalEntry.aggregate({ where: { clientId: c.id, exported: true }, _max: { exportedAt: true } }),
      ]);
      return {
        id: c.id,
        name: c.name,
        unmatchedDocuments,
        unmatchedTransactions,
        awaitingReview,
        failedDocuments,
        lastExportAt: lastExport._max.exportedAt,
      };
    }),
  );
}
