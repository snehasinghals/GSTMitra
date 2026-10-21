import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { sendAmendmentReviewEmail } from "./email.js";

const JWT_SECRET = process.env.JWT_SECRET || "gstmitra_amendment_secret_key_2026";
const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:4000/api";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || "snehasinghal132@gmail.com";

export interface OfficialAmendmentItem {
  ruleCode: string;
  ruleName: string;
  category: "RATE" | "BLOCK_ITC" | "DUE_DATE" | "THRESHOLD" | "VALIDATION" | "COURT_ORDER" | "AMENDMENT";
  valueJson: string | object;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
  description: string;
  officialSource?: string;
  sourceQuote?: string;
  confidenceScore?: number; // 0.0 to 1.0
  requiresHumanReview?: boolean;
  reviewReason?: string;
}

/**
 * Generates a signed review token for one-click email actions
 */
export function generateReviewToken(ruleId: string, ruleCode: string, action: "approve" | "reject"): string {
  return jwt.sign(
    {
      ruleId,
      ruleCode,
      action,
      type: "AMENDMENT_REVIEW",
    },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

/**
 * Verifies a review token from email link click
 */
export function verifyReviewToken(token: string): { ruleId: string; ruleCode: string; action: "approve" | "reject" } {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded?.type !== "AMENDMENT_REVIEW") {
      throw new Error("Invalid review token type.");
    }
    return decoded;
  } catch (err: any) {
    throw new Error(`Token verification failed: ${err.message}`);
  }
}

/**
 * Evaluates whether an incoming official amendment is clear or doubtful/ambiguous.
 */
export function evaluateAmendmentCertainty(item: OfficialAmendmentItem): {
  isDoubtful: boolean;
  reason: string;
} {
  // If explicitly requested by caller
  if (item.requiresHumanReview) {
    return {
      isDoubtful: true,
      reason: item.reviewReason || "Flagged for manual compliance review.",
    };
  }

  // Court orders are judicial interpretations and inherently require human verification
  if (item.category === "COURT_ORDER") {
    return {
      isDoubtful: true,
      reason: "Court Order / Judicial Ruling: Legal interpretations usually require legal scrutiny before impacting business validations.",
    };
  }

  // Low confidence score
  if (typeof item.confidenceScore === "number" && item.confidenceScore < 0.85) {
    return {
      isDoubtful: true,
      reason: `Moderate confidence score (${Math.round(item.confidenceScore * 100)}%). Ambiguous statutory phrasing detected in source notification.`,
    };
  }

  // Major rate changes or deletions
  if (item.category === "RATE" && !item.officialSource?.includes("cbic")) {
    return {
      isDoubtful: true,
      reason: "Tax rate adjustment without verified CBIC gazette notification citation.",
    };
  }

  return {
    isDoubtful: false,
    reason: "Clear statutory notification from official source.",
  };
}

import { simplifyRuleWithAi } from "./ruleAiSimplifier.js";

/**
 * Ingests an incoming amendment from official sources (CBIC, GST Council, Courts).
 * If unambiguous -> auto-activates immediately.
 * If doubtful -> saves as PENDING_REVIEW and sends one-click email to admin for approval.
 */
export async function processIncomingOfficialAmendment(
  item: OfficialAmendmentItem,
  recipientEmail: string = ADMIN_EMAIL
) {
  const effFrom = new Date(item.effectiveFrom);
  const effTo = item.effectiveTo ? new Date(item.effectiveTo) : null;

  // Run AI plain-language simplifier ONCE at ingestion time
  const aiResult = await simplifyRuleWithAi({
    ruleCode: item.ruleCode,
    ruleName: item.ruleName,
    category: item.category,
    valueJson: item.valueJson,
    description: item.description,
    officialSource: item.officialSource,
    sourceQuote: item.sourceQuote,
  });

  let parsedVal: any = {};
  try {
    parsedVal = typeof item.valueJson === "string" ? JSON.parse(item.valueJson) : { ...item.valueJson };
  } catch {
    parsedVal = { raw: item.valueJson };
  }
  parsedVal.aiExplanation = {
    simpleTitle: aiResult.simpleTitle,
    simpleSummary: aiResult.simpleSummary,
    whyThisRuleExists: aiResult.whyThisRuleExists,
    howToComply: aiResult.howToComply,
    keySpecs: aiResult.keySpecs,
    isAiGenerated: aiResult.isAiGenerated,
  };
  const jsonStr = JSON.stringify(parsedVal);
  const finalTitle = aiResult.simpleTitle || item.ruleName;
  const finalDesc = aiResult.simpleSummary || item.description;

  const { isDoubtful, reason } = evaluateAmendmentCertainty(item);
  const initialStatus = isDoubtful ? "PENDING_REVIEW" : "ACTIVE";

  // Upsert rule into DB
  const existing = await prisma.gstRule.findUnique({
    where: { ruleCode: item.ruleCode },
  });

  let ruleId: string;

  if (existing) {
    ruleId = existing.id;
    await prisma.gstRule.update({
      where: { id: existing.id },
      data: {
        category: item.category,
        ruleName: finalTitle,
        valueJson: jsonStr,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        description: finalDesc,
        officialSource: item.officialSource,
        sourceQuote: item.sourceQuote,
        status: initialStatus,
      },
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId: existing.id,
        action: initialStatus === "PENDING_REVIEW" ? "PENDING_REVIEW" : "UPDATED",
        details: isDoubtful
          ? `Rule update flagged as doubtful: ${reason}. Awaiting one-click email review.`
          : `Rule auto-updated from official source: ${item.officialSource || "Official feed"}`,
        sourceUrl: item.officialSource,
        performedBy: "AUTO_WATCHER",
      },
    });
  } else {
    const created = await prisma.gstRule.create({
      data: {
        category: item.category,
        ruleCode: item.ruleCode,
        ruleName: finalTitle,
        valueJson: jsonStr,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        description: finalDesc,
        officialSource: item.officialSource,
        sourceQuote: item.sourceQuote,
        status: initialStatus,
      },
    });
    ruleId = created.id;

    await prisma.gstRuleAudit.create({
      data: {
        ruleId: created.id,
        action: initialStatus === "PENDING_REVIEW" ? "PENDING_REVIEW" : "CREATED",
        details: isDoubtful
          ? `New amendment flagged as doubtful: ${reason}. Awaiting one-click email review.`
          : `New rule auto-ingested from official source.`,
        sourceUrl: item.officialSource,
        performedBy: "AUTO_WATCHER",
      },
    });
  }

  // If doubtful, send one-click review email
  if (isDoubtful) {
    const approveToken = generateReviewToken(ruleId, item.ruleCode, "approve");
    const rejectToken = generateReviewToken(ruleId, item.ruleCode, "reject");

    const approveUrl = `${API_BASE_URL}/rules/review-action?token=${encodeURIComponent(approveToken)}&action=approve`;
    const rejectUrl = `${API_BASE_URL}/rules/review-action?token=${encodeURIComponent(rejectToken)}&action=reject`;

    await sendAmendmentReviewEmail({
      to: recipientEmail,
      ruleCode: item.ruleCode,
      ruleName: item.ruleName,
      category: item.category,
      description: item.description,
      officialSource: item.officialSource,
      reasonForReview: reason,
      approveUrl,
      rejectUrl,
    });

    return {
      status: "PENDING_REVIEW",
      ruleId,
      ruleCode: item.ruleCode,
      message: "Amendment stored with status PENDING_REVIEW. Review email dispatched with 1-click Approve/Reject links.",
      reason,
      emailSentTo: recipientEmail,
    };
  }

  return {
    status: "ACTIVE",
    ruleId,
    ruleCode: item.ruleCode,
    message: "Amendment was clear and unambiguous. Auto-activated in database immediately.",
  };
}

/**
 * Handles the one-click action clicked by human admin from their email
 */
export async function handleOneClickReviewAction(token: string, actionRequested: string) {
  const { ruleId, ruleCode, action } = verifyReviewToken(token);

  if (action !== actionRequested) {
    throw new Error("Action mismatch between URL and signed token.");
  }

  const rule = await prisma.gstRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule) {
    throw new Error(`Rule with ID ${ruleId} not found in database.`);
  }

  if (action === "approve") {
    const updated = await prisma.gstRule.update({
      where: { id: ruleId },
      data: { status: "ACTIVE" },
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId,
        action: "APPROVED_BY_HUMAN",
        details: `Rule approved and activated via one-click email link by admin.`,
        performedBy: "ADMIN_ONE_CLICK_EMAIL",
      },
    });

    return {
      success: true,
      action: "APPROVED",
      rule: updated,
      htmlMessage: `
        <div style="font-family:sans-serif;text-align:center;padding:48px 16px;">
          <h1 style="color:#16a34a;font-size:28px;">✅ Rule Successfully Approved &amp; Activated!</h1>
          <p style="font-size:16px;color:#334155;">
            Rule <strong>${rule.ruleName}</strong> (<code>${ruleCode}</code>) is now <strong>ACTIVE</strong> in the GSTMitra database.
          </p>
          <p style="color:#64748b;font-size:14px;">All future sales invoices, purchase bills, and GSTR returns will now validate against this rule.</p>
        </div>
      `,
    };
  } else {
    const updated = await prisma.gstRule.update({
      where: { id: ruleId },
      data: { status: "REJECTED" },
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId,
        action: "REJECTED_BY_HUMAN",
        details: `Rule rejected via one-click email link by admin.`,
        performedBy: "ADMIN_ONE_CLICK_EMAIL",
      },
    });

    return {
      success: true,
      action: "REJECTED",
      rule: updated,
      htmlMessage: `
        <div style="font-family:sans-serif;text-align:center;padding:48px 16px;">
          <h1 style="color:#dc2626;font-size:28px;">❌ Rule Rejected</h1>
          <p style="font-size:16px;color:#334155;">
            Rule <strong>${rule.ruleName}</strong> (<code>${ruleCode}</code>) was marked as <strong>REJECTED</strong>.
          </p>
          <p style="color:#64748b;font-size:14px;">It will not affect any invoicing, billing, or File GST in GSTMitra.</p>
        </div>
      `,
    };
  }
}

