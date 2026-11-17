import type { Metadata } from "next";
import { pageData, requirePageContext } from "@/lib/auth/session";
import { getClient } from "@/lib/services/clients";
import { ExportPanel } from "@/components/export/export-panel";

export const metadata: Metadata = { title: "Eksport" };

export default async function ExportPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const ctx = await requirePageContext();
  const client = await pageData(getClient(ctx, clientId));
  return <ExportPanel clientId={clientId} counterAccount={client.bankLedgerAccount} />;
}
