import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { setTransactionState } from "@/lib/services/reconciliation";

export const POST = authed<{ transactionId: string }>(async (ctx, req, { transactionId }) =>
  NextResponse.json(await setTransactionState(ctx, transactionId, await readJson(req))),
);
