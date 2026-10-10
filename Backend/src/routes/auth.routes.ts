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
// 1. SIGNUP
// ==========================================
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, name, businessName } = req.body;

    if (!email || !password || !name || !businessName) {
      return res.status(400).json({ error: "Email, password, name, and business name are required." });
    }

    const cleanEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      if (existingUser.emailVerified) {
        return res.status(400).json({ error: "An account with this email already exists." });
      }
      // If user exists but is unverified, send a fresh SIGNUP OTP
      try {
        await createAndSendOtp(
          { id: existingUser.id, email: existingUser.email, name: existingUser.name },
          "SIGNUP"
        );
        return res.json({
          needsOtp: true,
          email: existingUser.email,
          purpose: "SIGNUP",
          message: "Account already exists but unverified. A verification code has been sent to your email.",
        });
      } catch (mailErr: any) {
        return res.status(500).json({ error: mailErr?.message || "Failed to send verification email." });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User with emailVerified = null & Business in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: cleanEmail,
          password: hashedPassword,
          name: name.trim(),
          emailVerified: null,
        },
      });

      const business = await tx.business.create({
        data: {
          name: businessName.trim(),
          stateCode: "27", // Default Maharashtra, updated during onboarding
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

      return { user, business };
    });

    // Send SIGNUP OTP to verify email (do NOT log in yet)
    try {
      await createAndSendOtp(
        { id: result.user.id, email: result.user.email, name: result.user.name },
        "SIGNUP"
      );
    } catch (mailErr: any) {
      console.error("[Auth] Signup OTP email failed:", mailErr);
      return res.status(500).json({
        error: "Account created, but failed to send verification email. Please click resend code.",
        needsOtp: true,
        email: result.user.email,
        purpose: "SIGNUP",
      });
    }

    return res.json({
      needsOtp: true,
      email: result.user.email,
      purpose: "SIGNUP",
      message: "Registration successful. A 6-digit verification code has been sent to your email.",
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error during signup." });
  }
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

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
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

    // Disallow using the same password as the current one
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        error: "New password cannot be the same as your old password.",
      });
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, emailVerified: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

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
          isOnboarded: true,
        },
      });
    }

    res.json({ user, business });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch user context." });
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
