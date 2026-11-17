import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { listClients } from "@/lib/services/clients";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";

export const metadata: Metadata = { title: "Klienter" };

export default async function ClientsPage() {
  const ctx = await requireSessionContext();
  const clients = await listClients(ctx);
  const createButton = (
    <Button>
      <Plus aria-hidden /> Opret klient
    </Button>
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Klienter</h1>
        <ClientFormDialog trigger={createButton} />
      </div>
      {clients.length === 0 ? (
        <EmptyState title="Ingen klienter endnu" icon={<Building2 className="h-8 w-8" />}>
          Opret din første klient for at uploade bilag og importere bankudtog.
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Navn</TH>
                <TH>CVR</TH>
                <TH className="text-right">Bilag</TH>
                <TH className="text-right">Åbne bankposter</TH>
              </TR>
            </THead>
            <TBody>
              {clients.map((c) => (
                <TR key={c.id} className="hover:bg-muted/50">
                  <TD>
                    <Link href={`/klienter/${c.id}/bilag`} className="font-medium text-primary hover:underline">
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="tabular">{c.cvr}</TD>
                  <TD className="tabular text-right">{c.documentCount}</TD>
                  <TD className="tabular text-right">{c.openTransactionCount}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
