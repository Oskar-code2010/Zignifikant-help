import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { runMatching } from "@/lib/services/reconciliation";

export const POST = authed<{ clientId: string }>(async (ctx, _req, { clientId }) =>
  NextResponse.json(await runMatching(ctx, clientId)),
);
