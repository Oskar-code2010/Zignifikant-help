import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getClient } from "@/lib/services/clients";
import { HttpError } from "@/lib/api/errors";
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
  const ctx = await requireSessionContext();
  let client;
  try {
    client = await getClient(ctx, clientId);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
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
