import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { updateAccount } from "@/lib/services/settings";

export const PATCH = authed<{ accountId: string }>(async (ctx, req, { accountId }) =>
  NextResponse.json({ account: await updateAccount(ctx, accountId, await readJson(req)) }),
);
