import { Pencil } from "lucide-react";
import { pageData, requirePageContext } from "@/lib/auth/session";
import { getClient } from "@/lib/services/clients";
import { Button } from "@/components/ui/button";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { DeleteClientDialog } from "@/components/clients/delete-client-dialog";
import { ClientTabs } from "@/components/clients/client-tabs";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requirePageContext();
  const client = await pageData(getClient(ctx, clientId));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="client-name">
            {client.name}
          </h1>
          <p className="text-sm text-muted-foreground">CVR {client.cvr}</p>
        </div>
        <div className="flex gap-2">
          <ClientFormDialog
            initial={{
              id: client.id,
              name: client.name,
              cvr: client.cvr,
              notes: client.notes,
              bankLedgerAccount: client.bankLedgerAccount,
            }}
            trigger={
              <Button variant="outline" size="sm">
                <Pencil aria-hidden /> Rediger
              </Button>
            }
          />
          <DeleteClientDialog clientId={client.id} clientName={client.name} />
        </div>
      </div>
      <ClientTabs clientId={client.id} />
      <div>{children}</div>
    </div>
  );
}
