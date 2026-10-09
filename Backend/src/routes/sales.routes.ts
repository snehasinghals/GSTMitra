import { Router, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
import { allocateUniqueInvoiceNumber } from "../lib/invoiceNumbers.js";  
import { r2 } from "../lib/money.js";

const router = Router();

// Safety limits so one typo can't break GST returns or the PDF layout.
const MAX_RATE = 10_000_000; // 1 crore per unit
const MAX_QTY = 1_000_000; // 10 lakh units
const MAX_INVOICE_TOTAL = 999_999_999; // numberToWords supports up to 9 digits

// List all sales invoices
// GET /invoices?view=list  -> lean payload for the Sales page table (no line items, max `limit` rows)
// GET /invoices            -> unchanged full payload (customer + items) for any other caller
router.get("/invoices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { customerId, status, search, startDate, endDate } = req.query;

    const whereClause: any = { businessId };

    if (customerId) whereClause.customerId = String(customerId);
    if (status) whereClause.status = String(status);

    if (startDate || endDate) {
      whereClause.invoiceDate = {};
      if (startDate) whereClause.invoiceDate.gte = new Date(String(startDate));
      if (endDate) whereClause.invoiceDate.lte = new Date(String(endDate));
    }

    if (search) {
      const q = String(search).trim();
      whereClause.OR = [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const isListView = req.query.view === "list";
    const take = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);

    const invoices = await prisma.salesInvoice.findMany({
      where: whereClause,
      include: isListView
        ? { customer: { select: { id: true, name: true, gstin: true, stateCode: true, stateName: true } } }
        : { customer: true, items: true },
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
      ...(isListView ? { take } : {}),
    });

    res.json(invoices);
  } catch (error: any) {
    console.error("Fetch invoices error:", error);
    res.status(500).json({ error: "Failed to fetch invoices." });
  }
});

// Sales summary metrics (Paid/Unpaid totals) - computed inside the database, not in Node
router.get("/summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const agg = await prisma.salesInvoice.aggregate({
      where: { businessId, status: { not: "CANCELLED" } },
      _sum: {
        totalAmount: true,
        subtotal: true,
        totalCgst: true,
        totalSgst: true,
        totalIgst: true,
        totalCess: true,
        paidAmount: true,
      },
      _count: true,
    });

    const s = agg._sum;
    const totalSales = s.totalAmount ?? 0;
    const totalPaid = s.paidAmount ?? 0;

    res.json({
      totalSales,
      totalTaxable: s.subtotal ?? 0,
      totalTaxCollected: (s.totalCgst ?? 0) + (s.totalSgst ?? 0) + (s.totalIgst ?? 0) + (s.totalCess ?? 0),
      totalPaid,
      totalUnpaid: totalSales - totalPaid,
      invoiceCount: agg._count,
    });
  } catch (error: any) {
    console.error("Sales summary error:", error);
    res.status(500).json({ error: "Failed to fetch sales summary." });
  }
});

router.get("/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: req.params.id as string, businessId },
      include: { customer: true, items: true },
    });
    if (!invoice) return res.status(404).json({ error: "Sales invoice not found." });
    res.json(invoice);
  } catch (error) {
    console.error("Fetch sales invoice error:", error);
    res.status(500).json({ error: "Failed to fetch sales invoice." });
  }
});

// Create sales invoice
router.post("/invoices", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business profile not found" });

    const {
      customerId,
      invoiceDate,
      dueDate,
      placeOfSupply,
      notes,
      items,
      status,
      isReverseCharge: rawIsReverseCharge,
      applicablePercent: rawApplicablePercent,
      ecomGstin: rawEcomGstin,
    } = req.body;

    const isReverseCharge = rawIsReverseCharge === undefined ? false : rawIsReverseCharge;
    if (typeof isReverseCharge !== "boolean") {
      return res.status(400).json({ error: "isReverseCharge must be a boolean." });
    }

    let applicablePercent: number | null = null;
    if (rawApplicablePercent !== undefined && rawApplicablePercent !== null && rawApplicablePercent !== "") {
      if (
        typeof rawApplicablePercent !== "number" ||
        !Number.isFinite(rawApplicablePercent) ||
        rawApplicablePercent < 0 ||
        rawApplicablePercent > 100
      ) {
        return res.status(400).json({ error: "Applicable % of Tax Rate must be a number between 0 and 100, or empty." });
      }
      applicablePercent = rawApplicablePercent;
    }

    let ecomGstin: string | null = null;
    if (rawEcomGstin !== undefined && rawEcomGstin !== null && rawEcomGstin !== "") {
      if (typeof rawEcomGstin !== "string") {
        return res.status(400).json({ error: "E-Commerce GSTIN must be exactly 15 uppercase letters or digits, or empty." });
      }
      ecomGstin = rawEcomGstin.toUpperCase();
      if (!/^[A-Z0-9]{15}$/.test(ecomGstin)) {
        return res.status(400).json({ error: "E-Commerce GSTIN must be exactly 15 uppercase letters or digits, or empty." });
      }
    }

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Customer and at least one item are required." });
    }

    for (const [i, it] of items.entries()) {
      const qty = Number(it.quantity);
      const rate = Number(it.rate);
      const discount = Number(it.discount || 0);
      const gst = Number(it.gstRate ?? 18);

      if (!it.description || !String(it.description).trim()) {
        return res.status(400).json({ error: `Item ${i + 1}: description is required.` });
      }
      if (!(qty > 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity must be greater than 0.` });
      }
      if (!(rate > 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: rate must be greater than 0.` });
      }
      if (qty > MAX_QTY) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity is too large (max ${MAX_QTY}).` });
      }
      if (rate > MAX_RATE) {
        return res.status(400).json({ error: `Item ${i + 1}: rate is too large (max ${MAX_RATE}).` });
      }
      if (discount < 0 || discount > qty * rate) {
        return res.status(400).json({ error: `Item ${i + 1}: invalid discount.` });
      }
      if (!(gst >= 0 && gst <= 40)) {
        return res.status(400).json({ error: `Item ${i + 1}: invalid GST rate.` });
      }
    }

    const invDate = invoiceDate ? new Date(invoiceDate) : new Date();
    if (isNaN(invDate.getTime())) {
      return res.status(400).json({ error: "Invalid invoice date." });
    }

    const customer = await prisma.customer.findFirst({ where: { id: String(customerId), businessId } });
    if (!customer) return res.status(404).json({ error: "Customer not found." });

    // Invoice numbers are always assigned by GSTMitra so GST returns never get colliding sequences.
    const invNum = await allocateUniqueInvoiceNumber(businessId);
    const pos = placeOfSupply || customer.stateCode || business.stateCode;

    const isIntraState = business.stateCode === pos;
    const supplyType = isIntraState ? "INTRA_STATE" : "INTER_STATE";

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;

    const formattedItems = items.map((item: any) => {
      const qty = Number(item.quantity || 1);
      const rate = Number(item.rate || 0);
      const discount = Number(item.discount || 0);
      const taxableVal = r2(Math.max(0, qty * rate - discount));
      const gstRate = Number(item.gstRate ?? 18);
      const cessRate = Number(item.cessRate || 0);

      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      const cess = r2((taxableVal * cessRate) / 100);

      if (isIntraState) {
        cgst = r2((taxableVal * (gstRate / 2)) / 100);
        sgst = r2((taxableVal * (gstRate / 2)) / 100);
      } else {
        igst = r2((taxableVal * gstRate) / 100);
      }

      const itemTotal = r2(taxableVal + cgst + sgst + igst + cess);

      subtotal += taxableVal;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalCess += cess;

      return {
        itemId: item.itemId ? String(item.itemId) : null,
        description: item.description || "Goods / Services",
        hsnSacCode: item.hsnSacCode || "998313",
        quantity: qty,
        unit: item.unit || "PCS",
        rate,
        discount,
        taxableValue: taxableVal,
        gstRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        cessRate,
        cessAmount: cess,
        totalAmount: itemTotal,
      };
    });

    subtotal = r2(subtotal);
    totalCgst = r2(totalCgst);
    totalSgst = r2(totalSgst);
    totalIgst = r2(totalIgst);
    totalCess = r2(totalCess);

    const totalBeforeRound = subtotal + totalCgst + totalSgst + totalIgst + totalCess;
    const grandTotal = Math.round(totalBeforeRound);
    const roundOff = r2(grandTotal - totalBeforeRound);

    if (grandTotal > MAX_INVOICE_TOTAL) {
      return res.status(400).json({ error: "Invoice total is too large. Please check the rates and quantities." });
    }

    const invoice = await prisma.salesInvoice.create({
      data: {
        businessId,
        customerId: String(customerId),
        invoiceNumber: String(invNum),
        invoiceDate: invDate,
        dueDate: dueDate ? new Date(dueDate) : null,
        supplyType,
        placeOfSupply: String(pos),
        isReverseCharge,
        applicablePercent,
        ecomGstin,
        status: status ? String(status) : "ISSUED",
        paymentStatus: "UNPAID",
        notes: notes ? String(notes) : null,
        subtotal,
        totalCgst,
        totalSgst,
        totalIgst,
        totalCess,
        roundOff,
        totalAmount: grandTotal,
        paidAmount: 0,
        items: {
          create: formattedItems,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });

    res.json(invoice);
  } catch (error: any) {
    console.error("Create invoice error:", error);
    res.status(500).json({ error: "Failed to create sales invoice." });
  }
});

router.put("/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const existing = await prisma.salesInvoice.findFirst({
      where: { id: req.params.id as string, businessId },
      include: { items: true },
    });
    if (!existing) return res.status(404).json({ error: "Sales invoice not found." });

    const {
      customerId,
      invoiceDate,
      dueDate,
      placeOfSupply,
      notes,
      items,
      isReverseCharge = false,
      applicablePercent: rawApplicablePercent,
      ecomGstin: rawEcomGstin,
    } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Customer and at least one item are required." });
    }
    if (typeof isReverseCharge !== "boolean") {
      return res.status(400).json({ error: "isReverseCharge must be a boolean." });
    }
    if (
      rawApplicablePercent !== undefined &&
      rawApplicablePercent !== null &&
      rawApplicablePercent !== "" &&
      (typeof rawApplicablePercent !== "number" || !Number.isFinite(rawApplicablePercent) || rawApplicablePercent < 0 || rawApplicablePercent > 100)
    ) {
      return res.status(400).json({ error: "Applicable % of Tax Rate must be a number between 0 and 100, or empty." });
    }
    let ecomGstin: string | null = null;
    if (rawEcomGstin) {
      if (typeof rawEcomGstin !== "string" || !/^[A-Z0-9]{15}$/i.test(rawEcomGstin)) {
        return res.status(400).json({ error: "E-Commerce GSTIN must be exactly 15 uppercase letters or digits, or empty." });
      }
      ecomGstin = rawEcomGstin.toUpperCase();
    }

    for (const [index, item] of items.entries()) {
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);
      const gstRate = Number(item.gstRate ?? 18);
      const discount = Number(item.discount ?? 0);
      if (!item.description || !String(item.description).trim() || !(quantity > 0) || !(rate > 0) ||
          quantity > MAX_QTY || rate > MAX_RATE || discount < 0 || discount > quantity * rate ||
          !(gstRate >= 0 && gstRate <= 40)) {
        return res.status(400).json({ error: `Item ${index + 1}: enter a valid description, quantity, rate, discount, and GST rate.` });
      }
    }

    const parsedDate = new Date(invoiceDate);
    if (Number.isNaN(parsedDate.getTime())) return res.status(400).json({ error: "Invalid invoice date." });
    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (dueDate && (!parsedDueDate || Number.isNaN(parsedDueDate.getTime()) || parsedDueDate < parsedDate)) {
      return res.status(400).json({ error: "Invalid due date." });
    }
    const customer = await prisma.customer.findFirst({ where: { id: String(customerId), businessId } });
    if (!customer) return res.status(404).json({ error: "Customer not found." });
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const pos = String(placeOfSupply || customer.stateCode || business.stateCode);
    const intraState = business.stateCode === pos;
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;
    const formattedItems = items.map((item: any) => {
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);
      const discount = Number(item.discount ?? 0);
      const taxableValue = r2(Math.max(0, quantity * rate - discount));
      const gstRate = Number(item.gstRate ?? 18);
      const cessRate = Number(item.cessRate ?? 0);
      const cgstAmount = intraState ? r2((taxableValue * (gstRate / 2)) / 100) : 0;
      const sgstAmount = intraState ? cgstAmount : 0;
      const igstAmount = intraState ? 0 : r2((taxableValue * gstRate) / 100);
      const cessAmount = r2((taxableValue * cessRate) / 100);
      subtotal += taxableValue;
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
      totalIgst += igstAmount;
      totalCess += cessAmount;
      return {
        itemId: item.itemId ? String(item.itemId) : null,
        description: String(item.description).trim(),
        hsnSacCode: item.hsnSacCode || "998313",
        quantity,
        unit: item.unit || "PCS",
        rate,
        discount,
        taxableValue,
        gstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        cessRate,
        cessAmount,
        totalAmount: r2(taxableValue + cgstAmount + sgstAmount + igstAmount + cessAmount),
      };
    });
    subtotal = r2(subtotal);
    totalCgst = r2(totalCgst);
    totalSgst = r2(totalSgst);
    totalIgst = r2(totalIgst);
    totalCess = r2(totalCess);
    const beforeRound = subtotal + totalCgst + totalSgst + totalIgst + totalCess;
    const totalAmount = Math.round(beforeRound);
    if (totalAmount > MAX_INVOICE_TOTAL) return res.status(400).json({ error: "Invoice total is too large." });
    if (totalAmount < existing.paidAmount - 0.01) {
      return res.status(400).json({ error: "Updated total cannot be lower than the payments already recorded." });
    }

    const invoice = await prisma.$transaction(async (tx) => tx.salesInvoice.update({
      where: { id: existing.id },
      data: {
        customerId: String(customerId),
        invoiceDate: parsedDate,
        dueDate: parsedDueDate,
        supplyType: intraState ? "INTRA_STATE" : "INTER_STATE",
        placeOfSupply: pos,
        isReverseCharge,
        applicablePercent: rawApplicablePercent === undefined || rawApplicablePercent === null || rawApplicablePercent === "" ? null : Number(rawApplicablePercent),
        ecomGstin,
        notes: notes ? String(notes) : null,
        subtotal,
        totalCgst,
        totalSgst,
        totalIgst,
        totalCess,
        roundOff: r2(totalAmount - beforeRound),
        totalAmount,
        items: {
          deleteMany: {},
          create: formattedItems,
        },
      },
      include: { customer: true, items: true },
    }));
    res.json(invoice);
  } catch (error: any) {
    console.error("Update sales invoice error:", error);
    res.status(500).json({ error: "Failed to update sales invoice." });
  }
});

// Update invoice payment status
router.patch("/invoices/:id/payment", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;
    const { paidAmount, paymentStatus } = req.body;

    const existing = await prisma.salesInvoice.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Invoice not found." });

    const newPaid = paidAmount !== undefined ? Number(paidAmount) : existing.paidAmount;
    if (!Number.isFinite(newPaid) || newPaid < 0) {
      return res.status(400).json({ error: "Invalid paid amount." });
    }
    let newStatus = paymentStatus ? String(paymentStatus) : null;

    if (!newStatus) {
      if (newPaid >= existing.totalAmount) newStatus = "PAID";
      else if (newPaid > 0) newStatus = "PARTIAL";
      else newStatus = "UNPAID";
    }

    const updated = await prisma.salesInvoice.update({
      where: { id },
      data: {
        paidAmount: newPaid,
        paymentStatus: newStatus,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update payment status." });
  }
});

// Helper to convert number to words (Indian Currency Format)
function numberToWords(num: number): string {
  const a = [
    "", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n < 0) return "";
    const strNum = Math.floor(n).toString().padStart(9, "0");
    const n_arr = strNum.match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_arr) return "";
    let str = "";
    str += Number(n_arr[1]) !== 0 ? (a[Number(n_arr[1])] || b[Number(n_arr[1][0])] + " " + a[Number(n_arr[1][1])]) + "Crore " : "";
    str += Number(n_arr[2]) !== 0 ? (a[Number(n_arr[2])] || b[Number(n_arr[2][0])] + " " + a[Number(n_arr[2][1])]) + "Lakh " : "";
    str += Number(n_arr[3]) !== 0 ? (a[Number(n_arr[3])] || b[Number(n_arr[3][0])] + " " + a[Number(n_arr[3][1])]) + "Thousand " : "";
    str += Number(n_arr[4]) !== 0 ? (a[Number(n_arr[4])] || b[Number(n_arr[4][0])] + " " + a[Number(n_arr[4][1])]) + "Hundred " : "";
    str += Number(n_arr[5]) !== 0 ? (str !== "" ? "and " : "") + (a[Number(n_arr[5])] || b[Number(n_arr[5][0])] + " " + a[Number(n_arr[5][1])]) : "";
    return str;
  }

  const whole = Math.floor(num);
  const fraction = Math.round((num - whole) * 100);

  let result = "Indian Rupee " + (whole === 0 ? "Zero " : inWords(whole));
  if (fraction > 0) {
    result += "and " + inWords(fraction) + "Paise ";
  }
  return result.trim() + " Only";
}

// ============================================================================
// PDF (Zoho Books style)
// ============================================================================

// Indian number format: 1,18,000.00
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

// Optional fonts for the ₹ symbol. Put NotoSerif-Regular.ttf and NotoSerif-Bold.ttf in  <backend>/fonts/
// (the folder you run `npm run dev` from). If they are missing, the PDF falls back to Times + "Rs.".
const FONT_DIR = path.join(process.cwd(), "fonts");
const SERIF_REGULAR = path.join(FONT_DIR, "NotoSerif-Regular.ttf");
const SERIF_BOLD = path.join(FONT_DIR, "NotoSerif-Bold.ttf");
const hasRupeeFont = fs.existsSync(SERIF_REGULAR) && fs.existsSync(SERIF_BOLD);

type Align = "left" | "center" | "right";
type Col = { key: string; label: string; w: number; align: Align; group?: string; x: number };

// Table columns. Total width = 535 (x from 30 to 565).
// Same state -> CGST + SGST columns, other state -> IGST columns (like Zoho).
const buildColumns = (isIntra: boolean): Col[] => {
  const defs: Omit<Col, "x">[] = isIntra
    ? [
        { key: "idx", label: "#", w: 20, align: "center" },
        { key: "desc", label: "Item & Description", w: 135, align: "left" },
        { key: "hsn", label: "HSN/SAC", w: 50, align: "center" },
        { key: "qty", label: "Qty", w: 42, align: "right" },
        { key: "rate", label: "Rate", w: 62, align: "right" },
        { key: "cgstPct", label: "%", w: 28, align: "right", group: "CGST" },
        { key: "cgstAmt", label: "Amt", w: 50, align: "right", group: "CGST" },
        { key: "sgstPct", label: "%", w: 28, align: "right", group: "SGST" },
        { key: "sgstAmt", label: "Amt", w: 50, align: "right", group: "SGST" },
        { key: "amount", label: "Amount", w: 70, align: "right" },
      ]
    : [
        { key: "idx", label: "#", w: 20, align: "center" },
        { key: "desc", label: "Item & Description", w: 190, align: "left" },
        { key: "hsn", label: "HSN/SAC", w: 55, align: "center" },
        { key: "qty", label: "Qty", w: 50, align: "right" },
        { key: "rate", label: "Rate", w: 70, align: "right" },
        { key: "igstPct", label: "%", w: 35, align: "right", group: "IGST" },
        { key: "igstAmt", label: "Amt", w: 55, align: "right", group: "IGST" },
        { key: "amount", label: "Amount", w: 60, align: "right" },
      ];

  let x = 30;
  return defs.map((d) => {
    const c: Col = { ...d, x };
    x += d.w;
    return c;
  });
};

// PDF Export endpoint for Invoices
router.get("/invoices/:id/pdf", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id, businessId },
      include: { customer: true, items: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}.pdf"`);
    doc.pipe(res);

    // ---------- Fonts (Zoho uses a serif font) ----------
    if (hasRupeeFont) {
      doc.registerFont("Serif", SERIF_REGULAR);
      doc.registerFont("SerifBold", SERIF_BOLD);
    }
    const F = {
      reg: hasRupeeFont ? "Serif" : "Times-Roman",
      bold: hasRupeeFont ? "SerifBold" : "Times-Bold",
      italic: "Times-Italic",
      boldItalic: "Times-BoldItalic",
    };
    const rs = hasRupeeFont ? "₹" : "Rs. ";

    // ---------- Layout constants ----------
    const LEFT = 30;
    const RIGHT = 565;
    const MID = 297;
    const HEAD_H = 30; // table header height (group row + sub-label row)
    const TABLE_BOTTOM = 500;
    const ROW_LIMIT = 490;
    const GRID = "#777777"; // vertical grid / divider colour

    const isIntra = invoice.supplyType === "INTRA_STATE";
    const cols = buildColumns(isIntra);
    const colByKey = (k: string) => cols.find((c) => c.key === k)!;

    const line = (x1: number, y1: number, x2: number, y2: number, color = "#333333") => {
      doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.5).strokeColor(color).stroke();
    };

    const drawFrame = () => {
      doc.rect(30, 30, 535, 780).lineWidth(0.75).strokeColor("#222222").stroke();
    };

    const drawTableHeader = (top: number) => {
      doc.rect(LEFT + 0.25, top + 0.25, 534.5, HEAD_H).fillColor("#F2F3F5").fill();
      line(LEFT, top, RIGHT, top);

      doc.font(F.bold).fontSize(8).fillColor("#111111");
      const doneGroups = new Set<string>();

      cols.forEach((c) => {
        if (c.group) {
          doc.text(c.label, c.x + 3, top + 19, { width: c.w - 6, align: "center", lineBreak: false });
          if (!doneGroups.has(c.group)) {
            doneGroups.add(c.group);
            const gcols = cols.filter((g) => g.group === c.group);
            const gx = gcols[0].x;
            const gw = gcols.reduce((s, g) => s + g.w, 0);
            doc.text(c.group, gx, top + 4, { width: gw, align: "center", lineBreak: false });
            line(gx, top + 15, gx + gw, top + 15);
          }
        } else {
          doc.text(c.label, c.x + 3, top + 11, { width: c.w - 6, align: c.align, lineBreak: false });
        }
      });

      line(LEFT, top + HEAD_H, RIGHT, top + HEAD_H);
    };

    // Vertical column lines run through the header AND all item rows, down to the table bottom.
    const drawTableGrid = (top: number) => {
      cols.forEach((c, i) => {
        if (i === 0) return;
        const prev = cols[i - 1];
        // between "%" and "Amt" of one tax group the line starts below the group name
        const startY = c.group && prev.group === c.group ? top + 15 : top;
        line(c.x, startY, c.x, TABLE_BOTTOM, GRID);
      });
      line(LEFT, TABLE_BOTTOM, RIGHT, TABLE_BOTTOM);
    };

    drawFrame();

    // ==================== 1. HEADER (logo + business + TAX INVOICE) ====================
    let textX = 40;
    // Optional logo: add `logoDataUrl String?` to the Business model later and it shows up here.
    const logoDataUrl = (business as any).logoDataUrl as string | undefined;
    if (logoDataUrl && logoDataUrl.startsWith("data:image")) {
      try {
        const buf = Buffer.from(logoDataUrl.split(",")[1], "base64");
        doc.image(buf, 40, 40, { fit: [80, 70] });
        textX = 135;
      } catch {
        /* bad logo data - skip the logo */
      }
    }
    const textW = 335 - textX;

    doc.font(F.bold).fontSize(13).fillColor("#111111").text(business.name, textX, 42, { width: textW });

    let y = 58;
    const addLine = (t: string, bold = false) => {
      doc.font(bold ? F.bold : F.reg).fontSize(8.5).fillColor("#222222");
      doc.text(t, textX, y, { width: textW });
      y += doc.heightOfString(t, { width: textW }) + 2;
    };
    if (business.address) addLine(business.address);
    if (business.stateName) addLine(business.stateName);
    addLine("India");
    if (business.gstin) addLine(`GSTIN ${business.gstin}`);
    if (business.phone) addLine(String(business.phone));
    if (business.email) addLine(business.email);

    const headerBottom = Math.max(118, y + 6);

    doc.font(F.reg).fontSize(24).fillColor("#111111");
    doc.text("TAX INVOICE", 340, headerBottom - 40, { width: 215, align: "right", lineBreak: false });

    // ==================== 2. META GRID (invoice no, dates, place of supply) ====================
    const metaTop = headerBottom;
    const metaBottom = metaTop + 62;
    line(LEFT, metaTop, RIGHT, metaTop);
    line(MID, metaTop, MID, metaBottom, GRID);

    const invoiceDateStr = new Date(invoice.invoiceDate).toLocaleDateString("en-GB");
    const dueDateStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB") : invoiceDateStr;

    const metaRows: [string, string][] = [
      ["#", invoice.invoiceNumber],
      ["Invoice Date", invoiceDateStr],
      ["Terms", "Due on Receipt"],
      ["Due Date", dueDateStr],
    ];
    metaRows.forEach(([label, val], i) => {
      const ry = metaTop + 8 + i * 14;
      doc.font(F.reg).fontSize(8).fillColor("#333333").text(label, 40, ry, { lineBreak: false });
      doc.font(F.bold).text(`: ${val}`, 120, ry, { lineBreak: false });
    });

    const posName =
      invoice.customer.stateCode === invoice.placeOfSupply
        ? invoice.customer.stateName
        : business.stateCode === invoice.placeOfSupply
        ? business.stateName
        : null;
    const posText = posName ? `${posName} (${invoice.placeOfSupply})` : String(invoice.placeOfSupply);

    doc.font(F.reg).fontSize(8).fillColor("#333333").text("Place Of Supply", 305, metaTop + 8, { lineBreak: false });
    doc.font(F.bold).text(`: ${posText}`, 385, metaTop + 8, { width: 170, lineBreak: false });

    line(LEFT, metaBottom, RIGHT, metaBottom);

    // ==================== 3. BILL TO / SHIP TO (grey bar + details) ====================
    const barBottom = metaBottom + 16;
    const partyBottom = barBottom + 52;

    doc.rect(LEFT + 0.25, metaBottom + 0.25, 534.5, 15.5).fillColor("#F2F3F5").fill();
    doc.font(F.bold).fontSize(8.5).fillColor("#222222");
    doc.text("Bill To", 40, metaBottom + 4, { lineBreak: false });
    doc.text("Ship To", 305, metaBottom + 4, { lineBreak: false });
    line(LEFT, barBottom, RIGHT, barBottom);
    line(MID, metaBottom, MID, partyBottom, GRID);

    const drawParty = (x: number, nameColor: string) => {
      const c = invoice.customer as any;
      let py = barBottom + 6;
      doc.font(F.bold).fontSize(9).fillColor(nameColor).text(c.name, x, py, { width: 245, lineBreak: false });
      py += 12;
      doc.font(F.reg).fontSize(8).fillColor("#333333");
      if (c.gstin) {
        doc.text(`GSTIN ${c.gstin}`, x, py, { lineBreak: false });
        py += 11;
      }
      if (c.address) {
        doc.text(c.address, x, py, { width: 245, height: 22, ellipsis: true });
      }
    };
    drawParty(40, "#2F7DE1"); // Zoho shows the Bill To name in blue
    drawParty(305, "#222222");

    // This line closes the party block and is the top border of the items table (no gap).
    line(LEFT, partyBottom, RIGHT, partyBottom);

    // ==================== 4. ITEMS TABLE (with page breaks) ====================
    let tableTop = partyBottom;
    drawTableHeader(tableTop);
    let itemY = tableTop + HEAD_H + 6;

    const descCol = colByKey("desc");
    const qtyCol = colByKey("qty");

    invoice.items.forEach((item: any, idx: number) => {
      doc.font(F.reg).fontSize(8);
      const descHeight = doc.heightOfString(String(item.description), { width: descCol.w - 6 });
      const rowHeight = Math.max(24, descHeight + 8); // 24 = room for the unit under qty

      if (itemY + rowHeight > ROW_LIMIT) {
        drawTableGrid(tableTop);
        doc.font(F.italic).fontSize(8).fillColor("#555555");
        doc.text("Continued on next page...", 40, TABLE_BOTTOM + 10, { lineBreak: false });

        doc.addPage();
        drawFrame();
        doc.font(F.bold).fontSize(9).fillColor("#111111");
        doc.text(`Tax Invoice ${invoice.invoiceNumber} (continued)`, 40, 42, { lineBreak: false });
        tableTop = 60;
        drawTableHeader(tableTop);
        itemY = tableTop + HEAD_H + 6;
      }

      const values: Record<string, string> = {
        idx: String(idx + 1),
        desc: String(item.description),
        hsn: item.hsnSacCode || "-",
        qty: Number(item.quantity).toFixed(2),
        rate: inr(item.rate),
        cgstPct: `${item.gstRate / 2}%`,
        cgstAmt: inr(item.cgstAmount),
        sgstPct: `${item.gstRate / 2}%`,
        sgstAmt: inr(item.sgstAmount),
        igstPct: `${item.gstRate}%`,
        igstAmt: inr(item.igstAmount),
        amount: inr(item.taxableValue), // Zoho's Amount column = taxable value (tax is added in the summary)
      };

      doc.font(F.reg).fontSize(8).fillColor("#222222");
      cols.forEach((c) => {
        doc.text(values[c.key], c.x + 3, itemY, {
          width: c.w - 6,
          align: c.align,
          lineBreak: c.key === "desc", // only the description may wrap
        });
      });
      // unit (pcs) printed below the quantity, like Zoho
      doc.text(String(item.unit || "pcs").toLowerCase(), qtyCol.x + 3, itemY + 10, {
        width: qtyCol.w - 6,
        align: "right",
        lineBreak: false,
      });

      itemY += rowHeight;
    });

    drawTableGrid(tableTop);

    // ==================== 5. BOTTOM: words + notes (left), summary (right) ====================
    line(320, TABLE_BOTTOM, 320, 810, GRID);

    doc.font(F.reg).fontSize(8).fillColor("#333333").text("Total In Words", 40, 510, { lineBreak: false });
    doc.font(F.boldItalic).fontSize(8).fillColor("#111111").text(numberToWords(invoice.totalAmount), 40, 523, { width: 270 });

    doc.font(F.reg).fontSize(8).fillColor("#333333").text("Notes", 40, 565, { lineBreak: false });
    doc.font(F.reg).fontSize(8).fillColor("#333333").text(invoice.notes || "Thanks for your business.", 40, 578, { width: 270 });

    let sumY = 510;
    const summaryLine = (label: string, value: string, bold = false, size = 8) => {
      doc.font(bold ? F.bold : F.reg).fontSize(size).fillColor(bold ? "#111111" : "#444444");
      doc.text(label, 330, sumY, { width: 100, align: "right", lineBreak: false });
      doc.text(value, 435, sumY, { width: 120, align: "right", lineBreak: false });
      sumY += size + 6;
    };

    summaryLine("Sub Total", inr(invoice.subtotal));

    // Tax lines grouped by GST rate (mixed-rate invoices show correct labels)
    const slabs = new Map<number, { cgst: number; sgst: number; igst: number }>();
    invoice.items.forEach((it: any) => {
      const s = slabs.get(it.gstRate) ?? { cgst: 0, sgst: 0, igst: 0 };
      s.cgst += it.cgstAmount;
      s.sgst += it.sgstAmount;
      s.igst += it.igstAmount;
      slabs.set(it.gstRate, s);
    });

    [...slabs.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([rate, s]) => {
        const half = rate / 2;
        if (s.cgst > 0) summaryLine(`CGST${half} (${half}%)`, inr(s.cgst));
        if (s.sgst > 0) summaryLine(`SGST${half} (${half}%)`, inr(s.sgst));
        if (s.igst > 0) summaryLine(`IGST${rate} (${rate}%)`, inr(s.igst));
      });

    if (invoice.totalCess > 0) summaryLine("Cess", inr(invoice.totalCess));
    if (invoice.roundOff !== 0) summaryLine("Round Off", inr(invoice.roundOff));

    summaryLine("Total", `${rs}${inr(invoice.totalAmount)}`, true, 9);

    if (invoice.paidAmount > 0) {
      summaryLine("Payment Made", `(-) ${inr(invoice.paidAmount)}`);
    }

    const balanceDue = Math.max(0, invoice.totalAmount - invoice.paidAmount);
    sumY += 2;
    summaryLine("Balance Due", `${rs}${inr(balanceDue)}`, true, 10);

    // signature box
    line(320, 745, RIGHT, 745, GRID);
    doc.font(F.reg).fontSize(8).fillColor("#333333");
    doc.text("Authorized Signature", 320, 790, { width: 245, align: "center", lineBreak: false });

    doc.end();
  } catch (error: any) {
    console.error("PDF generation error:", error);
    if (res.headersSent) {
      // PDF already started streaming - can't send JSON anymore.
      res.end();
      return;
    }
    res.status(500).json({ error: "Failed to generate PDF." });
  }
});

// Credit & Debit Notes API
router.get("/credit-notes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const notes = await prisma.creditDebitNote.findMany({
      where: { businessId },
      include: { customer: true, vendor: true, invoice: true },
      orderBy: { noteDate: "desc" },
    });
    res.json(notes);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch credit notes." });
  }
});

router.post("/credit-notes", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const {
      originalInvoiceId,
      customerId,
      vendorId,
      noteType,
      noteNumber,
      noteDate,
      reason,
      taxableValue,
      gstRate,
      supplyType,
      notes,
    } = req.body;

    if (!noteType || taxableValue === undefined) {
      return res.status(400).json({ error: "Note type and taxable value are required." });
    }

    const isIntraState = supplyType === "INTRA_STATE";
    const taxRate = Number(gstRate || 18);
    const taxVal = r2(Number(taxableValue));

    let cgst = 0, sgst = 0, igst = 0;
    if (isIntraState) {
      cgst = r2((taxVal * (taxRate / 2)) / 100);
      sgst = r2((taxVal * (taxRate / 2)) / 100);
    } else {
      igst = r2((taxVal * taxRate) / 100);
    }

    const total = r2(taxVal + cgst + sgst + igst);

    const count = await prisma.creditDebitNote.count({ where: { businessId } });
    const autoNoteNum = noteNumber ? String(noteNumber) : `CN-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, "0")}`;

    const note = await prisma.creditDebitNote.create({
      data: {
        businessId,
        originalInvoiceId: originalInvoiceId ? String(originalInvoiceId) : null,
        customerId: customerId ? String(customerId) : null,
        vendorId: vendorId ? String(vendorId) : null,
        noteType: String(noteType),
        noteNumber: autoNoteNum,
        noteDate: noteDate ? new Date(noteDate) : new Date(),
        reason: reason ? String(reason) : "SALES_RETURN",
        supplyType: isIntraState ? "INTRA_STATE" : "INTER_STATE",
        taxableValue: taxVal,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        cessAmount: 0,
        totalAmount: total,
        notes: notes ? String(notes) : null,
      },
    });

    res.json(note);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create credit/debit note." });
  }
});

export default router;