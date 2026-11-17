import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { searchDocumentsForTransaction } from "@/lib/services/reconciliation";

export const GET = authed<{ clientId: string; transactionId: string }>(
  async (ctx, req, { clientId, transactionId }) => {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json({
      documents: await searchDocumentsForTransaction(ctx, clientId, transactionId, q.slice(0, 100)),
    });
  },
);
