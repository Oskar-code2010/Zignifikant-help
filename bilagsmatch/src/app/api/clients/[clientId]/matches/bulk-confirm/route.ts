import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { bulkConfirm, bulkConfirmPreview } from "@/lib/services/reconciliation";

type P = { clientId: string };

export const GET = authed<P>(async (ctx, _req, { clientId }) => {
  const { matchIds: _ids, ...preview } = await bulkConfirmPreview(ctx, clientId);
  return NextResponse.json(preview);
});

export const POST = authed<P>(async (ctx, _req, { clientId }) => NextResponse.json(await bulkConfirm(ctx, clientId)));
