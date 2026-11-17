import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { confirmMatch } from "@/lib/services/reconciliation";

export const POST = authed<{ matchId: string }>(async (ctx, req, { matchId }) =>
  NextResponse.json(await confirmMatch(ctx, matchId, await readJson(req))),
);
