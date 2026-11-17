import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { deleteRule, updateRule } from "@/lib/services/settings";

type P = { ruleId: string };

export const PATCH = authed<P>(async (ctx, req, { ruleId }) =>
  NextResponse.json({ rule: await updateRule(ctx, ruleId, await readJson(req)) }),
);
export const DELETE = authed<P>(async (ctx, _req, { ruleId }) => {
  await deleteRule(ctx, ruleId);
  return NextResponse.json({ ok: true });
});
