import { decodeCsvBytes, ENCODING_LABELS } from "./decode";
import { detectFormat } from "./detect";
import { parseRows, tokenize } from "./parse";
import type { DetectionResult, ParseOptions, ParseResult } from "./types";

export * from "./types";
export { decodeCsvBytes, detectFormat, parseRows, tokenize, ENCODING_LABELS };
export { dedupeHashes } from "./parse";

/** Decode + detect + parse with the detected (or overridden) options. */
export function analyzeCsv(
  bytes: Uint8Array,
  overrides?: Partial<ParseOptions>,
): { detection: DetectionResult; options: ParseOptions; result: ParseResult; rawRows: string[][] } {
  const { text, encoding } = decodeCsvBytes(bytes);
  const detection = detectFormat(text, encoding);
  const options: ParseOptions = {
    delimiter: overrides?.delimiter ?? detection.delimiter,
    decimal: overrides?.decimal ?? detection.decimal,
    dateFormat: overrides?.dateFormat ?? detection.dateFormat,
    headerRowIndex: overrides?.headerRowIndex ?? detection.headerRowIndex,
    mapping: overrides?.mapping ?? detection.mapping,
  };
  const rawRows = tokenize(text, options.delimiter);
  return { detection, options, result: parseRows(rawRows, options), rawRows };
}
