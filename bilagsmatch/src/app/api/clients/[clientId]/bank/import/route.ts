import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { importBankCsv } from "@/lib/services/bank";

export const POST = authed<{ clientId: string }>(async (ctx, req, { clientId }) =>
  NextResponse.json(await importBankCsv(ctx, clientId, await req.formData()), { status: 201 }),
);
