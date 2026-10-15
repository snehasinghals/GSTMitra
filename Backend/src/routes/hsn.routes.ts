import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/hsn/suggest?q=<text>&type=GOODS|SERVICE
 * Matches rows where EVERY word (>= 2 letters) appears in description or keywords.
 * Ranking:
 *  1. Keywords match first
 *  2. 4-digit codes before 6-digit codes (or smaller digits first)
 *  3. Shorter description
 * Returns top 5 as { code, description, digits }
 */
router.get("/suggest", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawQ = String(req.query.q || "").trim();
    if (rawQ.length < 2) {
      return res.json([]);
    }

    const typeParam = String(req.query.type || "GOODS").toUpperCase();
    const type = typeParam === "SERVICE" ? "SERVICE" : "GOODS";

    // Split q into words (lowercase, ignore words shorter than 2 letters)
    const words = rawQ
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length >= 2);

    if (words.length === 0) {
      // If user typed something like a single letter or non-alphanumeric, check if rawQ itself is >= 2 digits
      const digitsOnly = rawQ.replace(/[^0-9]/g, "");
      if (digitsOnly.length >= 2) {
        words.push(digitsOnly);
      } else {
        return res.json([]);
      }
    }

    // Every word must appear in description or keywords (or code if user typed digits)
    const whereConditions = words.map((word) => ({
      OR: [
        { description: { contains: word, mode: "insensitive" as const } },
        { keywords: { contains: word, mode: "insensitive" as const } },
        { code: { startsWith: word } },
      ],
    }));

    const candidates = await prisma.hsnCode.findMany({
      where: {
        type,
        AND: whereConditions,
      },
      select: {
        code: true,
        description: true,
        keywords: true,
        digits: true,
      },
      take: 50, // Get a reasonable candidate pool to rank
    });

    if (candidates.length === 0) {
      return res.json([]);
    }

    // Rank candidates:
    // 1. Keywords match (any of the query words appear in keywords)
    // 2. 4-digit codes before 6-digit codes (ascending digits)
    // 3. Shorter description
    candidates.sort((a, b) => {
      const aKw = (a.keywords || "").toLowerCase();
      const bKw = (b.keywords || "").toLowerCase();

      const aKwMatch = words.some((w) => aKw.includes(w));
      const bKwMatch = words.some((w) => bKw.includes(w));

      if (aKwMatch && !bKwMatch) return -1;
      if (!aKwMatch && bKwMatch) return 1;

      // 4-digit codes before 6-digit codes
      if (a.digits !== b.digits) {
        return a.digits - b.digits;
      }

      // Shorter description
      return a.description.length - b.description.length;
    });

    // Return top 5 as { code, description, digits }
    const top5 = candidates.slice(0, 5).map(({ code, description, digits }) => ({
      code,
      description,
      digits,
    }));

    return res.json(top5);
  } catch (error: any) {
    console.error("HSN suggest error:", error);
    return res.status(500).json({ error: "Failed to suggest HSN codes." });
  }
});

export default router;

