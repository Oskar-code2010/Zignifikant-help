import type { SessionContext } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/api/errors";
import { getStorage } from "@/lib/storage";
import {
  ClientInputSchema,
  ClientUpdateSchema,
  DeleteClientSchema,
  IdSchema,
} from "@/lib/validation/schemas";

export async function listClients(ctx: SessionContext) {
  const clients = await ctx.db.client.findMany({ orderBy: { name: "asc" } });
  const ids = clients.map((c) => c.id);
  const [docCounts, unmatchedTx] = await Promise.all([
    ctx.db.document.groupBy({ by: ["clientId"], where: { clientId: { in: ids } }, _count: true }),
    ctx.db.bankTransaction.findMany({
      where: { status: { in: ["UNMATCHED", "SUGGESTED"] }, bankAccount: { clientId: { in: ids } } },
      select: { bankAccount: { select: { clientId: true } } },
    }),
  ]);
  const unmatchedByClient = new Map<string, number>();
  for (const t of unmatchedTx) {
    const id = t.bankAccount.clientId;
    unmatchedByClient.set(id, (unmatchedByClient.get(id) ?? 0) + 1);
  }
  return clients.map((c) => ({
    ...c,
    documentCount: docCounts.find((d) => d.clientId === c.id)?._count ?? 0,
    openTransactionCount: unmatchedByClient.get(c.id) ?? 0,
  }));
}

export async function getClient(ctx: SessionContext, id: string) {
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) throw notFound("Klienten");
  const client = await ctx.db.client.findUnique({ where: { id: parsed.data } });
  if (!client) throw notFound("Klienten");
  return client;
}

export async function createClient(ctx: SessionContext, raw: unknown) {
  const input = ClientInputSchema.parse(raw);
  const client = await ctx.db.client.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      cvr: input.cvr,
      notes: input.notes,
      bankLedgerAccount: input.bankLedgerAccount ?? "5810",
    },
  });
  await audit(ctx.db, ctx, "client.create", "Client", client.id);
  return client;
}

export async function updateClient(ctx: SessionContext, id: string, raw: unknown) {
  await getClient(ctx, id);
  const input = ClientUpdateSchema.parse(raw);
  const client = await ctx.db.client.update({ where: { id }, data: input });
  await audit(ctx.db, ctx, "client.update", "Client", id);
  return client;
}

/** GDPR delete: removes the client, all its rows (cascade) and its stored files. */
export async function deleteClient(ctx: SessionContext, id: string, raw: unknown) {
  const client = await getClient(ctx, id);
  const { confirmName } = DeleteClientSchema.parse(raw);
  if (confirmName.trim() !== client.name) {
    throw badRequest("Navnet matcher ikke. Skriv klientens navn præcist for at bekræfte sletningen.");
  }
  await ctx.db.client.delete({ where: { id } });
  await getStorage().deleteClient(ctx.organizationId, id);
  await audit(ctx.db, ctx, "client.delete", "Client", id);
}
