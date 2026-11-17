import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { updateVatCode } from "@/lib/services/settings";

export const PATCH = authed<{ vatCodeId: string }>(async (ctx, req, { vatCodeId }) =>
  NextResponse.json({ vatCode: await updateVatCode(ctx, vatCodeId, await readJson(req)) }),
);
