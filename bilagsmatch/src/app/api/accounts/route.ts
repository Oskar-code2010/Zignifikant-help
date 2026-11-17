import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { createAccount, listAccounts } from "@/lib/services/settings";

export const GET = authed(async (ctx) => NextResponse.json(await listAccounts(ctx)));
export const POST = authed(async (ctx, req) =>
  NextResponse.json({ account: await createAccount(ctx, await readJson(req)) }, { status: 201 }),
);
