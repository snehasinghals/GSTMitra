import { Router, Response } from "express";
import { prisma } from "../lib/db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import ExcelJS from "exceljs";
import { INDIAN_STATES } from "../lib/constants";

const router = Router();

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

// Helper to get start and end dates for a period e.g. "102026"
function parsePeriod(periodStr: string) {
  const period = periodStr || "102026";
  const month = parseInt(period.substring(0, 2), 10);
  const year = parseInt(period.substring(2, 6), 10);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  return { period, month, year, startDate, endDate };
}

function isValidPeriod(period: string) {
  return /^\d{2}\d{4}$/.test(period) && Number(period.slice(0, 2)) >= 1 && Number(period.slice(0, 2)) <= 12;
}

function safeReportFilePart(value: string | null | undefined) {
  return value?.replace(/[^A-Za-z0-9_-]/g, "_") || "DRAFT";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatPlaceOfSupply(value: string | null | undefined, fallbackStateName?: string | null) {
  const raw = value?.trim() || "";
  const match = raw.match(/^(\d{1,2})(?:\s*[-–:]\s*(.*))?$/);
  const code = match ? match[1].padStart(2, "0") : "";
  const state = code
    ? INDIAN_STATES.find((entry) => entry.code === code)
    : INDIAN_STATES.find((entry) => entry.name.toLowerCase() === raw.toLowerCase());
  if (state) return `${state.code}-${state.name}`;
  if (match?.[2]) return `${code}-${match[2]}`;
  if (raw) return raw;
  return fallbackStateName || "";
}

// yyyy-mm-dd in local time (avoids the UTC date-shift problem)
function isoDate(d: Date | string) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
}

async function sendReviewWorkbook(res: Response, workbook: ExcelJS.Workbook, filename: string) {
  const data = await workbook.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(Buffer.from(data));
}

type RateLine = { rate: number; taxable: number; cess: number; sgst: number; cgst: number; igst: number };

// Splits one invoice/bill into one line per GST rate (like the portal does)
function groupByRate(items: any[]): RateLine[] {
  const map = new Map<number, RateLine>();
  items.forEach((it) => {
    const r = map.get(it.gstRate) || { rate: it.gstRate, taxable: 0, cess: 0, sgst: 0, cgst: 0, igst: 0 };
    r.taxable += it.taxableValue || 0;
    r.cess += it.cessAmount || 0;
    r.sgst += it.sgstAmount || 0;
    r.cgst += it.cgstAmount || 0;
    r.igst += it.igstAmount || 0;
    map.set(it.gstRate, r);
  });
  return [...map.values()]
    .sort((a, b) => a.rate - b.rate)
    .map((line) => ({
      ...line,
      taxable: r2(line.taxable),
      cess: r2(line.cess),
      sgst: r2(line.sgst),
      cgst: r2(line.cgst),
      igst: r2(line.igst),
    }));
}

// -------------------------------------------------------------
// GSTR-3B calculation (used by BOTH the Excel and the JSON route)
// -------------------------------------------------------------
type Tax = { txval: number; iamt: number; camt: number; samt: number; csamt: number };
const z = (): Tax => ({ txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const add = (t: Tax, txval: number, iamt: number, camt: number, samt: number, csamt: number) => {
  t.txval += txval;
  t.iamt += iamt;
  t.camt += camt;
  t.samt += samt;
  t.csamt += csamt;
};
const clean = (t: Tax): Tax => ({
  samt: r2(t.samt),
  csamt: r2(t.csamt),
  txval: r2(t.txval),
  camt: r2(t.camt),
  iamt: r2(t.iamt),
});

const GSTR3B_SUPPLEMENT_KEYS = [
  "outwardZeroRatedTaxable",
  "outwardZeroRatedIgst",
  "outwardZeroRatedCess",
  "outwardZeroRatedAdditionalTaxable",
  "outwardZeroRatedAdditionalIgst",
  "outwardZeroRatedAdditionalCess",
  "outwardNilExemptTaxable",
  "outwardNilExemptAdditionalTaxable",
  "outwardNonGstTaxable",
  "outwardNonGstAdditionalTaxable",
  "inwardNonGstInter",
  "inwardNonGstIntra",
  "itcIsdIgst",
  "itcIsdCgst",
  "itcIsdSgst",
  "itcIsdCess",
  "itcReversedRulesIgst",
  "itcReversedRulesCgst",
  "itcReversedRulesSgst",
  "itcReversedRulesCess",
  "itcReversedOtherIgst",
  "itcReversedOtherCgst",
  "itcReversedOtherSgst",
  "itcReversedOtherCess",
  "itcIneligible17Igst",
  "itcIneligible17Cgst",
  "itcIneligible17Sgst",
  "itcIneligible17Cess",
  "itcIneligibleOtherIgst",
  "itcIneligibleOtherCgst",
  "itcIneligibleOtherSgst",
  "itcIneligibleOtherCess",
  "interestIgst",
  "interestCgst",
  "interestSgst",
  "interestCess",
  "lateFeeIgst",
  "lateFeeCgst",
  "lateFeeSgst",
  "lateFeeCess",
] as const;

type Gstr3bSupplementKey = (typeof GSTR3B_SUPPLEMENT_KEYS)[number];
type Gstr3bSupplementValues = Record<Gstr3bSupplementKey, number>;

class Gstr3bReviewError extends Error {}

function emptyGstr3bSupplement(): Gstr3bSupplementValues {
  return Object.fromEntries(GSTR3B_SUPPLEMENT_KEYS.map((key) => [key, 0])) as Gstr3bSupplementValues;
}

function parseGstr3bSupplement(raw: string | null | undefined): Gstr3bSupplementValues {
  if (!raw) return emptyGstr3bSupplement();
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stored GSTR-3B supplemental values are invalid.");
  }
  const values = emptyGstr3bSupplement();
  for (const key of GSTR3B_SUPPLEMENT_KEYS) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value !== undefined) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`Stored GSTR-3B value '${key}' is invalid.`);
      }
      values[key] = value;
    }
  }
  return values;
}

function addSupplementTaxes(target: Tax, values: Gstr3bSupplementValues, prefix: string) {
  add(
    target,
    0,
    values[`${prefix}Igst` as Gstr3bSupplementKey],
    values[`${prefix}Cgst` as Gstr3bSupplementKey],
    values[`${prefix}Sgst` as Gstr3bSupplementKey],
    values[`${prefix}Cess` as Gstr3bSupplementKey]
  );
}

async function buildGstr3b(businessId: string, period: string) {
  const { startDate, endDate } = parsePeriod(period);
  const [business, sales, purchases, adjustment] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId } }),
    prisma.salesInvoice.findMany({
      where: { businessId, invoiceDate: { gte: startDate, lte: endDate }, status: { not: "CANCELLED" } },
      include: { items: true },
    }),
    prisma.purchaseBill.findMany({
      where: { businessId, billDate: { gte: startDate, lte: endDate } },
      include: { items: true },
    }),
    prisma.gstr3bAdjustment.findUnique({ where: { businessId_period: { businessId, period } } }),
  ]);
  const manual = parseGstr3bSupplement(adjustment?.valuesJson);

  // ---- 3.1 Outward supplies ----
  const osup_det = z(); // (a) taxable (rate > 0)
  const osup_zero = z();
  const osup_nil_exmp = z();
  const osup_nongst = z();
  const isup_rev = z(); // (d) inward supplies on reverse charge

  let zeroRateSalesTaxable = 0;
  sales.forEach((inv) =>
    inv.items.forEach((it) => {
      if (it.gstRate > 0) add(osup_det, it.taxableValue, it.igstAmount, it.cgstAmount, it.sgstAmount, it.cessAmount);
      else zeroRateSalesTaxable += it.taxableValue;
    })
  );
  const classifiedZeroRateSales =
    manual.outwardZeroRatedTaxable + manual.outwardNilExemptTaxable + manual.outwardNonGstTaxable;
  if (Math.abs(classifiedZeroRateSales - zeroRateSalesTaxable) > 0.01) {
    throw new Gstr3bReviewError(
      `Classify all 0% sales before export. Books contain ₹${r2(zeroRateSalesTaxable).toFixed(2)}; ` +
        `the three 3B classifications total ₹${r2(classifiedZeroRateSales).toFixed(2)}.`
    );
  }
  add(
    osup_zero,
    manual.outwardZeroRatedTaxable + manual.outwardZeroRatedAdditionalTaxable,
    manual.outwardZeroRatedIgst + manual.outwardZeroRatedAdditionalIgst,
    0,
    0,
    manual.outwardZeroRatedCess + manual.outwardZeroRatedAdditionalCess
  );
  add(osup_nil_exmp, manual.outwardNilExemptTaxable + manual.outwardNilExemptAdditionalTaxable, 0, 0, 0, 0);
  add(osup_nongst, manual.outwardNonGstTaxable + manual.outwardNonGstAdditionalTaxable, 0, 0, 0, 0);

  // ---- 4. ITC ----
  const itc = { IMPG: z(), IMPS: z(), ISRC: z(), ISD: z(), OTH: z() };
  const inelg17 = z();
  const inelgOth = z();
  const reversedRules = z();
  const reversedOther = z();
  const inward = { GST: { intra: 0, inter: 0 }, NONGST: { intra: 0, inter: 0 } };

  purchases.forEach((b) => {
    const billTax = b.items.reduce(
      (total, item) => ({
        taxable: total.taxable + item.taxableValue,
        igst: total.igst + item.igstAmount,
        cgst: total.cgst + item.cgstAmount,
        sgst: total.sgst + item.sgstAmount,
        cess: total.cess + item.cessAmount,
      }),
      { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }
    );

    if (b.isReverseCharge && b.supplyType !== "IMPORT_GOODS") {
      add(isup_rev, billTax.taxable, billTax.igst, billTax.cgst, billTax.sgst, billTax.cess);
    }

    b.items.forEach((item) => {
      if (!item.isItcEligible) {
        const blockedBySection175 = b.itcIneligibilityReason?.toLowerCase().includes("17(5)");
        add(
          blockedBySection175 ? inelg17 : inelgOth,
          0,
          item.igstAmount,
          item.cgstAmount,
          item.sgstAmount,
          item.cessAmount
        );
      } else if (b.supplyType === "IMPORT_GOODS") {
        add(itc.IMPG, 0, item.igstAmount, item.cgstAmount, item.sgstAmount, item.cessAmount);
      } else if (b.supplyType === "IMPORT_SERVICES") {
        add(itc.IMPS, 0, item.igstAmount, item.cgstAmount, item.sgstAmount, item.cessAmount);
      } else if (b.isReverseCharge) {
        add(itc.ISRC, 0, item.igstAmount, item.cgstAmount, item.sgstAmount, item.cessAmount);
      } else {
        add(itc.OTH, 0, item.igstAmount, item.cgstAmount, item.sgstAmount, item.cessAmount);
      }
    });

    // ---- 5. Exempt / nil inward supplies ----
    b.items.forEach((it) => {
      if (it.gstRate === 0) {
        if (b.supplyType === "INTRA_STATE") inward.GST.intra += it.taxableValue;
        else inward.GST.inter += it.taxableValue;
      }
    });
  });

  addSupplementTaxes(itc.ISD, manual, "itcIsd");
  addSupplementTaxes(reversedRules, manual, "itcReversedRules");
  addSupplementTaxes(reversedOther, manual, "itcReversedOther");
  addSupplementTaxes(inelg17, manual, "itcIneligible17");
  addSupplementTaxes(inelgOth, manual, "itcIneligibleOther");
  inward.NONGST.inter += manual.inwardNonGstInter;
  inward.NONGST.intra += manual.inwardNonGstIntra;

  const itcNet = z();
  Object.values(itc).forEach((t) => add(itcNet, 0, t.iamt, t.camt, t.samt, t.csamt));
  [reversedRules, reversedOther].forEach((t) =>
    add(itcNet, 0, -t.iamt, -t.camt, -t.samt, -t.csamt)
  );
  const interest = z();
  const lateFee = z();
  addSupplementTaxes(interest, manual, "interest");
  addSupplementTaxes(lateFee, manual, "lateFee");

  const json = {
    gstin: business?.gstin || "",
    ret_period: period,
    sup_details: {
      osup_zero: clean(osup_zero),
      osup_nil_exmp: clean(osup_nil_exmp),
      osup_nongst: clean(osup_nongst),
      osup_det: clean(osup_det),
      isup_rev: clean(isup_rev),
    },
    itc_elg: {
      itc_avl: (["IMPS", "IMPG", "ISRC", "ISD", "OTH"] as const).map((ty) => {
        const { txval, ...rest } = clean(itc[ty]);
        return { ...rest, ty };
      }),
      itc_net: (({ txval, ...rest }) => rest)(clean(itcNet)),
      itc_rev: [
        (({ txval, ...rest }) => ({ ...rest, ty: "RUL" }))(clean(reversedRules)),
        (({ txval, ...rest }) => ({ ...rest, ty: "OTH" }))(clean(reversedOther)),
      ],
      itc_inelg: [
        (({ txval, ...rest }) => ({ ...rest, ty: "RUL" }))(clean(inelg17)),
        (({ txval, ...rest }) => ({ ...rest, ty: "OTH" }))(clean(inelgOth)),
      ],
    },
    inward_sup: {
      isup_details: [
        { intra: r2(inward.GST.intra), ty: "GST", inter: r2(inward.GST.inter) },
        { intra: 0, ty: "NONGST", inter: 0 },
      ],
    },
    intr_ltfee: { intr_details: (({ txval, ...rest }) => rest)(clean(interest)) },
  };

  return { business, json, manual, adjustmentConfirmed: adjustment?.confirmed ?? false, lateFee };
}

// -------------------------------------------------------------
// 1. GSTR-1
// -------------------------------------------------------------
router.get("/gstr3b/adjustments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const period = String(req.query.period || "");
    if (!isValidPeriod(period)) return res.status(400).json({ error: "Invalid filing period." });

    const { startDate, endDate } = parsePeriod(period);
    const [adjustment, sales] = await Promise.all([
      prisma.gstr3bAdjustment.findUnique({ where: { businessId_period: { businessId, period } } }),
      prisma.salesInvoice.findMany({
        where: { businessId, invoiceDate: { gte: startDate, lte: endDate }, status: { not: "CANCELLED" } },
        include: { items: { select: { gstRate: true, taxableValue: true } } },
      }),
    ]);
    const zeroRateSalesTaxable = sales.reduce(
      (total, invoice) =>
        total + invoice.items.reduce((invoiceTotal, item) => invoiceTotal + (item.gstRate === 0 ? item.taxableValue : 0), 0),
      0
    );

    res.json({
      values: parseGstr3bSupplement(adjustment?.valuesJson),
      confirmed: adjustment?.confirmed ?? false,
      zeroRateSalesTaxable: r2(zeroRateSalesTaxable),
    });
  } catch (error) {
    console.error("GSTR-3B supplemental values read error:", error);
    res.status(500).json({ error: "Failed to load GSTR-3B supplemental values." });
  }
});

router.put("/gstr3b/adjustments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const period = String(req.body?.period || "");
    if (!isValidPeriod(period)) return res.status(400).json({ error: "Invalid filing period." });
    if (req.body?.confirmed !== true) {
      return res.status(400).json({ error: "Review all supplemental amounts and confirm before saving." });
    }

    const input = req.body?.values;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return res.status(400).json({ error: "GSTR-3B supplemental values are required." });
    }
    const values = emptyGstr3bSupplement();
    for (const key of GSTR3B_SUPPLEMENT_KEYS) {
      const value = input[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: `Enter a valid zero-or-positive amount for ${key}.` });
      }
      values[key] = r2(value);
    }
    const { startDate, endDate } = parsePeriod(period);
    const sales = await prisma.salesInvoice.findMany({
      where: { businessId, invoiceDate: { gte: startDate, lte: endDate }, status: { not: "CANCELLED" } },
      include: { items: { select: { gstRate: true, taxableValue: true } } },
    });
    const zeroRateSalesTaxable = sales.reduce(
      (total, invoice) =>
        total + invoice.items.reduce((invoiceTotal, item) => invoiceTotal + (item.gstRate === 0 ? item.taxableValue : 0), 0),
      0
    );
    const classifiedZeroRateSales =
      values.outwardZeroRatedTaxable + values.outwardNilExemptTaxable + values.outwardNonGstTaxable;
    if (Math.abs(classifiedZeroRateSales - zeroRateSalesTaxable) > 0.01) {
      return res.status(400).json({
        error:
          `Classify all 0% sales before confirming. Books contain ₹${r2(zeroRateSalesTaxable).toFixed(2)}; ` +
          `your classifications total ₹${r2(classifiedZeroRateSales).toFixed(2)}.`,
      });
    }

    const adjustment = await prisma.gstr3bAdjustment.upsert({
      where: { businessId_period: { businessId, period } },
      create: { businessId, period, valuesJson: JSON.stringify(values), confirmed: true },
      update: { valuesJson: JSON.stringify(values), confirmed: true },
    });
    res.json({ confirmed: adjustment.confirmed, values });
  } catch (error) {
    console.error("GSTR-3B supplemental values save error:", error);
    res.status(500).json({ error: "Failed to save GSTR-3B supplemental values." });
  }
});

router.get("/gstr1/summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { period, startDate, endDate } = parsePeriod(req.query.period as string);

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        businessId,
        invoiceDate: { gte: startDate, lte: endDate },
        status: { not: "CANCELLED" },
      },
      include: { customer: true, items: true },
    });

    const b2bInvoices = invoices.filter((i) => i.customer.registrationType === "REGULAR" && i.customer.gstin);
    const b2cInvoices = invoices.filter((i) => !i.customer.gstin || i.customer.registrationType === "UNREGISTERED");

    let totalSales = 0;
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;

    invoices.forEach((inv) => {
      totalSales += inv.totalAmount;
      totalTaxable += inv.subtotal;
      totalCgst += inv.totalCgst;
      totalSgst += inv.totalSgst;
      totalIgst += inv.totalIgst;
      totalCess += inv.totalCess;
    });

    // HSN Summary aggregation
    const hsnMap: Record<
      string,
      { hsn: string; desc: string; rate: number; qty: number; unit: string; taxable: number; cgst: number; sgst: number; igst: number; cess: number; total: number }
    > = {};

    invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const key = `${item.hsnSacCode}_${item.gstRate}`;
        if (!hsnMap[key]) {
          hsnMap[key] = {
            hsn: item.hsnSacCode,
            desc: item.description,
            rate: item.gstRate,
            qty: 0,
            unit: item.unit,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            cess: 0,
            total: 0,
          };
        }
        hsnMap[key].qty += item.quantity;
        hsnMap[key].taxable += item.taxableValue;
        hsnMap[key].cgst += item.cgstAmount;
        hsnMap[key].sgst += item.sgstAmount;
        hsnMap[key].igst += item.igstAmount;
        hsnMap[key].cess += item.cessAmount;
        hsnMap[key].total += item.totalAmount;
      });
    });

    res.json({
      period,
      gstin: business?.gstin || "NOT_SET",
      b2bCount: b2bInvoices.length,
      b2cCount: b2cInvoices.length,
      totalInvoices: invoices.length,
      totals: {
        totalSales,
        totalTaxable,
        totalCgst,
        totalSgst,
        totalIgst,
        totalCess,
        totalTax: totalCgst + totalSgst + totalIgst + totalCess,
      },
      hsnSummary: Object.values(hsnMap),
      invoices,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate GSTR-1 summary." });
  }
});

// GSTR-1 Excel (Summary block + peach detail header, B2B only)
router.get("/gstr1/excel", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const period = String(req.query.period || "");
    if (!isValidPeriod(period)) return res.status(400).json({ error: "Invalid filing period." });
    const { startDate, endDate } = parsePeriod(period);

    const [business, allInvoices] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.salesInvoice.findMany({
        where: { businessId, invoiceDate: { gte: startDate, lte: endDate }, status: { not: "CANCELLED" } },
        include: { customer: true, items: true },
        orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
      }),
    ]);
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const invoices = allInvoices.filter((i) => i.customer.gstin); // B2B only

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GSTMitra";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("b2b");
    sheet.columns = Array.from({ length: 13 }, () => ({ width: 14 }));

    // Row 1: "Summary"
    sheet.getCell("A1").value = "Summary";
    sheet.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF0F6FC6" } };

    // Row 2: blue summary header (A..M all filled)
    const blue = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0F6FC6" } };
    const sumHeader = sheet.getRow(2);
    sumHeader.getCell(1).value = "No. of Recipients";
    sumHeader.getCell(3).value = "No. of Invoices";
    sumHeader.getCell(5).value = "Total Invoice Value";
    sumHeader.getCell(12).value = "Taxable Value";
    sumHeader.getCell(13).value = "Total Cess";
    for (let c = 1; c <= 13; c++) {
      const cell = sumHeader.getCell(c);
      cell.fill = blue;
      cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    }

    // Row 3: summary values
    const sumVals = sheet.getRow(3);
    sumVals.getCell(1).value = new Set(invoices.map((i) => i.customer.gstin)).size;
    sumVals.getCell(3).value = invoices.length;
    sumVals.getCell(5).value = invoices.reduce((s, i) => s + i.totalAmount, 0);
    sumVals.getCell(12).value = invoices.reduce((s, i) => s + i.subtotal, 0);
    sumVals.getCell(13).value = invoices.reduce((s, i) => s + i.totalCess, 0);
    [5, 12, 13].forEach((c) => (sumVals.getCell(c).numFmt = "0.000"));
    [1, 3].forEach((c) => (sumVals.getCell(c).alignment = { horizontal: "center" }));

    // Row 4: peach detail header
    const detailHeader = sheet.getRow(4);
    detailHeader.values = [
      "GSTIN/UIN of Recipient",
      "Receiver Name",
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Place Of Supply",
      "Reverse Charge",
      "Applicable % of Tax Rate",
      "Invoice Type",
      "E-Commerce GSTIN",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ];
    for (let c = 1; c <= 13; c++) {
      const cell = detailHeader.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8CBAD" } };
      cell.font = { color: { argb: "FF404040" } };
    }

    // Row 5+: data (one row per invoice per GST rate)
    invoices.forEach((inv) => {
      groupByRate(inv.items).forEach((line, index) => {
        const row = sheet.addRow([
          inv.customer.gstin,
          inv.customer.name,
          inv.invoiceNumber,
          new Date(inv.invoiceDate),
          index === 0 ? inv.totalAmount : "",
          formatPlaceOfSupply(inv.placeOfSupply, inv.customer.stateName),
          inv.isReverseCharge ? "Y" : "N",
          inv.applicablePercent ? `${inv.applicablePercent}%` : "",
          "Regular B2B",
          inv.ecomGstin || "",
          line.rate,
          line.taxable,
          line.cess,
        ]);
        row.getCell(4).numFmt = "dd-mmm-yyyy";
        [5, 12, 13].forEach((c) => (row.getCell(c).numFmt = "0.00"));
      });
    });

    await sendReviewWorkbook(res, workbook, `GSTR1_${safeReportFilePart(business.gstin)}_${period}.xlsx`);
  } catch (error) {
    console.error("GSTR-1 Excel export error:", error);
    res.status(500).json({ error: "Failed to export GSTR-1 workbook." });
  }
});

// GSTR-1 JSON Download
router.get("/gstr1/json", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const { period, startDate, endDate } = parsePeriod(req.query.period as string);

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        businessId,
        invoiceDate: { gte: startDate, lte: endDate },
        status: { not: "CANCELLED" },
      },
      include: { customer: true, items: true },
    });

    const b2b = invoices
      .filter((i) => i.customer.gstin)
      .map((i) => ({
        ctin: i.customer.gstin,
        inv: [
          {
            inum: i.invoiceNumber,
            idt: new Date(i.invoiceDate).toLocaleDateString("en-GB").replace(/\//g, "-"),
            val: i.totalAmount,
            pos: i.placeOfSupply,
            rchrg: "N",
            inv_typ: "R",
            itms: i.items.map((itm, idx) => ({
              num: idx + 1,
              itm_det: {
                txval: itm.taxableValue,
                rt: itm.gstRate,
                iamt: itm.igstAmount,
                camt: itm.cgstAmount,
                samt: itm.sgstAmount,
                csamt: itm.cessAmount,
              },
            })),
          },
        ],
      }));

    const jsonPayload = {
      gstin: business?.gstin || "",
      fp: period,
      version: "1.0.0",
      b2b,
    };

    const fileName = `GSTR1_${business?.gstin || "DRAFT"}_${period}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(jsonPayload, null, 2));
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate GSTR-1 JSON." });
  }
});

// -------------------------------------------------------------
// 2. GSTR-3B
// -------------------------------------------------------------
router.get("/gstr3b/summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { period, startDate, endDate } = parsePeriod(req.query.period as string);
    const business = await prisma.business.findUnique({ where: { id: businessId } });

    // Outward Supplies (Sales)
    const sales = await prisma.salesInvoice.findMany({
      where: { businessId, invoiceDate: { gte: startDate, lte: endDate }, status: { not: "CANCELLED" } },
    });

    let outwardTaxable = 0,
      outwardCgst = 0,
      outwardSgst = 0,
      outwardIgst = 0,
      outwardCess = 0;
    sales.forEach((s) => {
      outwardTaxable += s.subtotal;
      outwardCgst += s.totalCgst;
      outwardSgst += s.totalSgst;
      outwardIgst += s.totalIgst;
      outwardCess += s.totalCess;
    });

    // Inward Supplies & ITC (Purchases)
    const purchases = await prisma.purchaseBill.findMany({
      where: { businessId, billDate: { gte: startDate, lte: endDate } },
      include: { items: true },
    });

    let itcEligibleTaxable = 0,
      itcEligibleCgst = 0,
      itcEligibleSgst = 0,
      itcEligibleIgst = 0,
      itcEligibleCess = 0;
    let itcIneligibleTaxable = 0,
      itcIneligibleCgst = 0,
      itcIneligibleSgst = 0,
      itcIneligibleIgst = 0,
      itcIneligibleCess = 0;
    let itcEligibleCount = 0,
      itcIneligibleCount = 0;

    purchases.forEach((p) => {
      let hasEligibleItem = false;
      let hasIneligibleItem = false;
      p.items.forEach((item) => {
        if (item.isItcEligible) {
          hasEligibleItem = true;
          itcEligibleTaxable += item.taxableValue;
          itcEligibleCgst += item.cgstAmount;
          itcEligibleSgst += item.sgstAmount;
          itcEligibleIgst += item.igstAmount;
          itcEligibleCess += item.cessAmount;
        } else {
          hasIneligibleItem = true;
          itcIneligibleTaxable += item.taxableValue;
          itcIneligibleCgst += item.cgstAmount;
          itcIneligibleSgst += item.sgstAmount;
          itcIneligibleIgst += item.igstAmount;
          itcIneligibleCess += item.cessAmount;
        }
      });
      if (hasEligibleItem) itcEligibleCount++;
      if (hasIneligibleItem) itcIneligibleCount++;
    });

    // Tax Payable Calculations
    const totalOutwardTax = outwardCgst + outwardSgst + outwardIgst + outwardCess;
    const totalAvailableItc = itcEligibleCgst + itcEligibleSgst + itcEligibleIgst + itcEligibleCess;
    const netCashPayable = Math.max(0, totalOutwardTax - totalAvailableItc);

    res.json({
      period,
      gstin: business?.gstin || "NOT_SET",
      outwardSupplies: {
        invoiceCount: sales.length,
        taxableValue: outwardTaxable,
        cgst: outwardCgst,
        sgst: outwardSgst,
        igst: outwardIgst,
        cess: outwardCess,
        totalTax: totalOutwardTax,
      },
      eligibleItc: {
        billCount: itcEligibleCount,
        taxableValue: itcEligibleTaxable,
        cgst: itcEligibleCgst,
        sgst: itcEligibleSgst,
        igst: itcEligibleIgst,
        cess: itcEligibleCess,
        totalItc: totalAvailableItc,
      },
      ineligibleItc: {
        billCount: itcIneligibleCount,
        taxableValue: itcIneligibleTaxable,
        cgst: itcIneligibleCgst,
        sgst: itcIneligibleSgst,
        igst: itcIneligibleIgst,
        cess: itcIneligibleCess,
      },
      taxEstimator: {
        totalOutwardTax,
        totalAvailableItc,
        netCashPayable,
        plainSummary: `Sales ₹${(outwardTaxable / 100000).toFixed(2)}L, Tax ₹${totalOutwardTax.toFixed(0)}, ITC ₹${totalAvailableItc.toFixed(0)}, You pay ₹${netCashPayable.toFixed(0)}`,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate GSTR-3B summary." });
  }
});

// GSTR-3B Excel (same data as the JSON, in table form)
router.get("/gstr3b/excel", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const period = String(req.query.period || "");
    if (!isValidPeriod(period)) return res.status(400).json({ error: "Invalid filing period." });

    const { business, json, adjustmentConfirmed, lateFee } = await buildGstr3b(businessId, period);
    if (!business) return res.status(404).json({ error: "Business profile not found." });
    if (!adjustmentConfirmed) {
      return res.status(409).json({ error: "Review and confirm the GSTR-3B supplemental values for this period before exporting." });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GSTMitra";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("GSTR3B");
    sheet.columns = [{ width: 58 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];

    const blue = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF0F6FC6" } };
    const peach = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF8CBAD" } };

    const sectionTitle = (text: string) => {
      const row = sheet.addRow([text, "", "", "", "", ""]);
      row.eachCell((c) => {
        c.fill = blue;
        c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      });
      return row;
    };
    const columnHeader = (labels: string[]) => {
      const row = sheet.addRow(labels);
      row.eachCell((c) => {
        c.fill = peach;
        c.font = { bold: true, color: { argb: "FF404040" } };
        c.alignment = { wrapText: true, vertical: "middle" };
      });
    };
    const numRow = (values: (string | number)[]) => {
      const row = sheet.addRow(values);
      row.eachCell((c, col) => {
        if (col > 1) c.numFmt = "#,##0.00";
      });
    };

    const taxHeaders = ["Nature of Supplies", "Total Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax", "Cess"];
    const itcHeaders = ["Details", "", "Integrated Tax", "Central Tax", "State/UT Tax", "Cess"];

    sheet.addRow(["GSTR-3B"]).font = { bold: true, size: 14 };
    sheet.addRow(["GSTIN", json.gstin]);
    sheet.addRow(["Return Period (MMYYYY)", json.ret_period]);
    sheet.addRow(["Legal Name", business.name]);
    sheet.addRow([]);

    // 3.1
    const s = json.sup_details;
    sectionTitle("3.1 Details of Outward Supplies and inward supplies liable to reverse charge");
    columnHeader(taxHeaders);
    const t = (label: string, x: typeof s.osup_det) => numRow([label, x.txval, x.iamt, x.camt, x.samt, x.csamt]);
    t("(a) Outward taxable supplies (other than zero rated, nil rated and exempted)", s.osup_det);
    t("(b) Outward taxable supplies (zero rated)", s.osup_zero);
    t("(c) Other outward supplies (nil rated, exempted)", s.osup_nil_exmp);
    t("(d) Inward supplies (liable to reverse charge)", s.isup_rev);
    t("(e) Non-GST outward supplies", s.osup_nongst);
    sheet.addRow([]);

    // 4
    const names: Record<string, string> = {
      IMPG: "(1) Import of goods",
      IMPS: "(2) Import of services",
      ISRC: "(3) Inward supplies liable to reverse charge (other than 1 & 2 above)",
      ISD: "(4) Inward supplies from ISD",
      OTH: "(5) All other ITC",
    };
    const taxRow = (label: string, x: { iamt: number; camt: number; samt: number; csamt: number }) =>
      numRow([label, "", x.iamt, x.camt, x.samt, x.csamt]);
    sectionTitle("4. Eligible ITC");
    columnHeader(itcHeaders);
    sheet.addRow(["(A) ITC Available (whether in full or part)"]).font = { bold: true };
    ["IMPG", "IMPS", "ISRC", "ISD", "OTH"].forEach((ty) => {
      const x = json.itc_elg.itc_avl.find((a) => a.ty === ty)!;
      numRow([names[ty], "", x.iamt, x.camt, x.samt, x.csamt]);
    });
    sheet.addRow(["(B) ITC Reversed"]).font = { bold: true };
    taxRow("(1) As per rules 38, 42 & 43 of CGST Rules and section 17(5)", json.itc_elg.itc_rev[0]);
    taxRow("(2) Others", json.itc_elg.itc_rev[1]);
    const n = json.itc_elg.itc_net;
    const netRow = sheet.addRow(["(C) Net ITC Available (A) - (B)", "", n.iamt, n.camt, n.samt, n.csamt]);
    netRow.font = { bold: true };
    netRow.eachCell((c, col) => {
      if (col > 2) c.numFmt = "#,##0.00";
    });
    sheet.addRow(["(D) Ineligible ITC"]).font = { bold: true };
    const ine = json.itc_elg.itc_inelg;
    taxRow("(1) As per section 17(5) of CGST Act", ine[0]);
    taxRow("(2) Others", ine[1]);
    sheet.addRow([]);

    // 5
    sectionTitle("5. Values of exempt, nil-rated and non-GST inward supplies");
    columnHeader(["Nature of Supplies", "Inter-State Supplies", "Intra-State Supplies", "", "", ""]);
    const gst = json.inward_sup.isup_details.find((d) => d.ty === "GST")!;
    const non = json.inward_sup.isup_details.find((d) => d.ty === "NONGST")!;
    numRow(["From a supplier under composition scheme, exempt and nil rated supply", gst.inter, gst.intra]);
    numRow(["Non GST supply", non.inter, non.intra]);
    sheet.addRow([]);

    // 5.1
    sectionTitle("5.1 Interest and late fee");
    columnHeader(itcHeaders);
    const i = json.intr_ltfee.intr_details;
    numRow(["Interest", "", i.iamt, i.camt, i.samt, i.csamt]);
    numRow(["Late fee", "", lateFee.iamt, lateFee.camt, lateFee.samt, lateFee.csamt]);

    await sendReviewWorkbook(res, workbook, `GSTR3B_${safeReportFilePart(business.gstin)}_${period}.xlsx`);
  } catch (error) {
    if (error instanceof Gstr3bReviewError) return res.status(409).json({ error: error.message });
    console.error("GSTR-3B Excel export error:", error);
    res.status(500).json({ error: "Failed to export GSTR-3B workbook." });
  }
});

// GSTR-3B JSON Download (full portal format)
router.get("/gstr3b/json", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const period = String(req.query.period || "");
    if (!isValidPeriod(period)) return res.status(400).json({ error: "Invalid filing period." });

    const { business, json, adjustmentConfirmed } = await buildGstr3b(businessId, period);
    if (!business) return res.status(404).json({ error: "Business profile not found." });
    if (!adjustmentConfirmed) {
      return res.status(409).json({ error: "Review and confirm the GSTR-3B supplemental values for this period before exporting." });
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="GSTR3B_${safeReportFilePart(business?.gstin)}_${period}.json"`);
    res.send(JSON.stringify(json));
  } catch (error) {
    if (error instanceof Gstr3bReviewError) return res.status(409).json({ error: error.message });
    console.error("GSTR-3B JSON error:", error);
    res.status(500).json({ error: "Failed to generate GSTR-3B JSON." });
  }
});

// -------------------------------------------------------------
// 3. GSTR-2B (From Your Books)
// -------------------------------------------------------------
router.get("/gstr2b-books/summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { period, startDate, endDate } = parsePeriod(req.query.period as string);

    const bills = await prisma.purchaseBill.findMany({
      where: { businessId, billDate: { gte: startDate, lte: endDate } },
      include: { vendor: true, items: true },
    });

    const creditNotes = await prisma.creditDebitNote.findMany({
      where: {
        businessId,
        noteDate: { gte: startDate, lte: endDate },
        noteType: { in: ["PURCHASE_DEBIT_NOTE", "PURCHASE_CREDIT_NOTE"] },
      },
      include: { vendor: true },
    });

    // Only categories backed by purchase bills or purchase notes are reported.
    const rowCategories = {
      registered: { key: "registered", rowName: "Registered suppliers", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
      unregistered: { key: "unregistered", rowName: "Unregistered suppliers", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
      cnRegistered: { key: "cnRegistered", rowName: "Credit/debit notes — registered suppliers", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
      cnUnregistered: { key: "cnUnregistered", rowName: "Credit/debit notes — unregistered suppliers", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
      goodsOverseas: { key: "goodsOverseas", rowName: "Imported goods", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
      servicesOverseas: { key: "servicesOverseas", rowName: "Imported services", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
      reverseCharge: { key: "reverseCharge", rowName: "Reverse-charge purchases", count: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 },
    };

    let totalItcClaimable = 0;
    let totalItcBlocked = 0;

    bills.forEach((b) => {
      b.items.forEach((item) => {
        const taxTotal = item.cgstAmount + item.sgstAmount + item.igstAmount + item.cessAmount;
        if (item.isItcEligible) totalItcClaimable += taxTotal;
        else totalItcBlocked += taxTotal;
      });

      if (b.supplyType === "IMPORT_GOODS") {
        rowCategories.goodsOverseas.count++;
        rowCategories.goodsOverseas.taxable += b.subtotal;
        rowCategories.goodsOverseas.igst += b.totalIgst;
        rowCategories.goodsOverseas.cess += b.totalCess;
        rowCategories.goodsOverseas.total += b.totalAmount;
      } else if (b.supplyType === "IMPORT_SERVICES") {
        rowCategories.servicesOverseas.count++;
        rowCategories.servicesOverseas.taxable += b.subtotal;
        rowCategories.servicesOverseas.igst += b.totalIgst;
        rowCategories.servicesOverseas.cess += b.totalCess;
        rowCategories.servicesOverseas.total += b.totalAmount;
      } else if (b.isReverseCharge) {
        rowCategories.reverseCharge.count++;
        rowCategories.reverseCharge.taxable += b.subtotal;
        rowCategories.reverseCharge.igst += b.totalIgst;
        rowCategories.reverseCharge.cgst += b.totalCgst;
        rowCategories.reverseCharge.sgst += b.totalSgst;
        rowCategories.reverseCharge.cess += b.totalCess;
        rowCategories.reverseCharge.total += b.totalAmount;
      } else if (b.vendor.vendorType === "REGISTERED") {
        rowCategories.registered.count++;
        rowCategories.registered.taxable += b.subtotal;
        rowCategories.registered.igst += b.totalIgst;
        rowCategories.registered.cgst += b.totalCgst;
        rowCategories.registered.sgst += b.totalSgst;
        rowCategories.registered.cess += b.totalCess;
        rowCategories.registered.total += b.totalAmount;
      } else {
        rowCategories.unregistered.count++;
        rowCategories.unregistered.taxable += b.subtotal;
        rowCategories.unregistered.igst += b.totalIgst;
        rowCategories.unregistered.cgst += b.totalCgst;
        rowCategories.unregistered.sgst += b.totalSgst;
        rowCategories.unregistered.cess += b.totalCess;
        rowCategories.unregistered.total += b.totalAmount;
      }
    });

    creditNotes.forEach((cn) => {
      const isReg = cn.vendor?.vendorType === "REGISTERED";
      const target = isReg ? rowCategories.cnRegistered : rowCategories.cnUnregistered;
      target.count++;
      target.taxable += cn.taxableValue;
      target.igst += cn.igstAmount;
      target.cgst += cn.cgstAmount;
      target.sgst += cn.sgstAmount;
      target.cess += cn.cessAmount;
      target.total += cn.totalAmount;
    });

    Object.values(rowCategories).forEach((row) => {
      row.totalTax = row.igst + row.cgst + row.sgst + row.cess;
    });

    res.json({
      period,
      disclaimerLabel: "Based on your own bills, not the official GSTR-2B. Final ITC depends on the portal.",
      topBoxText: `Purchase books record ₹${(totalItcClaimable + totalItcBlocked).toFixed(2)} tax. Potential ITC marked eligible in your books: ₹${totalItcClaimable.toFixed(2)}.`,
      itcClaimable: totalItcClaimable,
      itcBlocked: totalItcBlocked,
      rows: Object.values(rowCategories).filter((row) => row.count > 0),
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to generate GSTR-2B (From Your Books) summary." });
  }
});

// GSTR-2B Excel (plain table, header on row 2, SGST/CGST/IGST columns)
router.get("/gstr2b-books/excel", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const period = String(req.query.period || "");
    if (!isValidPeriod(period)) return res.status(400).json({ error: "Invalid filing period." });
    const { startDate, endDate } = parsePeriod(period);

    const [business, bills] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId } }),
      prisma.purchaseBill.findMany({
        where: { businessId, billDate: { gte: startDate, lte: endDate } },
        include: { vendor: true, items: true },
        orderBy: [{ billDate: "asc" }, { billNumber: "asc" }],
      }),
    ]);
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "GSTMitra";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("GSTR2B");
    sheet.columns = [
      { width: 22 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 20 },
      { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 },
    ];

    sheet.addRow([]); // row 1 is blank, like the sample (delete this line if header should be on row 1)
    const header = sheet.addRow([
      "GSTIN/UIN of Recipient",
      "Vendor Name",
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Place Of Supply",
      "Rate",
      "Taxable Value",
      "Cess Amount",
      "SGST Tax Amount",
      "CGST Tax Amount",
      "IGST Tax Amount",
    ]);
    header.eachCell((cell, col) => {
      cell.font = { bold: false };
      cell.alignment = { horizontal: col >= 5 && col !== 6 ? "right" : "left" };
    });

    bills.forEach((bill) => {
      groupByRate(bill.items).forEach((line, index) => {
        const row = sheet.addRow([
          bill.vendor.gstin || "",
          bill.vendor.name,
          bill.billNumber,
          isoDate(bill.billDate), // text like 2026-10-02
          index === 0 ? bill.totalAmount : "",
          formatPlaceOfSupply(bill.placeOfSupply, bill.vendor.stateName),
          line.rate,
          line.taxable,
          line.cess,
          line.sgst,
          line.cgst,
          line.igst,
        ]);
        [5, 8, 9, 10, 11, 12].forEach((column) => {
          row.getCell(column).numFmt = "0.00";
        });
      });
    });

    await sendReviewWorkbook(res, workbook, `GSTR2B_${safeReportFilePart(business.gstin)}_${period}.xlsx`);
  } catch (error) {
    console.error("GSTR-2B Excel export error:", error);
    res.status(500).json({ error: "Failed to export GSTR-2B workbook." });
  }
});

// Drill-down for GSTR-2B Books
router.get("/gstr2b-books/drilldown", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const { startDate, endDate } = parsePeriod(req.query.period as string);
    const rowKey = String(req.query.category || "");

    const bills = await prisma.purchaseBill.findMany({
      where: { businessId, billDate: { gte: startDate, lte: endDate } },
      include: { vendor: true },
      orderBy: { billDate: "desc" },
    });

    let filteredBills = bills;
    if (rowKey === "registered") {
      filteredBills = bills.filter((b) => b.vendor.vendorType === "REGISTERED" && !b.isReverseCharge);
    } else if (rowKey === "unregistered") {
      filteredBills = bills.filter((b) => b.vendor.vendorType === "UNREGISTERED" && !b.isReverseCharge);
    } else if (rowKey === "reverseCharge") {
      filteredBills = bills.filter(
        (b) => b.isReverseCharge && b.supplyType !== "IMPORT_GOODS" && b.supplyType !== "IMPORT_SERVICES"
      );
    } else if (rowKey === "goodsOverseas") {
      filteredBills = bills.filter((b) => b.supplyType === "IMPORT_GOODS");
    } else if (rowKey === "servicesOverseas") {
      filteredBills = bills.filter((b) => b.supplyType === "IMPORT_SERVICES");
    } else {
      filteredBills = [];
    }

    type DrilldownRecord = {
      id: string;
      type: string;
      referenceNumber: string;
      date: Date;
      vendorName: string;
      taxableValue: number;
      cgst: number;
      sgst: number;
      igst: number;
      cess: number;
      totalAmount: number;
      isItcEligible: boolean | null;
    };

    const billRecords: DrilldownRecord[] = filteredBills.map((bill) => ({
      id: bill.id,
      type: "Bill",
      referenceNumber: bill.billNumber,
      date: bill.billDate,
      vendorName: bill.vendor.name,
      taxableValue: bill.subtotal,
      cgst: bill.totalCgst,
      sgst: bill.totalSgst,
      igst: bill.totalIgst,
      cess: bill.totalCess,
      totalAmount: bill.totalAmount,
      isItcEligible: bill.isItcEligible,
    }));

    let noteRecords: DrilldownRecord[] = [];
    if (rowKey === "cnRegistered" || rowKey === "cnUnregistered") {
      const notes = await prisma.creditDebitNote.findMany({
        where: {
          businessId,
          noteDate: { gte: startDate, lte: endDate },
          noteType: { in: ["PURCHASE_DEBIT_NOTE", "PURCHASE_CREDIT_NOTE"] },
        },
        include: { vendor: true },
        orderBy: { noteDate: "desc" },
      });
      noteRecords = notes
        .filter((note) => (note.vendor?.vendorType === "REGISTERED") === (rowKey === "cnRegistered"))
        .map((note) => ({
          id: note.id,
          type: note.noteType === "PURCHASE_CREDIT_NOTE" ? "Credit note" : "Debit note",
          referenceNumber: note.noteNumber,
          date: note.noteDate,
          vendorName: note.vendor?.name || "Unknown supplier",
          taxableValue: note.taxableValue,
          cgst: note.cgstAmount,
          sgst: note.sgstAmount,
          igst: note.igstAmount,
          cess: note.cessAmount,
          totalAmount: note.totalAmount,
          isItcEligible: null,
        }));
    }
    const records = [...billRecords, ...noteRecords].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    res.json({
      category: rowKey,
      count: records.length,
      records,
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch drill-down bills." });
  }
});

// GSTR-2B (From Your Books) JSON Export
router.get("/gstr2b-books/json", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const { period, startDate, endDate } = parsePeriod(req.query.period as string);
    const business = await prisma.business.findUnique({ where: { id: businessId } });

    const bills = await prisma.purchaseBill.findMany({
      where: { businessId, billDate: { gte: startDate, lte: endDate } },
      include: { vendor: true, items: true },
    });

    const jsonPayload = {
      isFromBooks: true,
      disclaimer: "Based on your own bills, not the official GSTR-2B. Final ITC depends on the portal.",
      gstin: business?.gstin || "",
      period,
      generatedAt: new Date().toISOString(),
      bills: bills.map((b) => ({
        billNumber: b.billNumber,
        billDate: b.billDate,
        vendorGstin: b.vendor.gstin,
        vendorName: b.vendor.name,
        taxableValue: b.subtotal,
        cgst: b.totalCgst,
        sgst: b.totalSgst,
        igst: b.totalIgst,
        isItcEligible: b.isItcEligible,
        totalAmount: b.totalAmount,
      })),
    };

    const fileName = `GSTR2B_BOOKS_${business?.gstin || "DRAFT"}_${period}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(JSON.stringify(jsonPayload, null, 2));
  } catch (error: any) {
    res.status(500).json({ error: "Failed to export GSTR-2B Books JSON." });
  }
});

export default router;