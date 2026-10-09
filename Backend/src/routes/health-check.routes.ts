import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { Prisma } from "../../app/generated/prisma/client.js";

const router = Router();
const MAX_ISSUES_PER_SCOPE = 50;
const GSTIN_PATTERN = "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$";

type CheckScope = "all" | "sales" | "purchase";
type IssueSeverity = "error" | "warning";

type HealthCheckIssue = {
  id: string;
  severity: IssueSeverity;
  scope: "sales" | "purchase";
  title: string;
  explanation: string;
  howToFix: string;
  recordType: "invoice" | "bill";
  recordId: string;
  recordLabel: string;
  fixUrl: string;
};

type IssueTotals = { errors: number; warnings: number };

type InvalidGstinRecord = {
  recordId: string;
  recordLabel: string;
  partyName: string;
  gstin: string;
};

function readRates(valueJson: string): number[] {
  const value: unknown = JSON.parse(valueJson);
  if (!value || typeof value !== "object" || !("rate" in value)) return [];
  const rate = value.rate;
  return typeof rate === "number" && Number.isFinite(rate) ? [rate] : [];
}

function readBlockedCategories(valueJson: string): string[] {
  const value: unknown = JSON.parse(valueJson);
  if (!value || typeof value !== "object" || !("categories" in value) || !Array.isArray(value.categories)) {
    return [];
  }
  return value.categories.flatMap((category) => {
    if (!category || typeof category !== "object" || !("code" in category)) return [];
    return typeof category.code === "string" ? [category.code] : [];
  });
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  return { start, end: new Date(Date.UTC(year, monthNumber, 1)) };
}

function makeIssue(
  scope: "sales" | "purchase",
  severity: IssueSeverity,
  id: string,
  title: string,
  explanation: string,
  howToFix: string,
  recordType: "invoice" | "bill",
  recordId: string,
  recordLabel: string
): HealthCheckIssue {
  const page = scope === "sales" ? "/sales" : "/purchases";
  return {
    id,
    severity,
    scope,
    title,
    explanation,
    howToFix,
    recordType,
    recordId,
    recordLabel,
    fixUrl: `${page}?healthCheckRecord=${encodeURIComponent(recordId)}`,
  };
}

function addFindings(
  target: { issues: HealthCheckIssue[]; totals: IssueTotals },
  severity: IssueSeverity,
  total: number,
  samples: HealthCheckIssue[]
) {
  target.totals[severity === "error" ? "errors" : "warnings"] += total;
  target.issues.push(...samples);
}

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business is linked to this account." });

    const month = typeof req.query.month === "string" ? req.query.month : "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: "month must use YYYY-MM format, for example 2026-10." });
    }

    const scopeValue = typeof req.query.scope === "string" ? req.query.scope : "all";
    if (!["all", "sales", "purchase"].includes(scopeValue)) {
      return res.status(400).json({ error: "scope must be all, sales, or purchase." });
    }
    const scope = scopeValue as CheckScope;
    const { start, end } = monthRange(month);

    const invoiceCountWhere = {
      businessId,
      invoiceDate: { gte: start, lt: end },
    } satisfies Prisma.SalesInvoiceWhereInput;
    const invoiceWhere = {
      ...invoiceCountWhere,
      status: { not: "CANCELLED" },
    } satisfies Prisma.SalesInvoiceWhereInput;
    const billWhere = {
      businessId,
      billDate: { gte: start, lt: end },
    } satisfies Prisma.PurchaseBillWhereInput;

    const [invoiceCount, billCount, business, rateRules, blockedItcRules] = await Promise.all([
      prisma.salesInvoice.count({ where: invoiceCountWhere }),
      prisma.purchaseBill.count({ where: billWhere }),
      prisma.business.findUnique({ where: { id: businessId }, select: { stateCode: true } }),
      scope === "purchase"
        ? Promise.resolve([])
        : prisma.gstRule.findMany({
            where: {
              category: "RATE",
              status: "ACTIVE",
              effectiveFrom: { lt: end },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
            },
            select: { valueJson: true },
          }),
      scope === "sales"
        ? Promise.resolve([])
        : prisma.gstRule.findMany({
            where: {
              category: "BLOCK_ITC",
              status: "ACTIVE",
              effectiveFrom: { lt: end },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
            },
            select: { valueJson: true },
          }),
    ]);

    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const sales = { issues: [] as HealthCheckIssue[], totals: { errors: 0, warnings: 0 } };
    const purchase = { issues: [] as HealthCheckIssue[], totals: { errors: 0, warnings: 0 } };

    if (scope !== "purchase") {
      const rates = [...new Set(rateRules.flatMap((rule) => readRates(rule.valueJson)))];
      const b2bWhere = {
        ...invoiceWhere,
        customer: { is: { registrationType: { in: ["REGULAR", "COMPOSITION"] }, gstin: null } },
      } satisfies Prisma.SalesInvoiceWhereInput;
      const missingHsnWhere = {
        salesInvoice: { is: invoiceWhere },
        hsnSacCode: "",
      } satisfies Prisma.SalesInvoiceItemWhereInput;
      const invalidRateWhere = {
        salesInvoice: { is: invoiceWhere },
        gstRate: { notIn: rates },
      } satisfies Prisma.SalesInvoiceItemWhereInput;
      const intraTaxWhere = {
        ...invoiceWhere,
        placeOfSupply: business.stateCode,
        totalIgst: { gt: 0 },
      } satisfies Prisma.SalesInvoiceWhereInput;
      const interTaxWhere = {
        ...invoiceWhere,
        placeOfSupply: { not: business.stateCode },
        OR: [{ totalCgst: { gt: 0 } }, { totalSgst: { gt: 0 } }],
      } satisfies Prisma.SalesInvoiceWhereInput;

      const [
        b2bMissingCount,
        b2bMissingRows,
        hsnMissingCount,
        hsnMissingRows,
        invalidRateCount,
        invalidRateRows,
        intraTaxCount,
        intraTaxRows,
        interTaxCount,
        interTaxRows,
        invalidGstinCountRows,
        invalidGstinSampleRows,
        duplicateGroups,
      ] = await Promise.all([
        prisma.salesInvoice.count({ where: b2bWhere }),
        prisma.salesInvoice.findMany({
          where: b2bWhere,
          select: { id: true, invoiceNumber: true },
          orderBy: { invoiceDate: "desc" },
          take: MAX_ISSUES_PER_SCOPE,
        }),
        prisma.salesInvoiceItem.count({ where: missingHsnWhere }),
        prisma.salesInvoiceItem.findMany({
          where: missingHsnWhere,
          select: { id: true, salesInvoice: { select: { id: true, invoiceNumber: true } } },
          orderBy: { salesInvoice: { invoiceDate: "desc" } },
          take: MAX_ISSUES_PER_SCOPE,
        }),
        rates.length
          ? prisma.salesInvoiceItem.count({ where: invalidRateWhere })
          : Promise.resolve(0),
        rates.length
          ? prisma.salesInvoiceItem.findMany({
              where: invalidRateWhere,
              select: { id: true, gstRate: true, salesInvoice: { select: { id: true, invoiceNumber: true } } },
              orderBy: { salesInvoice: { invoiceDate: "desc" } },
              take: MAX_ISSUES_PER_SCOPE,
            })
          : Promise.resolve([]),
        prisma.salesInvoice.count({ where: intraTaxWhere }),
        prisma.salesInvoice.findMany({
          where: intraTaxWhere,
          select: { id: true, invoiceNumber: true },
          orderBy: { invoiceDate: "desc" },
          take: MAX_ISSUES_PER_SCOPE,
        }),
        prisma.salesInvoice.count({ where: interTaxWhere }),
        prisma.salesInvoice.findMany({
          where: interTaxWhere,
          select: { id: true, invoiceNumber: true },
          orderBy: { invoiceDate: "desc" },
          take: MAX_ISSUES_PER_SCOPE,
        }),
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "SalesInvoice" si
          JOIN "Customer" c ON c."id" = si."customerId"
          WHERE si."businessId" = ${businessId}
            AND si."status" <> 'CANCELLED'
            AND si."invoiceDate" >= ${start}
            AND si."invoiceDate" < ${end}
            AND c."gstin" IS NOT NULL
            AND c."gstin" !~ ${GSTIN_PATTERN}
        `,
        prisma.$queryRaw<InvalidGstinRecord[]>`
          SELECT si."id" AS "recordId", si."invoiceNumber" AS "recordLabel",
            c."name" AS "partyName", c."gstin" AS "gstin"
          FROM "SalesInvoice" si
          JOIN "Customer" c ON c."id" = si."customerId"
          WHERE si."businessId" = ${businessId}
            AND si."status" <> 'CANCELLED'
            AND si."invoiceDate" >= ${start}
            AND si."invoiceDate" < ${end}
            AND c."gstin" IS NOT NULL
            AND c."gstin" !~ ${GSTIN_PATTERN}
          ORDER BY si."invoiceDate" DESC
          LIMIT ${MAX_ISSUES_PER_SCOPE}
        `,
        prisma.salesInvoice.groupBy({
          by: ["invoiceNumber"],
          where: invoiceWhere,
          _count: { _all: true },
        }),
      ]);

      const invalidGstinCount = Number(invalidGstinCountRows[0]?.count ?? 0);
      const duplicateInvoiceNumbers = duplicateGroups
        .filter((group) => group._count._all > 1)
        .map((group) => group.invoiceNumber);
      const duplicateInvoiceCount = duplicateGroups.reduce(
        (total, group) => total + Math.max(0, group._count._all - 1),
        0
      );
      const duplicateInvoiceSamples = duplicateInvoiceNumbers.length
        ? await prisma.salesInvoice.findMany({
            where: { ...invoiceWhere, invoiceNumber: { in: duplicateInvoiceNumbers } },
            select: { id: true, invoiceNumber: true },
            orderBy: [{ invoiceNumber: "asc" }, { createdAt: "asc" }],
            take: MAX_ISSUES_PER_SCOPE * 2,
          })
        : [];
      const duplicateInvoiceSeen = new Set<string>();
      const duplicateInvoiceIssues = duplicateInvoiceSamples.flatMap((invoice) => {
        if (!duplicateInvoiceSeen.has(invoice.invoiceNumber)) {
          duplicateInvoiceSeen.add(invoice.invoiceNumber);
          return [];
        }
        return [
          makeIssue(
            "sales",
            "error",
            `duplicate-invoice-${invoice.id}`,
            `Invoice number ${invoice.invoiceNumber} is used more than once`,
            "Duplicate invoice numbers can make it unclear which sale belongs in your return.",
            "Give this invoice a number that is different from the other invoices.",
            "invoice",
            invoice.id,
            invoice.invoiceNumber
          ),
        ];
      });

      addFindings(
        sales,
        "error",
        b2bMissingCount,
        b2bMissingRows.map((invoice) =>
          makeIssue(
            "sales",
            "error",
            `missing-customer-gstin-${invoice.id}`,
            `Customer's GST number (GSTIN) is missing on invoice ${invoice.invoiceNumber}`,
            "GST-registered sales need the customer's GST number so this invoice can be included correctly in your return.",
            "Add the customer's correct GST number to their customer record.",
            "invoice",
            invoice.id,
            invoice.invoiceNumber
          )
        )
      );
      addFindings(
        sales,
        "error",
        invalidGstinCount,
        invalidGstinSampleRows.map((row) =>
          makeIssue(
            "sales",
            "error",
            `invalid-customer-gstin-${row.recordId}`,
            `${row.partyName}'s GST number (GSTIN) needs checking on invoice ${row.recordLabel}`,
            "A GST number must have 15 characters in the standard format to be used in the return.",
            "Check the customer's GST number and correct it in their customer record.",
            "invoice",
            row.recordId,
            row.recordLabel
          )
        )
      );
      addFindings(
        sales,
        "error",
        hsnMissingCount,
        hsnMissingRows.map((item) =>
          makeIssue(
            "sales",
            "error",
            `missing-hsn-${item.id}`,
            `Product or service code (HSN/SAC) is missing on invoice ${item.salesInvoice.invoiceNumber}`,
            "This item needs a goods or service code to appear correctly in the return summary.",
            "Add the item's correct HSN/SAC code to the invoice item.",
            "invoice",
            item.salesInvoice.id,
            item.salesInvoice.invoiceNumber
          )
        )
      );
      addFindings(
        sales,
        "error",
        rates.length ? invalidRateCount : 0,
        invalidRateRows.map((item) =>
          makeIssue(
            "sales",
            "error",
            `invalid-tax-rate-${item.id}`,
            `GST rate needs checking on invoice ${item.salesInvoice.invoiceNumber}`,
            `The saved ${item.gstRate}% rate is not in the rate rules for this month.`,
            "Check the item's GST rate against the current GST rate rules.",
            "invoice",
            item.salesInvoice.id,
            item.salesInvoice.invoiceNumber
          )
        )
      );
      addFindings(
        sales,
        "error",
        intraTaxCount,
        intraTaxRows.map((invoice) =>
          makeIssue(
            "sales",
            "error",
            `wrong-intra-tax-${invoice.id}`,
            `Tax type needs checking on invoice ${invoice.invoiceNumber}`,
            "This sale is within your state but has IGST saved; in-state sales use CGST and SGST (two parts of state tax).",
            "Check the customer's state and use CGST plus SGST for an in-state sale.",
            "invoice",
            invoice.id,
            invoice.invoiceNumber
          )
        )
      );
      addFindings(
        sales,
        "error",
        interTaxCount,
        interTaxRows.map((invoice) =>
          makeIssue(
            "sales",
            "error",
            `wrong-inter-tax-${invoice.id}`,
            `Tax type needs checking on invoice ${invoice.invoiceNumber}`,
            "This sale is outside your state but has CGST or SGST saved; out-of-state sales use IGST (single integrated tax).",
            "Check the customer's state and use IGST for an out-of-state sale.",
            "invoice",
            invoice.id,
            invoice.invoiceNumber
          )
        )
      );
      addFindings(sales, "error", duplicateInvoiceCount, duplicateInvoiceIssues);

    }

    if (scope !== "sales") {
      const blockedCategories = [...new Set(blockedItcRules.flatMap((rule) => readBlockedCategories(rule.valueJson)))];
      const missingVendorGstinWhere = {
        ...billWhere,
        vendor: { is: { gstin: null } },
      } satisfies Prisma.PurchaseBillWhereInput;
      const blockedItcWhere = {
        ...billWhere,
        category: { in: blockedCategories },
        isItcEligible: true,
        items: { some: { isItcEligible: true } },
      } satisfies Prisma.PurchaseBillWhereInput;

      const [
        missingVendorGstinCount,
        missingVendorGstinRows,
        blockedItcCount,
        blockedItcRows,
        invalidVendorGstinCountRows,
        invalidVendorGstinSampleRows,
        duplicateBillGroupsRaw,
      ] = await Promise.all([
        prisma.purchaseBill.count({ where: missingVendorGstinWhere }),
        prisma.purchaseBill.findMany({
          where: missingVendorGstinWhere,
          select: { id: true, billNumber: true },
          orderBy: { billDate: "desc" },
          take: MAX_ISSUES_PER_SCOPE,
        }),
        blockedCategories.length ? prisma.purchaseBill.count({ where: blockedItcWhere }) : Promise.resolve(0),
        blockedCategories.length
          ? prisma.purchaseBill.findMany({
              where: blockedItcWhere,
              select: { id: true, billNumber: true, category: true },
              orderBy: { billDate: "desc" },
              take: MAX_ISSUES_PER_SCOPE,
            })
          : Promise.resolve([]),
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "PurchaseBill" pb
          JOIN "Vendor" v ON v."id" = pb."vendorId"
          WHERE pb."businessId" = ${businessId}
            AND pb."billDate" >= ${start}
            AND pb."billDate" < ${end}
            AND v."gstin" IS NOT NULL
            AND v."gstin" !~ ${GSTIN_PATTERN}
        `,
        prisma.$queryRaw<InvalidGstinRecord[]>`
          SELECT pb."id" AS "recordId", pb."billNumber" AS "recordLabel",
            v."name" AS "partyName", v."gstin" AS "gstin"
          FROM "PurchaseBill" pb
          JOIN "Vendor" v ON v."id" = pb."vendorId"
          WHERE pb."businessId" = ${businessId}
            AND pb."billDate" >= ${start}
            AND pb."billDate" < ${end}
            AND v."gstin" IS NOT NULL
            AND v."gstin" !~ ${GSTIN_PATTERN}
          ORDER BY pb."billDate" DESC
          LIMIT ${MAX_ISSUES_PER_SCOPE}
        `,
        prisma.purchaseBill.groupBy({
          by: ["vendorId", "billNumber"],
          where: billWhere,
          _count: { _all: true },
        }),
      ]);

      const invalidVendorGstinCount = Number(invalidVendorGstinCountRows[0]?.count ?? 0);
      const duplicateBillGroups = duplicateBillGroupsRaw.filter((group) => group._count._all > 1);
      const duplicateBillCount = duplicateBillGroups.reduce(
        (total, group) => total + Math.max(0, group._count._all - 1),
        0
      );
      const duplicateBillSamples = duplicateBillGroups.length
        ? await prisma.purchaseBill.findMany({
            where: {
              ...billWhere,
              OR: duplicateBillGroups.slice(0, MAX_ISSUES_PER_SCOPE).map((group) => ({
                vendorId: group.vendorId,
                billNumber: group.billNumber,
              })),
            },
            select: { id: true, billNumber: true, vendorId: true },
            orderBy: [{ vendorId: "asc" }, { billNumber: "asc" }, { createdAt: "asc" }],
            take: MAX_ISSUES_PER_SCOPE * 2,
          })
        : [];
      const duplicateBillSeen = new Set<string>();
      const duplicateBillIssues = duplicateBillSamples.flatMap((bill) => {
        const groupKey = `${bill.vendorId}:${bill.billNumber}`;
        if (!duplicateBillSeen.has(groupKey)) {
          duplicateBillSeen.add(groupKey);
          return [];
        }
        return [
          makeIssue(
            "purchase",
            "error",
            `duplicate-bill-${bill.id}`,
            `Bill number ${bill.billNumber} is repeated for this supplier`,
            "A supplier's bill number should appear only once in your purchase records.",
            "Check the two bills and remove or correct the duplicate entry.",
            "bill",
            bill.id,
            bill.billNumber
          ),
        ];
      });

      addFindings(
        purchase,
        "error",
        missingVendorGstinCount,
        missingVendorGstinRows.map((bill) =>
          makeIssue(
            "purchase",
            "error",
            `missing-vendor-gstin-${bill.id}`,
            `Supplier's GST number (GSTIN) is missing on bill ${bill.billNumber}`,
            "The supplier's GST number is needed to include this purchase correctly in your records.",
            "Check the supplier's GST registration and add their GST number to the supplier record.",
            "bill",
            bill.id,
            bill.billNumber
          )
        )
      );
      addFindings(
        purchase,
        "error",
        invalidVendorGstinCount,
        invalidVendorGstinSampleRows.map((row) =>
          makeIssue(
            "purchase",
            "error",
            `invalid-vendor-gstin-${row.recordId}`,
            `${row.partyName}'s GST number (GSTIN) needs checking on bill ${row.recordLabel}`,
            "A GST number must have 15 characters in the standard format to be used in the return.",
            "Check the supplier's GST number and correct it in their record.",
            "bill",
            row.recordId,
            row.recordLabel
          )
        )
      );
      addFindings(purchase, "error", duplicateBillCount, duplicateBillIssues);
      addFindings(
        purchase,
        "warning",
        blockedItcCount,
        blockedItcRows.map((bill) =>
          makeIssue(
            "purchase",
            "warning",
            `blocked-itc-${bill.id}`,
            `Tax credit you can claim back (ITC) needs review on bill ${bill.billNumber}`,
            `The bill category “${bill.category}” is listed as blocked in a saved GST rule, but this purchase is marked as claimable tax credit.`,
            "Check the category and mark the tax credit as not claimable unless an exception applies.",
            "bill",
            bill.id,
            bill.billNumber
          )
        )
      );
    }

    const includeSales = scope !== "purchase";
    const includePurchase = scope !== "sales";
    const selectedIssues = [
      ...(includeSales ? sales.issues : []),
      ...(includePurchase ? purchase.issues : []),
    ].sort((first, second) => {
      if (first.severity !== second.severity) return first.severity === "error" ? -1 : 1;
      return first.recordLabel.localeCompare(second.recordLabel);
    });
    const issues = [
      ...selectedIssues.filter((issue) => issue.scope === "sales").slice(0, MAX_ISSUES_PER_SCOPE),
      ...selectedIssues.filter((issue) => issue.scope === "purchase").slice(0, MAX_ISSUES_PER_SCOPE),
    ].sort((first, second) => {
      if (first.severity !== second.severity) return first.severity === "error" ? -1 : 1;
      return first.recordLabel.localeCompare(second.recordLabel);
    });
    const totals = {
      sales: includeSales ? sales.totals : { errors: 0, warnings: 0 },
      purchase: includePurchase ? purchase.totals : { errors: 0, warnings: 0 },
    };
    const errors = totals.sales.errors + totals.purchase.errors;
    const warnings = totals.sales.warnings + totals.purchase.warnings;
    const status =
      invoiceCount === 0 && billCount === 0
        ? "empty"
        : errors > 0
          ? "error"
          : warnings > 0
            ? "warning"
            : "ok";

    res.json({
      status,
      month,
      checkedAt: new Date().toISOString(),
      counts: { invoices: invoiceCount, bills: billCount, errors, warnings },
      issueTotals: totals,
      issues,
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ error: "We couldn't check this month's records. Please try again." });
  }
});

export default router;
