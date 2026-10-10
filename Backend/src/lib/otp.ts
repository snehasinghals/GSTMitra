import crypto from "crypto";
import { prisma } from "./db.js";
import { sendOtpEmail } from "./email.js";

export type OtpPurpose = "SIGNUP" | "LOGIN" | "RESET_PASSWORD";

export interface UserForOtp {
  id: string;
  email: string;
  name?: string;
}

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESENDS_PER_HOUR = 3;

/**
 * Creates a SHA-256 hash of (otp + userId).
 */
function hashOtp(code: string, userId: string): string {
  return crypto.createHash("sha256").update(`${code}${userId}`).digest("hex");
}

/**
 * Performs a timing-safe comparison of the computed SHA-256 hash and stored hash.
 */
function isHashMatch(computedHash: string, storedHash: string): boolean {
  if (computedHash.length !== storedHash.length) return false;
  const a = Buffer.from(computedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP,
 * deletes any existing OTP for (userId, purpose),
 * saves the hash in DB, and sends the email.
 */
export async function createAndSendOtp(user: UserForOtp, purpose: OtpPurpose) {
  // Generate 6-digit code between 100000 and 999999
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashOtp(code, user.id);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Enforce rule: only one active OTP per user per purpose
  await prisma.otpCode.deleteMany({
    where: {
      userId: user.id,
      purpose,
    },
  });

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      purpose,
      codeHash,
      expiresAt,
      attempts: 0,
      resendCount: 0,
      lastSentAt: now,
    },
  });

  // Send the email via Brevo SMTP
  const emailRes = await sendOtpEmail({
    to: user.email,
    name: user.name,
    code,
    purpose,
  });

  if (!emailRes.success) {
    throw new Error(emailRes.error || "Failed to send verification email. Please try again.");
  }

  return { success: true };
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  code?: "NOT_FOUND" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "INVALID_CODE";
  attemptsLeft?: number;
}

/**
 * Verifies a 6-digit code using timing-safe comparison.
 * Manages attempt count, expiry, and single-use deletion.
 */
export async function verifyOtp(userId: string, purpose: OtpPurpose, code: string): Promise<VerifyOtpResult> {
  const cleanCode = (code || "").trim();
  if (!cleanCode || cleanCode.length !== 6) {
    return {
      success: false,
      error: "Please enter a valid 6-digit verification code.",
      code: "INVALID_CODE",
    };
  }

  const otpRecord = await prisma.otpCode.findFirst({
    where: { userId, purpose },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return {
      success: false,
      error: "No active verification code found. Please request a new code.",
      code: "NOT_FOUND",
    };
  }

  const now = new Date();

  // Check if expired
  if (now > otpRecord.expiresAt) {
    await prisma.otpCode.delete({ where: { id: otpRecord.id } });
    return {
      success: false,
      error: "Verification code has expired. Please request a new code.",
      code: "EXPIRED",
    };
  }

  const computedHash = hashOtp(cleanCode, userId);
  const matched = isHashMatch(computedHash, otpRecord.codeHash);

  if (!matched) {
    const newAttempts = otpRecord.attempts + 1;

    if (newAttempts >= MAX_ATTEMPTS) {
      // Max 5 wrong tries: delete OTP and ask to restart
      await prisma.otpCode.delete({ where: { id: otpRecord.id } });
      return {
        success: false,
        error: "Too many incorrect attempts. Please sign in or register again to get a new code.",
        code: "TOO_MANY_ATTEMPTS",
        attemptsLeft: 0,
      };
    }

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: newAttempts },
    });

    const attemptsLeft = MAX_ATTEMPTS - newAttempts;
    return {
      success: false,
      error: `Incorrect verification code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`,
      code: "INVALID_CODE",
      attemptsLeft,
    };
  }

  // Code matches! Delete immediately so it can only be used once
  await prisma.otpCode.delete({ where: { id: otpRecord.id } });

  return { success: true };
}

export interface ResendOtpResult {
  success: boolean;
  error?: string;
  code?: "NOT_FOUND" | "COOLDOWN" | "RESEND_LIMIT_EXCEEDED" | "EMAIL_ERROR";
  secondsLeft?: number;
}

/**
 * Resends an OTP with a 60-second cooldown and max 3 resends per hour limit.
 */
export async function resendOtp(user: UserForOtp, purpose: OtpPurpose): Promise<ResendOtpResult> {
  const existing = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  if (existing) {
    const timeSinceLastSent = now.getTime() - new Date(existing.lastSentAt).getTime();
    const cooldownMs = RESEND_COOLDOWN_SECONDS * 1000;

    if (timeSinceLastSent < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - timeSinceLastSent) / 1000);
      return {
        success: false,
        error: `Please wait ${secondsLeft} second${secondsLeft === 1 ? "" : "s"} before requesting a new code.`,
        code: "COOLDOWN",
        secondsLeft,
      };
    }

    // Check hourly limit: max 3 resends per hour
    const oneHourAgo = now.getTime() - 60 * 60 * 1000;
    if (new Date(existing.createdAt).getTime() > oneHourAgo && existing.resendCount >= MAX_RESENDS_PER_HOUR) {
      return {
        success: false,
        error: "Maximum resend limit (3 per hour) reached. Please try again later.",
        code: "RESEND_LIMIT_EXCEEDED",
      };
    }
  }

  // Generate new 6-digit code
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = hashOtp(code, user.id);
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const newResendCount = (existing ? existing.resendCount : 0) + 1;

  // Delete previous
  await prisma.otpCode.deleteMany({
    where: { userId: user.id, purpose },
  });

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      purpose,
      codeHash,
      expiresAt,
      attempts: 0,
      resendCount: newResendCount,
      lastSentAt: now,
    },
  });

  const emailRes = await sendOtpEmail({
    to: user.email,
    name: user.name,
    code,
    purpose,
  });

  if (!emailRes.success) {
    return {
      success: false,
      error: emailRes.error || "Failed to send verification email. Please try again.",
      code: "EMAIL_ERROR",
    };
  }

  return { success: true };
}

/**
 * Creates a short-lived (10 min) single-use cryptographic reset token.
 * Generates random 32 bytes, stores SHA-256 hash in DB, and returns the raw token.
 */
export async function createResetToken(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  // Invalidate any previous reset tokens for this user
  await prisma.resetToken.deleteMany({ where: { userId } });

  await prisma.resetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Verifies a reset token using SHA-256 hash comparison.
 * If valid and not expired, deletes it immediately (single-use) and returns true.
 */
export async function verifyAndConsumeResetToken(userId: string, rawToken: string): Promise<boolean> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.trim().length === 0) {
    return false;
  }

  const tokenRecord = await prisma.resetToken.findFirst({
    where: { userId },
  });

  if (!tokenRecord) return false;

  // Check expiration
  if (new Date() > tokenRecord.expiresAt) {
    await prisma.resetToken.delete({ where: { id: tokenRecord.id } });
    return false;
  }

  const computedHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
  const matched = isHashMatch(computedHash, tokenRecord.tokenHash);

  if (!matched) return false;

  // Single-use: delete immediately
  await prisma.resetToken.delete({ where: { id: tokenRecord.id } });
  return true;
}


