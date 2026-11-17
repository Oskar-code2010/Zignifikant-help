import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { createRule, listRules } from "@/lib/services/settings";

export const GET = authed(async (ctx) => NextResponse.json({ rules: await listRules(ctx) }));
export const POST = authed(async (ctx, req) =>
  NextResponse.json({ rule: await createRule(ctx, await readJson(req)) }, { status: 201 }),
);
