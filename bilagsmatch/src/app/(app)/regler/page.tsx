import type { Metadata } from "next";
import { requirePageContext } from "@/lib/auth/session";
import { listRules, listAccounts } from "@/lib/services/settings";
import { RulesTable } from "@/components/settings/rules-table";

export const metadata: Metadata = { title: "Regler" };

export default async function RulesPage() {
  const ctx = await requirePageContext();
  const [rules, { accounts, vatCodes }] = await Promise.all([listRules(ctx), listAccounts(ctx)]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Regler</h1>
        <p className="text-sm text-muted-foreground">
          Regler bestemmer konto og momskode for kendte leverandører. Rækkefølge: CVR →
          leverandørnavn → banktekst → indbyggede standardforslag.
        </p>
      </div>
      <RulesTable
        rules={rules}
        accounts={accounts.map((a) => ({ number: a.number, name: a.name }))}
        vatCodes={vatCodes.map((v) => ({ code: v.code, name: v.name }))}
      />
    </div>
  );
}
