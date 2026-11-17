import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { previewBankCsv } from "@/lib/services/bank";

export const POST = authed<{ clientId: string }>(async (ctx, req, { clientId }) =>
  NextResponse.json(await previewBankCsv(ctx, clientId, await req.formData())),
);
