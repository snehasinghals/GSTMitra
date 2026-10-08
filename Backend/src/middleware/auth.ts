import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    businessId?: string;
  };
}

// Read lazily (at call time) so it works regardless of when dotenv loads .env.
// In production the secret MUST come from the environment: a secret hardcoded in source
// means anyone who sees the code can forge a login token for any user.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production.");
  }
  console.warn("JWT_SECRET not set - using an insecure development-only secret.");
  return "gstmitra-dev-only-secret";
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized. Missing or invalid token." });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; email: string; businessId?: string };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized. Invalid or expired token." });
  }
}

export function generateToken(payload: { userId: string; email: string; businessId?: string }) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "30d" });
}