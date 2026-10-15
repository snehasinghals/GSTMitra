import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db.js";
import { generateToken, authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validateGstin, INDIAN_STATES } from "../lib/constants.js";
import { sendSignupWelcomeEmail, sendLoginAlertEmail, sendPasswordChangedEmail } from "../lib/email.js";
import {
  createAndSendOtp,
  verifyOtp,
  resendOtp,
  createResetToken,
  verifyAndConsumeResetToken,
  OtpPurpose,
} from "../lib/otp.js";

const router = Router();

// In-memory sliding window rate limiter: max requests per hour per key
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string, maxRequests = 3, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const valid = timestamps.filter((t) => now - t < windowMs);
  if (valid.length >= maxRequests) {
    rateLimitMap.set(key, valid);
    return false;
  }
  valid.push(now);
  rateLimitMap.set(key, valid);
  return true;
}

// Helper to get client IP cleanly
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"] as string;
  if (forwarded) {
    const first = forwarded.split(",")[0].trim();
    if (first && first !== "::1") return first;
  }
  const remote = req.socket?.remoteAddress || "";
  if (remote === "::1" || remote === "127.0.0.1") return "127.0.0.1 (Localhost)";
  return remote;
}

// ==========================================
// 1. SIGNUP — Step 1: Send OTP to email
// ==========================================
router.post("/signup/send-otp", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      if (existingUser.emailVerified) {
        return res.status(409).json({
          error: "This email is already registered. Please login.",
          code: "EMAIL_EXISTS",
        });
      }
      // Unverified user exists — send a fresh SIGNUP OTP
      try {
        await createAndSendOtp(
          { id: existingUser.id, email: existingUser.email, name: existingUser.name },
          "SIGNUP"
        );
        return res.json({
          success: true,
          email: existingUser.email,
          message: "A 6-digit code has been sent to your email.",
        });
      } catch (mailErr: any) {
        return res.status(500).json({ error: mailErr?.message || "Failed to send verification email." });
      }
    }

    // No user exists yet — create a minimal placeholder so OTP can be linked
    const placeholderUser = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: cleanEmail.split("@")[0], // temporary name
        emailVerified: null,
      },
    });

    try {
      await createAndSendOtp(
        { id: placeholderUser.id, email: placeholderUser.email, name: placeholderUser.name },
        "SIGNUP"
      );
    } catch (mailErr: any) {
      console.error("[Auth] Signup OTP email failed:", mailErr);
      return res.status(500).json({
        error: "Failed to send verification email. Please try again.",
      });
    }

    return res.json({
      success: true,
      email: placeholderUser.email,
      message: "A 6-digit code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Signup send-otp error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ==========================================
// 1b. SIGNUP — Step 2: Verify OTP
// ==========================================
router.post("/signup/verify-otp", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(400).json({ error: "No account found. Please start again." });
    }

    const verifyRes = await verifyOtp(user.id, "SIGNUP", code);
    if (!verifyRes.success) {
      return res.status(400).json({
        error: verifyRes.error,
        code: verifyRes.code,
        attemptsLeft: verifyRes.attemptsLeft,
      });
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    // Return a short-lived signup token so the frontend can complete registration
    const signupToken = generateToken({
      userId: user.id,
      email: user.email,
    });

    return res.json({
      success: true,
      message: "Email verified!",
      signupToken,
    });
  } catch (error: any) {
    console.error("Signup verify-otp error:", error);
    res.status(500).json({ error: "Failed to verify code." });
  }
});

// ==========================================
// 1c. SIGNUP — Step 3: Complete registration
// ==========================================
router.post("/signup/complete", async (req: Request, res: Response) => {
  try {
    const { signupToken, name, address, phone, password } = req.body;

    if (!signupToken || !name || !address || !phone) {
      return res.status(400).json({ error: "Name, address and phone are required." });
    }

    // Validate phone: 10-digit Indian mobile number
    const cleanPhone = phone.trim().replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return res.status(400).json({ error: "Please enter a valid 10-digit Indian mobile number." });
    }

    // Verify the signup token
    let decoded: { userId: string; email: string };
    try {
      const jwt = await import("jsonwebtoken");
      const secret = process.env.JWT_SECRET || "gstmitra-dev-only-secret";
      decoded = jwt.default.verify(signupToken, secret) as { userId: string; email: string };
    } catch {
      return res.status(401).json({ error: "Session expired. Please start signup again." });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(400).json({ error: "Account not found. Please start again." });
    }

    if (!user.emailVerified) {
      return res.status(400).json({ error: "Email not verified. Please start again." });
    }

    // Hash password if provided
    let hashedPassword: string | null = null;
    if (password && password.length >= 6) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    // Update user with profile info
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: name.trim(),
        address: address.trim(),
        phone: cleanPhone,
        ...(hashedPassword ? { password: hashedPassword } : {}),
      },
    });

    // Generate Mitra ID
    const { assignMitraId } = await import("../lib/mitraId.js");
    const mitraId = await assignMitraId(user.id, name.trim());

    // Create a default Business + BusinessUser link for the onboarding flow
    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: `${name.trim()}'s Business`,
          stateCode: "27",
          stateName: "Maharashtra",
        },
      });

      await tx.businessUser.create({
        data: {
          userId: user.id,
          businessId: business.id,
          role: "OWNER",
        },
      });

      return business;
    });

    // Send welcome email
    sendSignupWelcomeEmail({
      to: user.email,
      name: name.trim(),
      businessName: result.name,
    }).catch((err) => console.error("[Auth] Welcome email error:", err));

    // Generate session JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      businessId: result.id,
    });

    return res.json({
      success: true,
      message: "Account created!",
      mitraId,
      token,
      user: {
        id: user.id,
        name: name.trim(),
        email: user.email,
        mitraId,
      },
      business: result,
    });
  } catch (error: any) {
    console.error("Signup complete error:", error);
    res.status(500).json({ error: "Failed to create account. Please try again." });
  }
});

// Legacy signup endpoint — disabled so nobody can create an account without a Mitra ID
router.post("/signup", async (_req: Request, res: Response) => {
  return res.status(400).json({
    error: "Please use the new signup.",
    code: "LEGACY_SIGNUP_DISABLED",
  });
});

// ==========================================
// 2. VERIFY SIGNUP OTP
// ==========================================
router.post("/verify-signup-otp", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        businesses: {
          include: { business: true },
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "No account found with this email." });
    }

    // Verify OTP
    const verifyRes = await verifyOtp(user.id, "SIGNUP", code);
    if (!verifyRes.success) {
      return res.status(400).json({
        error: verifyRes.error,
        code: verifyRes.code,
        attemptsLeft: verifyRes.attemptsLeft,
      });
    }

    // Mark email as verified
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    });

    const firstBusiness = user.businesses[0]?.business;

    // Send welcome email asynchronously
    sendSignupWelcomeEmail({
      to: user.email,
      name: user.name,
      businessName: firstBusiness?.name || "your business",
    }).catch((err) => console.error("[Auth] Welcome email error:", err));

    // Generate session JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      businessId: firstBusiness?.id,
    });

    return res.json({
      message: "Email verified successfully!",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mitraId: user.mitraId,
      },
      business: firstBusiness || null,
    });
  } catch (error: any) {
    console.error("Verify signup OTP error:", error);
    res.status(500).json({ error: "Failed to verify signup code." });
  }
});

// ==========================================
// 3. LOGIN
// ==========================================
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        businesses: {
          include: { business: true },
        },
      },
    });

    // Same generic error for wrong email or wrong password
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // If user has no password set (skipped during signup), they cannot log in with password
    if (!user.password) {
      return res.status(400).json({
        error: "This account has no password set. Please use OTP login or set a password first.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // If user has not verified their email, send SIGNUP OTP
    if (!user.emailVerified) {
      try {
        await createAndSendOtp(
          { id: user.id, email: user.email, name: user.name },
          "SIGNUP"
        );
      } catch (mailErr: any) {
        return res.status(500).json({ error: mailErr?.message || "Failed to send verification code." });
      }

      return res.json({
        needsOtp: true,
        email: user.email,
        purpose: "SIGNUP",
        message: "Please verify your email first. A verification code has been sent to your email.",
      });
    }

    // Otherwise send LOGIN OTP
    try {
      await createAndSendOtp(
        { id: user.id, email: user.email, name: user.name },
        "LOGIN"
      );
    } catch (mailErr: any) {
      return res.status(500).json({ error: mailErr?.message || "Failed to send login verification code." });
    }

    return res.json({
      needsOtp: true,
      email: user.email,
      purpose: "LOGIN",
      message: "A login verification code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error during login." });
  }
});

const MAX_PASSWORD_ATTEMPTS = 5;
const PASSWORD_LOCK_MINUTES = 15;

// ==========================================
// 3a. LOGIN WITH OTP (email only, no password)
// ==========================================
router.post("/login/otp", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (!user || !user.emailVerified) {
      return res.status(404).json({
        error: "This email is not registered. Sign up?",
        code: "NOT_REGISTERED",
      });
    }

    try {
      await createAndSendOtp(
        { id: user.id, email: user.email, name: user.name },
        "LOGIN"
      );
    } catch (mailErr: any) {
      return res.status(500).json({ error: mailErr?.message || "Failed to send code. Try again." });
    }

    return res.json({
      success: true,
      email: user.email,
      message: "A 6-digit code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Login OTP error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ==========================================
// 3b. LOGIN WITH PASSWORD (direct, no OTP after)
// ==========================================
router.post("/login/password", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { businesses: { include: { business: true } } },
    });

    if (!user || !user.emailVerified) {
      return res.status(404).json({
        error: "This email is not registered. Sign up?",
        code: "NOT_REGISTERED",
      });
    }

    // Check if user has no password set
    if (!user.password) {
      return res.status(400).json({
        error: "No password set. Login with OTP instead",
        code: "NO_PASSWORD",
      });
    }

    // Check if password login is temporarily locked
    if (user.passwordLockedUntil && new Date() < user.passwordLockedUntil) {
      return res.status(429).json({
        error: "Too many tries. Please login with OTP.",
        code: "PASSWORD_LOCKED",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      const newAttempts = (user.failedPasswordAttempts || 0) + 1;

      if (newAttempts >= MAX_PASSWORD_ATTEMPTS) {
        // Lock password login for PASSWORD_LOCK_MINUTES
        const lockedUntil = new Date(Date.now() + PASSWORD_LOCK_MINUTES * 60 * 1000);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedPasswordAttempts: newAttempts, passwordLockedUntil: lockedUntil },
        });
        return res.status(429).json({
          error: "Too many tries. Please login with OTP.",
          code: "PASSWORD_LOCKED",
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { failedPasswordAttempts: newAttempts },
      });

      return res.status(400).json({
        error: "Wrong password. Try again or login with OTP.",
        code: "WRONG_PASSWORD",
        attemptsLeft: MAX_PASSWORD_ATTEMPTS - newAttempts,
      });
    }

    // Password correct — clear failed attempt counters
    await prisma.user.update({
      where: { id: user.id },
      data: { failedPasswordAttempts: 0, passwordLockedUntil: null },
    });

    const firstBusiness = user.businesses[0]?.business;

    // Generate JWT — same as existing behavior
    const token = generateToken({
      userId: user.id,
      email: user.email,
      businessId: firstBusiness?.id,
    });

    // Send login alert email (same as OTP login)
    const clientUserAgent = req.headers["user-agent"] as string;
    sendLoginAlertEmail({
      to: user.email,
      name: user.name,
      ip: clientIp,
      userAgent: clientUserAgent,
    }).catch((err) => console.error("[Auth] Login alert email error:", err));

    let userMitraId = user.mitraId;
    if (!userMitraId) {
      const { assignMitraId } = await import("../lib/mitraId.js");
      userMitraId = await assignMitraId(user.id, user.name || user.email.split("@")[0]);
    }

    return res.json({
      message: "Logged in successfully.",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mitraId: userMitraId,
        phone: user.phone,
        address: user.address,
        pan: user.pan,
      },
      business: firstBusiness || null,
    });
  } catch (error: any) {
    console.error("Password login error:", error);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ==========================================
// 4. VERIFY LOGIN OTP
// ==========================================
router.post("/verify-login-otp", async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        businesses: {
          include: { business: true },
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid email or verification code." });
    }

    // Verify LOGIN OTP
    const verifyRes = await verifyOtp(user.id, "LOGIN", code);
    if (!verifyRes.success) {
      return res.status(400).json({
        error: verifyRes.error,
        code: verifyRes.code,
        attemptsLeft: verifyRes.attemptsLeft,
      });
    }

    // Reset password lockout on successful OTP login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedPasswordAttempts: 0,
        passwordLockedUntil: null,
      },
    });

    const firstBusiness = user.businesses[0]?.business;

    // Generate JWT session
    const token = generateToken({
      userId: user.id,
      email: user.email,
      businessId: firstBusiness?.id,
    });

    // Send login alert email AFTER successful OTP verification
    const clientIp = getClientIp(req);
    const clientUserAgent = req.headers["user-agent"] as string;

    sendLoginAlertEmail({
      to: user.email,
      name: user.name,
      ip: clientIp,
      userAgent: clientUserAgent,
    }).catch((err) => console.error("[Auth] Login alert email error:", err));

    let userMitraId = user.mitraId;
    if (!userMitraId) {
      const { assignMitraId } = await import("../lib/mitraId.js");
      userMitraId = await assignMitraId(user.id, user.name || user.email.split("@")[0]);
    }

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mitraId: userMitraId,
        phone: user.phone,
        address: user.address,
        pan: user.pan,
      },
      business: firstBusiness || null,
    });
  } catch (error: any) {
    console.error("Verify login OTP error:", error);
    res.status(500).json({ error: "Failed to verify login code." });
  }
});

// ==========================================
// 5. RESEND OTP
// ==========================================
router.post("/resend-otp", async (req: Request, res: Response) => {
  try {
    const { email, purpose } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required to resend verification code." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);

    // Rate limiting: max 3 requests per hour per email and per IP
    const emailKey = `resend:email:${cleanEmail}`;
    const ipKey = `resend:ip:${clientIp}`;
    if (!checkRateLimit(emailKey, 3) || !checkRateLimit(ipKey, 3)) {
      return res.status(429).json({
        error: "Too many resend attempts. Please wait an hour before requesting more codes.",
      });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(404).json({ error: "No account found with this email." });
    }

    const otpPurpose: OtpPurpose =
      purpose === "SIGNUP" ? "SIGNUP" : purpose === "RESET_PASSWORD" ? "RESET_PASSWORD" : "LOGIN";

    const resendRes = await resendOtp(
      { id: user.id, email: user.email, name: user.name },
      otpPurpose
    );

    if (!resendRes.success) {
      return res.status(400).json({
        error: resendRes.error,
        code: resendRes.code,
        secondsLeft: resendRes.secondsLeft,
      });
    }

    return res.json({
      success: true,
      message: "A new verification code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Resend OTP error:", error);
    res.status(500).json({ error: "Failed to resend verification code." });
  }
});

// ==========================================
// 6. FORGOT PASSWORD (STEP 2.1)
// ==========================================
router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email address is required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const clientIp = getClientIp(req);

    // Rate limit: max 3 requests per hour per email and per IP
    const ipKey = `fp:ip:${clientIp}`;
    const emailKey = `fp:email:${cleanEmail}`;
    if (!checkRateLimit(ipKey, 3) || !checkRateLimit(emailKey, 3)) {
      return res.status(429).json({
        error: "Too many password reset requests. Please wait an hour before trying again.",
      });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (user) {
      try {
        await createAndSendOtp(
          { id: user.id, email: user.email, name: user.name },
          "RESET_PASSWORD"
        );
      } catch (err: any) {
        console.error("[Auth] Forgot password OTP email failed:", err);
      }
    } else {
      // Uniform timing delay to prevent user enumeration attacks
      await new Promise((r) => setTimeout(r, 350));
    }

    // ALWAYS return the exact same message whether the user exists or not
    return res.json({
      success: true,
      message: "If this email is registered, we sent an OTP.",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process password reset request." });
  }
});

// ==========================================
// 7. VERIFY RESET OTP (STEP 2.2)
// ==========================================
router.post("/verify-reset-otp", async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and verification code are required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });

    if (!user) {
      return res.status(400).json({ error: "Invalid email or verification code." });
    }

    // Verify OTP for RESET_PASSWORD purpose
    const verifyRes = await verifyOtp(user.id, "RESET_PASSWORD", otp);
    if (!verifyRes.success) {
      return res.status(400).json({
        error: verifyRes.error,
        code: verifyRes.code,
        attemptsLeft: verifyRes.attemptsLeft,
      });
    }

    // Generate short-lived single-use reset token (10 min expiry)
    const resetToken = await createResetToken(user.id);

    return res.json({
      success: true,
      message: "Code verified successfully.",
      resetToken,
    });
  } catch (error: any) {
    console.error("Verify reset OTP error:", error);
    res.status(500).json({ error: "Failed to verify reset code." });
  }
});

// ==========================================
// 8. RESET PASSWORD (STEP 2.3)
// ==========================================
router.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({ error: "Email, reset token, and new password are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Validate new password strength: minimum 8 characters, letters and numbers
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long." });
    }
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    if (!hasLetter || !hasNumber) {
      return res.status(400).json({
        error: "Password must contain both letters and numbers.",
      });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user) {
      return res.status(400).json({ error: "Invalid password reset session." });
    }

    // Verify and consume the reset token (single-use)
    const isValidToken = await verifyAndConsumeResetToken(user.id, resetToken);
    if (!isValidToken) {
      return res.status(400).json({
        error: "Invalid or expired password reset session. Please request a new code.",
      });
    }

    // Disallow using the same password as the current one (skip if user has no password set)
    if (user.password) {
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({
          error: "New password cannot be the same as your old password.",
        });
      }
    }

    // Hash with bcrypt (10 rounds)
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const now = new Date();

    // Update user password and set passwordChangedAt = now to invalidate all old sessions
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: now,
        failedPasswordAttempts: 0,
        passwordLockedUntil: null,
      },
    });

    // Delete all OTPs and any remaining reset tokens for this user
    await prisma.otpCode.deleteMany({ where: { userId: user.id } });
    await prisma.resetToken.deleteMany({ where: { userId: user.id } });

    // Send "Your password was changed" security email
    const clientIp = getClientIp(req);
    sendPasswordChangedEmail({
      to: user.email,
      name: user.name,
      ip: clientIp,
    }).catch((err) => console.error("[Auth] Password changed email error:", err));

    return res.json({
      success: true,
      message: "Password changed successfully. Please log in with your new password.",
    });
  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password." });
  }
});

// ==========================================
// 9. CURRENT USER CONTEXT (/me)
// ==========================================
router.get("/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        mitraId: true,
        address: true,
        pan: true,
        emailVerified: true,
      },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    // Accounts created before Mitra IDs existed (or via old signup) may have none
    if (!user.mitraId) {
      const { assignMitraId } = await import("../lib/mitraId.js");
      const newMitraId = await assignMitraId(user.id, user.name || user.email.split("@")[0]);
      user = { ...user, mitraId: newMitraId };
    }
    
    const businessId = req.user?.businessId;
    let business = null;
    if (businessId) {
      business = await prisma.business.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          tradeName: true,
          gstin: true,
          stateCode: true,
          stateName: true,
          businessType: true,
          turnoverRange: true,
          filingFrequency: true,
          registrationType: true,
          address: true,
          pincode: true,
          phone: true,
          email: true,
          bankName: true,
          bankAccount: true,
          bankIfsc: true,
          upiId: true,
          isOnboarded: true,
        },
      });
    }

    res.json({ user, business });
  } catch (error: any) {
    console.error("/me error:", error);
    res.status(500).json({ error: "Failed to fetch user context." });
  }
});

// ==========================================
// 9b. UPDATE USER PROFILE (/profile)
// ==========================================
router.patch("/profile", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { name, address, phone, pan } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Name is required." });
    }

    let cleanPhone: string | null = null;
    if (typeof phone === "string" && phone.trim()) {
      const sanitizedPhone = phone.trim().replace(/\s+/g, "");
      if (!/^[6-9]\d{9}$/.test(sanitizedPhone)) {
        return res.status(400).json({ error: "Please enter a valid 10-digit Indian mobile number." });
      }
      cleanPhone = sanitizedPhone;
    }

    let cleanPan: string | null = null;
    if (typeof pan === "string" && pan.trim()) {
      const sanitizedPan = pan.trim().toUpperCase();
      if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(sanitizedPan)) {
        return res.status(400).json({ error: "Invalid PAN format. Example: ABCDE1234F" });
      }
      cleanPan = sanitizedPan;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name.trim(),
        address: address !== undefined ? (address ? address.trim() : null) : undefined,
        phone: cleanPhone !== undefined ? cleanPhone : undefined,
        pan: cleanPan !== undefined ? cleanPan : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        mitraId: true,
        address: true,
        pan: true,
        emailVerified: true,
      },
    });

    res.json({
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error: any) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

// ==========================================
// 9c. SAVE BUSINESS UPI ID
// ==========================================
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

router.patch("/business/upi", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: "No active business associated with account." });
    }

    const upiId = String(req.body.upiId || "").trim().toLowerCase();
    if (!UPI_REGEX.test(upiId)) {
      return res.status(400).json({ error: "Invalid UPI ID. Example: name@oksbi" });
    }

    const business = await prisma.business.update({
      where: { id: businessId },
      data: { upiId },
      select: { id: true, upiId: true },
    });

    res.json({ message: "UPI ID saved.", business });
  } catch (error: any) {
    console.error("Save UPI error:", error);
    res.status(500).json({ error: "Failed to save UPI ID." });
  }
});

// ==========================================
// 10. ONBOARDING QUESTIONNAIRE
// ==========================================
router.post("/onboarding", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: "No active business associated with account." });
    }

    const {
      businessName,
      tradeName,
      businessType,
      stateCode,
      turnoverRange,
      filingFrequency,
      gstin,
      upiId,
      address,
      pincode,
      phone,
    } = req.body;

    let registrationType = "UNREGISTERED";
    let validStateCode = stateCode || "27";
    let validStateName = INDIAN_STATES.find((s) => s.code === validStateCode)?.name || "Maharashtra";

    if (gstin && gstin.trim() !== "") {
      const gstinVal = validateGstin(gstin);
      if (!gstinVal.isValid) {
        return res.status(400).json({ error: gstinVal.message });
      }
      registrationType = "REGULAR";
      if (gstinVal.stateCode) {
        validStateCode = gstinVal.stateCode;
        validStateName = INDIAN_STATES.find((s) => s.code === validStateCode)?.name || validStateName;
      }
    }

    if (upiId !== undefined && upiId !== null && typeof upiId !== "string") {
      return res.status(400).json({ error: "UPI ID must be a string." });
    }
    const cleanUpiId = typeof upiId === "string" ? upiId.trim().toLowerCase() : "";
    if (cleanUpiId && !UPI_REGEX.test(cleanUpiId)) {
      return res.status(400).json({ error: "Invalid UPI ID. Example: name@oksbi" });
    }

    const updatedBusiness = await prisma.business.update({
      where: { id: businessId },
      data: {
        name: businessName || undefined,
        tradeName: tradeName || null,
        businessType: businessType || "RETAIL",
        stateCode: validStateCode,
        stateName: validStateName,
        turnoverRange: turnoverRange || "40L_TO_15CR",
        filingFrequency: filingFrequency || "MONTHLY",
        gstin: gstin ? gstin.trim().toUpperCase() : null,
        upiId: cleanUpiId || undefined,
        registrationType,
        address: address || null,
        pincode: pincode || null,
        phone: phone || null,
        isOnboarded: true,
      },
    });

    res.json({
      message: "Onboarding completed successfully!",
      business: updatedBusiness,
    });
  } catch (error: any) {
    console.error("Onboarding error:", error);
    res.status(500).json({ error: "Failed to save onboarding response." });
  }
});

export default router;
