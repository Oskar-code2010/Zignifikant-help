/** Danish CVR number helpers. A CVR number is exactly 8 digits. */

/** Strip spaces, dashes and an optional "DK"/"CVR" prefix. Returns digits only. */
export function normalizeCvr(input: string): string {
  return input
    .replace(/^\s*(?:cvr(?:-?nr\.?)?:?|dk)\s*/i, "")
    .replace(/[\s-]/g, "");
}

export function isValidCvr(input: string): boolean {
  return /^\d{8}$/.test(normalizeCvr(input));
}
