import { authed } from "@/lib/api/handler";
import { getDocumentFile } from "@/lib/services/documents";

/** Serves the uploaded file only to users in the owning organization. */
export const GET = authed<{ documentId: string }>(async (ctx, _req, { documentId }) => {
  const { doc, bytes } = await getDocumentFile(ctx, documentId);
  const asciiName = doc.originalFilename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": doc.mimeType,
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.originalFilename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});
