import { INDIAN_STATES, GSTIN_REGEX } from "./constants.js";

/**
 * Normalizes a GSTIN by trimming whitespace and converting to uppercase.
 */
export function normalizeGstin(gstin: string | null | undefined): string {
  if (!gstin) return "";
  return gstin.trim().toUpperCase();
}

/**
 * Checks if a string is a valid Indian GSTIN:
 * - Exactly 15 characters
 * - Matches GSTIN format pattern (e.g. 22AAAAA0000A1Z5)
 * - First 2 digits must be a valid Indian GST state code
 */
export function isValidGstin(gstin: string | null | undefined): boolean {
  const clean = normalizeGstin(gstin);
  if (clean.length !== 15) return false;
  if (!GSTIN_REGEX.test(clean)) return false;

  const stateCode = clean.substring(0, 2);
  return INDIAN_STATES.some((s) => s.code === stateCode);
}

