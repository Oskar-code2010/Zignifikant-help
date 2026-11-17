import { NextResponse } from "next/server";
import { authed, readJson } from "@/lib/api/handler";
import { deleteDocument, getDocument, updateDocument } from "@/lib/services/documents";

type P = { documentId: string };

export const GET = authed<P>(async (ctx, _req, { documentId }) => {
  const {
    rawExtractionJson: _raw,
    storagePath: _path,
    ...doc
  } = await getDocument(ctx, documentId);
  return NextResponse.json({ document: doc });
});

export const PATCH = authed<P>(async (ctx, req, { documentId }) => {
  const {
    rawExtractionJson: _raw,
    storagePath: _path,
    ...doc
  } = await updateDocument(ctx, documentId, await readJson(req));
  return NextResponse.json({ document: doc });
});

export const DELETE = authed<P>(async (ctx, _req, { documentId }) => {
  await deleteDocument(ctx, documentId);
  return NextResponse.json({ ok: true });
});
