import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { manualMatch } from "@/lib/services/reconciliation";

export const POST = authed<{ clientId: string }>(async (ctx, req, { clientId }) =>
  NextResponse.json(await manualMatch(ctx, clientId, await readJson(req)), { status: 201 }),
);
