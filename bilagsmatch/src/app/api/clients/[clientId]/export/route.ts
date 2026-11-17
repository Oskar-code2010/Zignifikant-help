import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { createExport, exportPreview } from "@/lib/services/export";

type P = { clientId: string };

export const GET = authed<P>(async (ctx, req, { clientId }) => {
  const sp = new URL(req.url).searchParams;
  const res = await exportPreview(ctx, clientId, { from: sp.get("from") ?? "", to: sp.get("to") ?? "" });
  return NextResponse.json(res);
});

export const POST = authed<P>(async (ctx, req, { clientId }) => {
  const { csv, filename, count } = await createExport(ctx, clientId, await readJson(req));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-export-count": String(count),
    },
  });
});
