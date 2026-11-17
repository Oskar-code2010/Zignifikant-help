import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { renameOrganization } from "@/lib/services/settings";

export const PATCH = authed(async (ctx, req) =>
  NextResponse.json({ organization: await renameOrganization(ctx, await readJson(req)) }),
);
