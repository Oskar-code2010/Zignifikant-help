import iconv from "iconv-lite";

export type CsvEncoding = "utf-8" | "utf-8-bom" | "windows-1252";

/**
 * Decode CSV bytes. UTF-8 with BOM → strip BOM. Valid UTF-8 → UTF-8.
 * Anything else → Windows-1252 (a superset of ISO-8859-1 for printable chars), so æ/ø/å survive.
 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom" };
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { text, encoding: "utf-8" };
  } catch {
    return { text: iconv.decode(Buffer.from(bytes), "win1252"), encoding: "windows-1252" };
  }
}

export const ENCODING_LABELS: Record<CsvEncoding, string> = {
  "utf-8": "UTF-8",
  "utf-8-bom": "UTF-8 med BOM",
  "windows-1252": "Windows-1252 / ISO-8859-1",
};
