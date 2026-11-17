import type { Metadata } from "next";
import { requireSessionContext } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/settings";
import { ChartEditor } from "@/components/settings/chart-editor";

export const metadata: Metadata = { title: "Kontoplan" };

export default async function ChartPage() {
  const ctx = await requireSessionContext();
  const { accounts, vatCodes } = await listAccounts(ctx);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Kontoplan og momskoder</h1>
      <ChartEditor
        accounts={accounts.map((a) => ({ id: a.id, number: a.number, name: a.name, type: a.type, defaultVatCode: a.defaultVatCode }))}
        vatCodes={vatCodes.map((v) => ({ id: v.id, code: v.code, name: v.name, description: v.description, ratePercent: v.ratePercent }))}
      />
    </div>
  );
}
