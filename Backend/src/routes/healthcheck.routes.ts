import { Router, Response } from "express";
import { prisma, withDatabaseRetry } from "../lib/db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { validateGstin, INDIAN_STATES } from "../lib/constants";

const router = Router();

export interface HealthCheckItem {
  id: string;
  category: "GSTIN" | "TAX_CALC" | "SUPPLY_TYPE" | "HSN_RATE" | "DUPLICATE" | "MANDATORY" | "GSTR1_VS_3B" | "ITC";
  severity: "MUST_FIX" | "SHOULD_CHECK" | "OK";
  title: string;
  issue: string;
  reason: string;
  recommendation: string;
  affectedEntityId?: string;
  affectedEntityNumber?: string;
}

router.get("/run", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const period = (req.query.period as string) || "102026"; // MMYYYY e.g. "102026"
    const month = parseInt(period.substring(0, 2), 10);
    const year = parseInt(period.substring(2, 6), 10);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const business = await withDatabaseRetry(
      () => prisma.business.findUnique({ where: { id: businessId } }),
      "health check business lookup"
    );
    if (!business) return res.status(404).json({ error: "Business profile not found" });

    const results: HealthCheckItem[] = [];

    // 1. Business GSTIN validation
    if (business.gstin) {
      const gstinVal = validateGstin(business.gstin);
      if (!gstinVal.isValid) {
        results.push({
          id: `biz-gstin-err`,
          category: "GSTIN",
          severity: "MUST_FIX",
          title: "Invalid Business GSTIN",
          issue: `Your business GSTIN '${business.gstin}' has an invalid format.`,
          reason: gstinVal.message || "Invalid format",
          recommendation: "Go to Business Settings and correct your 15-character GSTIN.",
        });
      } else if (gstinVal.stateCode !== business.stateCode) {
        results.push({
          id: `biz-gstin-state-mismatch`,
          category: "GSTIN",
          severity: "MUST_FIX",
          title: "Business State Code Mismatch",
          issue: `Your GSTIN state code '${gstinVal.stateCode}' does not match your registered state '${business.stateName}' (${business.stateCode}).`,
          reason: "State code mismatch can cause incorrect tax calculations.",
          recommendation: `Update your business state to '${INDIAN_STATES.find(s => s.code === gstinVal.stateCode)?.name}'.`,
        });
      }
    } else if (business.registrationType === "REGULAR") {
      results.push({
        id: `biz-gstin-missing`,
        category: "MANDATORY",
        severity: "MUST_FIX",
        title: "Missing Business GSTIN",
        issue: "Your business is marked as Regular GST, but GSTIN is missing.",
        reason: "GSTIN is mandatory for filing GSTR-1 and GSTR-3B.",
        recommendation: "Enter your 15-digit GSTIN in Business Settings.",
      });
    }

    const salesInvoices = await withDatabaseRetry(
      () =>
        prisma.salesInvoice.findMany({
          where: {
            businessId,
            invoiceDate: { gte: startDate, lte: endDate },
            status: { not: "CANCELLED" },
          },
          select: {
            id: true,
            invoiceNumber: true,
            placeOfSupply: true,
            totalCgst: true,
            totalSgst: true,
            totalIgst: true,
            customer: { select: { name: true, gstin: true } },
            items: {
              select: {
                id: true,
                description: true,
                hsnSacCode: true,
                taxableValue: true,
                cgstAmount: true,
                sgstAmount: true,
                igstAmount: true,
              },
            },
          },
        }),
      "health check sales lookup"
    );

    // 2. Invoice Duplicate & Format Checks
    const seenInvoiceNumbers = new Map<string, string>();

    for (const inv of salesInvoices) {
      const numberKey = inv.invoiceNumber.trim();
      const firstId = seenInvoiceNumbers.get(numberKey);
      if (firstId && firstId !== inv.id) {
        results.push({
          id: `dup-inv-${inv.id}`,
          category: "DUPLICATE",
          severity: "MUST_FIX",
          title: `Duplicate Invoice Number: ${inv.invoiceNumber}`,
          issue: `Invoice number '${inv.invoiceNumber}' is used multiple times in this period.`,
          reason: "GST portal rejects return uploads with duplicate invoice numbers.",
          recommendation: `Edit invoice ID [${inv.invoiceNumber}] to have a unique sequence number.`,
          affectedEntityId: inv.id,
          affectedEntityNumber: inv.invoiceNumber,
        });
      } else {
        seenInvoiceNumbers.set(numberKey, inv.id);
      }

      // Customer GSTIN format check
      if (inv.customer.gstin) {
        const custGstinVal = validateGstin(inv.customer.gstin);
        if (!custGstinVal.isValid) {
          results.push({
            id: `cust-gstin-${inv.id}`,
            category: "GSTIN",
            severity: "MUST_FIX",
            title: `Invalid Customer GSTIN on Invoice ${inv.invoiceNumber}`,
            issue: `Customer '${inv.customer.name}' has invalid GSTIN '${inv.customer.gstin}'.`,
            reason: custGstinVal.message || "Invalid format",
            recommendation: `Fix GSTIN for customer '${inv.customer.name}' in Customers menu.`,
            affectedEntityId: inv.id,
            affectedEntityNumber: inv.invoiceNumber,
          });
        }
      }

      // Check Place of supply vs Tax type
      const isIntraState = business.stateCode === inv.placeOfSupply;
      if (isIntraState && inv.totalIgst > 0) {
        results.push({
          id: `tax-type-mismatch-${inv.id}`,
          category: "SUPPLY_TYPE",
          severity: "MUST_FIX",
          title: `Wrong Tax Type on Invoice ${inv.invoiceNumber}`,
          issue: `Invoice place of supply is intra-state (${inv.placeOfSupply}), but IGST is charged.`,
          reason: "Intra-state sales must be charged CGST + SGST instead of IGST.",
          recommendation: "Edit invoice to apply CGST + SGST.",
          affectedEntityId: inv.id,
          affectedEntityNumber: inv.invoiceNumber,
        });
      } else if (!isIntraState && (inv.totalCgst > 0 || inv.totalSgst > 0)) {
        results.push({
          id: `tax-type-interstate-${inv.id}`,
          category: "SUPPLY_TYPE",
          severity: "MUST_FIX",
          title: `Wrong Tax Type on Interstate Invoice ${inv.invoiceNumber}`,
          issue: `Invoice place of supply is interstate (${inv.placeOfSupply}), but CGST/SGST is charged.`,
          reason: "Interstate sales must be charged IGST.",
          recommendation: "Edit invoice to apply IGST.",
          affectedEntityId: inv.id,
          affectedEntityNumber: inv.invoiceNumber,
        });
      }

      // Math Check: Taxable Value * Rate = Tax
      let calculatedTaxable = 0;
      let calculatedTax = 0;
      inv.items.forEach((item) => {
        calculatedTaxable += item.taxableValue;
        calculatedTax += item.cgstAmount + item.sgstAmount + item.igstAmount;

        // Check HSN code present
        if (!item.hsnSacCode || item.hsnSacCode.trim() === "") {
          results.push({
            id: `missing-hsn-${item.id}`,
            category: "HSN_RATE",
            severity: "MUST_FIX",
            title: `Missing HSN/SAC on Invoice ${inv.invoiceNumber}`,
            issue: `Item '${item.description}' has no HSN/SAC code assigned.`,
            reason: "HSN/SAC summary is mandatory for GSTR-1 filing.",
            recommendation: "Assign a valid 4/6-digit HSN/SAC code.",
            affectedEntityId: inv.id,
            affectedEntityNumber: inv.invoiceNumber,
          });
        }
      });

      const actualTax = inv.totalCgst + inv.totalSgst + inv.totalIgst;
      if (Math.abs(calculatedTax - actualTax) > 1.0) {
        results.push({
          id: `tax-math-err-${inv.id}`,
          category: "TAX_CALC",
          severity: "MUST_FIX",
          title: `Tax Discrepancy on Invoice ${inv.invoiceNumber}`,
          issue: `Total tax ₹${actualTax.toFixed(2)} does not match item breakdown ₹${calculatedTax.toFixed(2)}.`,
          reason: "Rounding or line item math mismatch.",
          recommendation: "Re-save invoice to recompute item taxes.",
          affectedEntityId: inv.id,
          affectedEntityNumber: inv.invoiceNumber,
        });
      }
    }

    // Fetch Purchase Bills in period
    const purchaseBills = await withDatabaseRetry(
      () =>
        prisma.purchaseBill.findMany({
          where: {
            businessId,
            billDate: { gte: startDate, lte: endDate },
          },
          select: {
            id: true,
            billNumber: true,
            isItcEligible: true,
            vendor: { select: { name: true, vendorType: true } },
          },
        }),
      "health check purchase lookup"
    );

    for (const bill of purchaseBills) {
      if (bill.isItcEligible && bill.vendor.vendorType === "UNREGISTERED") {
        results.push({
          id: `unreg-itc-${bill.id}`,
          category: "ITC",
          severity: "SHOULD_CHECK",
          title: `ITC Claimed on Unregistered Vendor: ${bill.billNumber}`,
          issue: `Bill '${bill.billNumber}' from unregistered vendor '${bill.vendor.name}' has ITC flagged as eligible.`,
          reason: "Input Tax Credit cannot be claimed on purchases from unregistered suppliers.",
          recommendation: "Mark ITC as Not Eligible on this bill.",
          affectedEntityId: bill.id,
          affectedEntityNumber: bill.billNumber,
        });
      }
    }

    const mustFixCount = results.filter((r) => r.severity === "MUST_FIX").length;
    const shouldCheckCount = results.filter((r) => r.severity === "SHOULD_CHECK").length;
    const okCount = results.filter((r) => r.severity === "OK").length;

    res.json({
      period,
      summary: {
        totalChecks: results.length,
        mustFixCount,
        shouldCheckCount,
        okCount,
        canGenerateReturn: mustFixCount === 0,
      },
      results,
    });
  } catch (error: any) {
    console.error("Healthcheck error:", error);
    res.status(500).json({ error: "Failed to execute health check." });
  }
});

export default router;
