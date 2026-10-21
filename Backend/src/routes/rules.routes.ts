import { Router, Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { syncLatestRulesAndAmendments, ingestCustomAmendment } from "../lib/ruleUpdater.js";
import { validateSalesInvoiceAgainstRules, validatePurchaseBillAgainstRules } from "../lib/ruleEngine.js";
import { handleOneClickReviewAction, processIncomingOfficialAmendment } from "../lib/amendmentAutoWatcher.js";

const router = Router();

// One-click email review action for doubtful amendments (public, cryptographically verified via JWT token)
router.get("/review-action", async (req, res: Response) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;

    if (!token || !action) {
      return res.status(400).send(`
        <div style="font-family:sans-serif;text-align:center;padding:48px 16px;">
          <h2 style="color:#dc2626;">Invalid Review Link</h2>
          <p style="color:#475569;">Missing security verification token or action parameter.</p>
        </div>
      `);
    }

    const result = await handleOneClickReviewAction(token, action);
    res.setHeader("Content-Type", "text/html");
    return res.send(result.htmlMessage);
  } catch (error: any) {
    console.error("Review action error:", error);
    res.setHeader("Content-Type", "text/html");
    return res.status(400).send(`
      <div style="font-family:sans-serif;text-align:center;padding:48px 16px;">
        <h2 style="color:#dc2626;">Action Failed</h2>
        <p style="color:#475569;">${error.message || "Could not process this review link. It may be expired or already used."}</p>
      </div>
    `);
  }
});

// Auto-feed endpoint for official updates & court orders (Webhook / Background Job)
router.post("/auto-feed", async (req, res: Response) => {
  try {
    const item = req.body;
    if (!item?.ruleCode || !item?.ruleName || !item?.category || !item?.effectiveFrom) {
      return res.status(400).json({ error: "Invalid amendment feed format." });
    }

    const recipientEmail = typeof req.body.recipientEmail === "string" ? req.body.recipientEmail : undefined;
    const result = await processIncomingOfficialAmendment(item, recipientEmail);
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Auto-feed error:", error);
    res.status(500).json({ error: error.message || "Failed to process amendment feed." });
  }
});

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

    const whereClause: any = includeHistory
      ? { status: { in: ["ACTIVE", "SUPERSEDED", "UPCOMING"] } }
      : {
          status: { in: ["ACTIVE", "SUPERSEDED", "UPCOMING"] },
          effectiveFrom: { lte: invoiceDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: invoiceDate } }],
        };

    if (category && category !== "ALL") {
      whereClause.category = category;
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

// Synchronize rules from latest official amendments and court orders
router.post("/sync-amendments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const performedBy = req.user?.email || "SYSTEM";
    const result = await syncLatestRulesAndAmendments(performedBy);
    res.json({
      success: true,
      message: `Rules synchronized successfully. Inserted: ${result.inserted}, Updated: ${result.updated}, Total: ${result.total}`,
      data: result,
    });
  } catch (error: any) {
    console.error("Sync amendments error:", error);
    res.status(500).json({ error: "Failed to synchronize amendments." });
  }
});

// Called automatically by Vercel Cron every midnight (GET + secret, no login)
router.get("/sync-amendments", async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await syncLatestRulesAndAmendments("VERCEL_CRON");
    res.json({
      success: true,
      message: `Cron sync done. Inserted: ${result.inserted}, Updated: ${result.updated}, Total: ${result.total}`,
      data: result,
    });
  } catch (error: any) {
    console.error("Cron sync error:", error);
    res.status(500).json({ error: "Cron sync failed." });
  }
});

// Ingest a new or updated amendment / court order dynamically
router.post("/ingest-amendment", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      ruleCode,
      ruleName,
      category,
      valueJson,
      effectiveFrom,
      effectiveTo,
      description,
      officialSource,
      sourceQuote,
    } = req.body;

    if (!ruleCode || !ruleName || !category || !valueJson || !effectiveFrom || !description) {
      return res.status(400).json({
        error: "Missing required fields: ruleCode, ruleName, category, valueJson, effectiveFrom, description.",
      });
    }

    const performedBy = req.user?.email || "USER";
    const result = await ingestCustomAmendment({
      ruleCode,
      ruleName,
      category,
      valueJson,
      effectiveFrom,
      effectiveTo,
      description,
      officialSource,
      sourceQuote,
      performedBy,
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Ingest amendment error:", error);
    res.status(500).json({ error: "Failed to ingest amendment into rules." });
  }
});

// Create a custom rule directly
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { category, ruleCode, ruleName, valueJson, effectiveFrom, effectiveTo, description, officialSource, sourceQuote } = req.body;

    if (!category || !ruleCode || !ruleName || !valueJson || !effectiveFrom || !description) {
      return res.status(400).json({ error: "Missing required rule attributes." });
    }

    const rule = await prisma.gstRule.create({
      data: {
        category,
        ruleCode,
        ruleName,
        valueJson: typeof valueJson === "string" ? valueJson : JSON.stringify(valueJson),
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        description,
        officialSource,
        sourceQuote,
        status: "ACTIVE",
      },
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId: rule.id,
        action: "CREATED",
        details: `Rule ${ruleCode} added by user`,
        performedBy: req.user?.email || "USER",
      },
    });

    res.json(rule);
  } catch (error: any) {
    console.error("Create rule error:", error);
    res.status(500).json({ error: error.message || "Failed to create rule." });
  }
});

// Update a rule directly
router.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { ruleName, valueJson, effectiveFrom, effectiveTo, description, officialSource, sourceQuote, status } = req.body;

    const dataToUpdate: any = {};
    if (ruleName !== undefined) dataToUpdate.ruleName = ruleName;
    if (valueJson !== undefined) dataToUpdate.valueJson = typeof valueJson === "string" ? valueJson : JSON.stringify(valueJson);
    if (effectiveFrom !== undefined) dataToUpdate.effectiveFrom = new Date(effectiveFrom);
    if (effectiveTo !== undefined) dataToUpdate.effectiveTo = effectiveTo ? new Date(effectiveTo) : null;
    if (description !== undefined) dataToUpdate.description = description;
    if (officialSource !== undefined) dataToUpdate.officialSource = officialSource;
    if (sourceQuote !== undefined) dataToUpdate.sourceQuote = sourceQuote;
    if (status !== undefined) dataToUpdate.status = status;

    const updated = await prisma.gstRule.update({
      where: { id: id as string },
      data: dataToUpdate,
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId: updated.id,
        action: "UPDATED",
        details: `Rule ${updated.ruleCode} modified`,
        performedBy: req.user?.email || "USER",
      },
    });

    res.json(updated);
  } catch (error: any) {
    console.error("Update rule error:", error);
    res.status(500).json({ error: error.message || "Failed to update rule." });
  }
});

// Pre-validate a sales invoice draft against active DB rules
router.post("/validate-invoice", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business found." });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business not found." });

    const { invoice, Items, customer } = req.body;
    if (!invoice || !Items || !Array.isArray(Items)) {
      return res.status(400).json({ error: "Invalid payload: invoice and Items array are required." });
    }

    const violations = await validateSalesInvoiceAgainstRules({
      business,
      invoice,
      Items,
      customer,
    });

    const errors = violations.filter((v) => v.severity === "error").length;
    const warnings = violations.filter((v) => v.severity === "warning").length;

    res.json({
      isValid: errors === 0,
      counts: { errors, warnings },
      violations,
    });
  } catch (error: any) {
    console.error("Validate invoice error:", error);
    res.status(500).json({ error: "Failed to validate invoice against rules." });
  }
});

// Pre-validate a purchase bill draft against active DB rules
router.post("/validate-bill", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business found." });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business not found." });

    const { bill, Items, vendor } = req.body;
    if (!bill || !Items || !Array.isArray(Items)) {
      return res.status(400).json({ error: "Invalid payload: bill and Items array are required." });
    }

    const violations = await validatePurchaseBillAgainstRules({
      business,
      bill,
      Items,
      vendor,
    });

    const errors = violations.filter((v) => v.severity === "error").length;
    const warnings = violations.filter((v) => v.severity === "warning").length;

    res.json({
      isValid: errors === 0,
      counts: { errors, warnings },
      violations,
    });
  } catch (error: any) {
    console.error("Validate bill error:", error);
    res.status(500).json({ error: "Failed to validate purchase bill against rules." });
  }
});

export default router;
