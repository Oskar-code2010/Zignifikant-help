import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { createClient, listClients } from "@/lib/services/clients";

export const GET = authed(async (ctx) => NextResponse.json({ clients: await listClients(ctx) }));

export const POST = authed(async (ctx, req) =>
  NextResponse.json({ client: await createClient(ctx, await readJson(req)) }, { status: 201 }),
);
