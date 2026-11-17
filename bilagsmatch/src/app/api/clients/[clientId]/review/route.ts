import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { reviewQueue } from "@/lib/services/reconciliation";

export const GET = authed<{ clientId: string }>(async (ctx, _req, { clientId }) =>
  NextResponse.json({ items: await reviewQueue(ctx, clientId) }),
);
