import { prisma } from "./db.js";

/**
 * Extracts and cleans the base name for a Mitra ID:
 * - First name only
 * - Lowercase
 * - Keep only letters a-z
 * - Max 10 letters
 * - Fallback to "user" if empty or no valid letters remain
 */
export function cleanBaseName(rawName?: string | null): string {
  if (!rawName || typeof rawName !== "string") {
    return "user";
  }

  // Take the first word/token only
  const firstWord = rawName.trim().split(/\s+/)[0] || "";

  // Lowercase, keep only letters a-z, max 10 letters
  const cleaned = firstWord.toLowerCase().replace(/[^a-z]/g, "").slice(0, 10);

  return cleaned || "user";
}

/**
 * Generates random digit string of specified length (e.g., 4 or 5 digits).
 */
export function generateRandomDigits(digits: number = 4): string {
  // Use crypto if available or Math.random
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  const num = Math.floor(min + Math.random() * (max - min + 1));
  return num.toString();
}

/**
 * Generate a unique Mitra ID:
 * - Format: <letters>@<digits>, e.g. sneha@4821
 * - Always lowercase
 * - Tries up to 10 times with 4 digits
 * - If still colliding, switches to 5 digits
 */
export async function generateMitraId(
  name?: string | null,
  client: any = prisma
): Promise<string> {
  const base = cleanBaseName(name);

  // Try up to 10 times with 4 digits, then switch to 5 digits
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const digitCount = attempt <= 10 ? 4 : 5;
    const digits = generateRandomDigits(digitCount);
    const candidate = `${base}@${digits}`.toLowerCase();

    // Check uniqueness in database
    const existing = await client.user.findUnique({
      where: { mitraId: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  // Fallback with timestamp suffix if extreme collisions occur
  return `${base}@${generateRandomDigits(5)}`;
}

/**
 * Safely assigns and saves a Mitra ID to a User:
 * - Immutable rule: Once saved, a Mitra ID must NEVER be changed by any code.
 * - Handles concurrent save race conditions (P2002 unique constraint) with retries.
 */
export async function assignMitraId(
  userId: string,
  name?: string | null,
  client: any = prisma
): Promise<string> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, mitraId: true, name: true, email: true },
  });

  if (!user) {
    throw new Error(`User with ID "${userId}" not found.`);
  }

  // Once saved, a Mitra ID must never be changed
  if (user.mitraId) {
    return user.mitraId;
  }

  const effectiveName = name || user.name || user.email.split("@")[0];

  // Retry loop in case two concurrent transactions generate the same ID
  const maxSaveRetries = 5;
  for (let retry = 1; retry <= maxSaveRetries; retry++) {
    const candidate = await generateMitraId(effectiveName, client);

    try {
      // Ensure we only update if mitraId is still null
      const result = await client.user.updateMany({
        where: { id: userId, mitraId: null },
        data: { mitraId: candidate },
      });

      if (result.count === 1) {
        return candidate;
      }

      // Another request assigned an ID first, so use that one
      const fresh = await client.user.findUnique({
        where: { id: userId },
        select: { mitraId: true },
      });
      if (fresh?.mitraId) return fresh.mitraId;
    } catch (err: any) {
      // P2002 is Prisma unique constraint violation code
      if (err?.code === "P2002" && retry < maxSaveRetries) {
        console.warn(`Mitra ID collision on save (${candidate}), retrying (attempt ${retry + 1}/${maxSaveRetries})...`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Failed to assign a unique Mitra ID to user ${userId} after retries.`);
}

