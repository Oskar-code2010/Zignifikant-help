import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { listTransactions } from "@/lib/services/bank";

export const GET = authed<{ clientId: string }>(async (ctx, req, { clientId }) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return NextResponse.json({ transactions: await listTransactions(ctx, clientId, params) });
});
