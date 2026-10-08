import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

// Get active rules effective for a specific invoice date (Section 3.1 Rules as Data)
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeHistory = req.query.includeHistory === "true";
    const invoiceDateParam = typeof req.query.invoiceDate === "string" ? req.query.invoiceDate : undefined;
    const invoiceDate = invoiceDateParam ? new Date(invoiceDateParam) : new Date();
    const category = typeof req.query.category === "string" ? req.query.category : undefined;

    if (invoiceDateParam && Number.isNaN(invoiceDate.getTime())) {
      return res.status(400).json({ error: "invoiceDate must be a valid date." });
    }

    const whereClause = includeHistory
      ? { status: { in: ["ACTIVE", "SUPERSEDED"] } }
      : {
          status: { in: ["ACTIVE", "SUPERSEDED"] },
          effectiveFrom: { lte: invoiceDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: invoiceDate } }],
        };

    if (category) {
      Object.assign(whereClause, { category });
    }

    const rules = await prisma.gstRule.findMany({
      where: whereClause,
      include: {
        audits: {
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: { effectiveFrom: "desc" },
    });

    res.json({
      queryDate: invoiceDate.toISOString(),
      rulesCount: rules.length,
      autoApplyEnabled: process.env.AUTO_APPLY !== "false",
      rules,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch GST rules." });
  }
});

// Audit trail endpoint (Section 3.5 Safety layers)
router.get("/audit-logs", authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const auditLogs = await prisma.gstRuleAudit.findMany({
      include: { rule: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(auditLogs);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch audit logs." });
  }
});

export default router;
