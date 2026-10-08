import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";
import { generateToken, authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { validateGstin, INDIAN_STATES } from "../lib/constants";

const router = Router();

// Signup
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { email, password, name, businessName } = req.body;

    if (!email || !password || !name || !businessName) {
      return res.status(400).json({ error: "Email, password, name, and business name are required." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create User & Business in transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
        },
      });

      const business = await tx.business.create({
        data: {
          name: businessName,
          stateCode: "27", // Default Maharashtra, to be updated during onboarding
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

    const token = generateToken({
      userId: result.user.id,
      email: result.user.email,
      businessId: result.business.id,
    });

    res.json({
      message: "Signup successful",
      token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
      },
      business: result.business,
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Internal server error during signup." });
  }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        businesses: {
          include: { business: true },
        },
      },
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const firstBusiness = user.businesses[0]?.business;

    const token = generateToken({
      userId: user.id,
      email: user.email,
      businessId: firstBusiness?.id,
    });

    res.json({
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
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error during login." });
  }
});

// Current User Details
router.get("/me", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true },
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

// Onboarding Questionnaire (Section 1.1)
router.post("/onboarding", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: "No active business associated with account." });
    }

    const {
      businessName,
      tradeName,
      businessType, // RETAIL, WHOLESALE, SERVICES, FREELANCER, MANUFACTURING
      stateCode,
      turnoverRange, // BELOW_15L, 15L_TO_40L, 40L_TO_15CR, ABOVE_15CR
      filingFrequency, // MONTHLY, QUARTERLY
      gstin,
      address,
      pincode,
      phone,
    } = req.body;

    // Validate GSTIN if provided
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
