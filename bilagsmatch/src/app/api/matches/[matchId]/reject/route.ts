import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { rejectMatch } from "@/lib/services/reconciliation";

export const POST = authed<{ matchId: string }>(async (ctx, _req, { matchId }) =>
  NextResponse.json(await rejectMatch(ctx, matchId)),
);
