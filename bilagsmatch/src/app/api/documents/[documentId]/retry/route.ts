import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { retryExtraction } from "@/lib/services/documents";

export const POST = authed<{ documentId: string }>(async (ctx, _req, { documentId }) => {
  await retryExtraction(ctx, documentId);
  return NextResponse.json({ ok: true });
});
