import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/db.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    businessId?: string;
  };
}

// Read lazily (at call time) so it works regardless of when dotenv loads .env.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production.");
  }
  console.warn("JWT_SECRET not set - using an insecure development-only secret.");
  return "gstmitra-dev-only-secret";
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Missing or invalid token." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      email: string;
      businessId?: string;
      iat?: number;
    };

    // If password was changed after this token was issued, invalidate session
    if (decoded.userId && decoded.iat) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { passwordChangedAt: true },
      });

      if (user?.passwordChangedAt) {
        const passwordChangedSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
        // If token issued before password change, reject
        if (decoded.iat < passwordChangedSec) {
          return res.status(401).json({
            error: "Session expired due to a recent password change. Please log in again.",
          });
        }
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
}

export async function requireShop(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let businessId = req.user?.businessId;

    // If businessId is not in the token payload, look up user's active business
    if (!businessId && req.user?.userId) {
      const bu = await prisma.businessUser.findFirst({
        where: { userId: req.user.userId },
        select: { businessId: true },
      });
      businessId = bu?.businessId;
      if (businessId && req.user) {
        req.user.businessId = businessId;
      }
    }

    if (!businessId) {
      return res.status(403).json({
        code: "SHOP_NOT_STARTED",
        message: "Start your shop to use this feature.",
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { isOnboarded: true },
    });

    if (!business || !business.isOnboarded) {
      return res.status(403).json({
        code: "SHOP_NOT_STARTED",
        message: "Start your shop to use this feature.",
      });
    }

    next();
  } catch (error) {
    console.error("requireShop middleware error:", error);
    return res.status(500).json({ error: "Failed to verify shop status." });
  }
}

export function generateToken(payload: { userId: string; email: string; businessId?: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "30d" });
}