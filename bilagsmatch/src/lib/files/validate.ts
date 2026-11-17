/** Accepted upload types, detected from magic bytes (never from the extension). */
export type AllowedMime = "application/pdf" | "image/png" | "image/jpeg";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const EXTENSION_FOR: Record<AllowedMime, "pdf" | "png" | "jpg"> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export function detectMimeType(bytes: Uint8Array): AllowedMime | null {
  const b = bytes;
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return "application/pdf"; // %PDF-
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

/** Heuristic: PDFs with an /Encrypt dictionary are password protected or restricted. */
export function isEncryptedPdf(bytes: Uint8Array): boolean {
  const text = Buffer.from(bytes).toString("latin1");
  return /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(text);
}

/** Sanitize a user-provided filename for display/storage in the DB (never used as a path). */
export function cleanFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fil";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").trim();
  return (cleaned || "fil").slice(0, 200);
}
