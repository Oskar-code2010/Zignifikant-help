import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { undoMatch } from "@/lib/services/reconciliation";

export const POST = authed<{ matchId: string }>(async (ctx, _req, { matchId }) => {
  await undoMatch(ctx, matchId);
  return NextResponse.json({ ok: true });
});
