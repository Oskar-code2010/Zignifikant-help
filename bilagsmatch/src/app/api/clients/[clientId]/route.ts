import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { deleteClient, getClient, updateClient } from "@/lib/services/clients";

type P = { clientId: string };

export const GET = authed<P>(async (ctx, _req, { clientId }) =>
  NextResponse.json({ client: await getClient(ctx, clientId) }),
);

export const PATCH = authed<P>(async (ctx, req, { clientId }) =>
  NextResponse.json({ client: await updateClient(ctx, clientId, await readJson(req)) }),
);

export const DELETE = authed<P>(async (ctx, req, { clientId }) => {
  await deleteClient(ctx, clientId, await readJson(req));
  return NextResponse.json({ ok: true });
});
