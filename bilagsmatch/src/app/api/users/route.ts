import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { createUser } from "@/lib/services/settings";

export const POST = authed(async (ctx, req) =>
  NextResponse.json({ user: await createUser(ctx, await readJson(req)) }, { status: 201 }),
);
