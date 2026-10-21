import { Router, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import PDFDocument from "pdfkit";
import { allocateUniqueInvoiceNumber } from "../lib/invoiceNumbers.js";  
import { r2 } from "../lib/money.js";
import { normalizeGstin, isValidGstin } from "../lib/gstin.js";
import { sendPaymentReminderEmail } from "../lib/email.js";
import { validateSalesInvoiceAgainstRules } from "../lib/ruleEngine.js";

const router = Router();

function getPaymentStatus(totalAmount: number, paidAmount: number) {
  if (paidAmount <= 0) return "UNPAID";
  return paidAmount >= totalAmount - 0.01 ? "PAID" : "PARTIAL";
}


// List all sales invoices
// GET /invoices?view=list  -> lean payload for the Sales page table (no line Items, max `limit` rows)
// GET /invoices            -> unchanged full payload (customer + Items) for any other caller
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
        : { customer: true, Items: true, payments: { orderBy: { paidOn: "desc" } } },
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

// -----------------------------------------------------------------------
// GET /invoices/missing-hsn
// Returns all SalesInvoiceItem rows that have no hsnSacCode, with top HSN
// suggestion (from HsnCode table) and invoice/customer context.
// Must be declared BEFORE /:id to avoid "missing-hsn" being treated as id.
// -----------------------------------------------------------------------
router.get("/invoices/missing-hsn", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { from, to, period } = req.query;
    const whereInvoice: any = { businessId, status: { not: "CANCELLED" } };

    if (period && typeof period === "string" && /^\d{6}$/.test(period)) {
      const month = parseInt(period.substring(0, 2), 10);
      const year = parseInt(period.substring(2, 6), 10);
      whereInvoice.invoiceDate = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      };
    } else if (from || to) {
      whereInvoice.invoiceDate = {};
      if (from) whereInvoice.invoiceDate.gte = new Date(String(from));
      if (to) whereInvoice.invoiceDate.lte = new Date(String(to));
    }

    const Items = await prisma.salesInvoiceItem.findMany({
      where: {
        salesInvoice: whereInvoice,
        hsnSacCode: "",   // schema has String (non-optional) — empty string means unset
      },
      include: {
        salesInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            customer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { salesInvoice: { invoiceDate: "desc" } },
      take: 200,
    });

    // For each item get top HSN suggestions (best effort, up to 3)
    const withSuggestions = await Promise.all(
      Items.map(async (item) => {
        const words = item.description
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^a-z0-9]/g, ""))
          .filter((w) => w.length >= 2)
          .slice(0, 3);

        let suggestions: { code: string; description: string }[] = [];
        if (words.length > 0) {
          const whereConditions = words.map((word) => ({
            OR: [
              { description: { contains: word, mode: "insensitive" as const } },
              { keywords: { contains: word, mode: "insensitive" as const } },
            ],
          }));
          const hits = await prisma.hsnCode.findMany({
            where: { type: "GOODS", AND: whereConditions },
            select: { code: true, description: true },
            take: 3,
          });
          suggestions = hits;
        }

        return {
          itemId: item.id,
          description: item.description,
          gstRate: item.gstRate,
          unit: item.unit,
          invoice: item.salesInvoice,
          suggestions,
        };
      })
    );

    res.json({ count: withSuggestions.length, Items: withSuggestions });
  } catch (error: any) {
    console.error("Missing HSN error:", error);
    res.status(500).json({ error: "Failed to fetch Items with missing HSN." });
  }
});

// -----------------------------------------------------------------------
// POST /invoices/fix-hsn and PATCH /invoices/fix-hsn
// Accepts either:
// 1. Array of fixes: [{ invoiceItemId, hsnSacCode }] or { fixes: [{ invoiceItemId, hsnSacCode }] }
// 2. Single item fix: { itemId, hsnSacCode } or { invoiceItemId, hsnSacCode }
// Updates them in a transaction.
// -----------------------------------------------------------------------
const handleFixHsn = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    let rawList: any[] = [];
    if (Array.isArray(req.body)) {
      rawList = req.body;
    } else if (Array.isArray(req.body?.fixes)) {
      rawList = req.body.fixes;
    } else if (req.body && typeof req.body === "object") {
      rawList = [req.body];
    }

    if (rawList.length === 0) {
      return res.status(400).json({ error: "At least one item fix is required." });
    }

    const fixes: { invoiceItemId: string; hsnSacCode: string }[] = [];
    for (const entry of rawList) {
      const id = String(entry.invoiceItemId || entry.itemId || "").trim();
      const code = String(entry.hsnSacCode || "").trim();
      if (!id) return res.status(400).json({ error: "invoiceItemId is required." });
      if (!/^\d{4,8}$/.test(code)) {
        return res.status(400).json({ error: `Invalid HSN code "${code}". Must be 4–8 digits.` });
      }
      fixes.push({ invoiceItemId: id, hsnSacCode: code });
    }

    // Verify all Items belong to this business
    const ids = fixes.map((f) => f.invoiceItemId);
    const existing = await prisma.salesInvoiceItem.findMany({
      where: { id: { in: ids }, salesInvoice: { businessId } },
      select: { id: true },
    });
    const foundSet = new Set(existing.map((e) => e.id));
    for (const f of fixes) {
      if (!foundSet.has(f.invoiceItemId)) {
        return res.status(404).json({ error: `Item ${f.invoiceItemId} not found or does not belong to your business.` });
      }
    }

    // Update in transaction
    await prisma.$transaction(
      fixes.map((f) =>
        prisma.salesInvoiceItem.update({
          where: { id: f.invoiceItemId },
          data: { hsnSacCode: f.hsnSacCode },
        })
      )
    );

    res.json({ success: true, updatedCount: fixes.length });
  } catch (error: any) {
    console.error("Fix HSN error:", error);
    res.status(500).json({ error: "Failed to update HSN." });
  }
};

router.post("/invoices/fix-hsn", authMiddleware, handleFixHsn);
router.patch("/invoices/fix-hsn", authMiddleware, handleFixHsn);





router.get("/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: req.params.id as string, businessId },
      include: { customer: true, Items: true, payments: { orderBy: { paidOn: "desc" } } },
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
      Items,
      status,
      paymentMode,
      buyerGstin: rawBuyerGstin,
      isReverseCharge: rawIsReverseCharge,
      applicablePercent: rawApplicablePercent,
      ecomGstin: rawEcomGstin,
    } = req.body;

    if (paymentMode !== undefined && paymentMode !== null && paymentMode !== "") {
      if (!["CASH", "UPI", "PAY_LATER"].includes(paymentMode)) {
        return res.status(400).json({ error: "Invalid paymentMode. Must be CASH, UPI, or PAY_LATER." });
      }
    }

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

    if (!customerId || !Items || !Array.isArray(Items) || Items.length === 0) {
      return res.status(400).json({ error: "Customer and at least one item are required." });
    }

    for (const [i, it] of Items.entries()) {
      const qty = Number(it.quantity);
      const rate = Number(it.rate);
      const discount = Number(it.discount || 0);
      const gst = Number(it.gstRate ?? 18);

      if (!it.description || !String(it.description).trim()) {
        return res.status(400).json({ error: `Item ${i + 1}: description is required.` });
      }
      if (!Number.isFinite(qty) || !(qty > 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity must be a valid number greater than 0.` });
      }
      if (!Number.isFinite(rate) || !(rate > 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: rate must be a valid number greater than 0.` });
      }
      if (!Number.isFinite(discount) || discount < 0 || discount > qty * rate) {        return res.status(400).json({ error: `Item ${i + 1}: invalid discount.` });
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

    let buyerGstin: string | null = null;
    if (rawBuyerGstin !== undefined && rawBuyerGstin !== null && String(rawBuyerGstin).trim() !== "") {
      const normalized = normalizeGstin(String(rawBuyerGstin));
      if (!isValidGstin(normalized)) {
        return res.status(400).json({ error: "GSTIN looks wrong, please check" });
      }
      if (business.gstin && normalizeGstin(business.gstin) === normalized) {
        return res.status(400).json({ error: "Buyer GSTIN cannot be your own shop GSTIN." });
      }
      buyerGstin = normalized;
    }

    let recipientBusiness: { id: string } | null = null;
    let recipientDelivery: { status: string; message?: string } | null = null;

    if (buyerGstin) {
      // For PurchaseBill creation: create it only when buyerGstin matches an existing Business.gstin
      const matchedShop = await prisma.business.findFirst({
        where: {
          gstin: { equals: buyerGstin, mode: "insensitive" },
          // match any shop with this GSTIN
        },
        select: { id: true, users: { select: { userId: true } } },
      });

      if (matchedShop) {
        const isSelf = matchedShop.users.some((u) => u.userId === req.user?.userId);
        if (isSelf) {
          recipientDelivery = {
            status: "SELF",
            message: "The customer account belongs to this seller, so the invoice was not delivered to Purchases.",
          };
        } else {
          recipientBusiness = { id: matchedShop.id };
        }
      }
    } else {
      // B2C sale: No buyer GSTIN provided.
      // B2C sales cannot claim ITC and must NEVER enter the buyer's business Purchases table.
      // Instead, they are delivered to the customer's personal "My Shopping Bills" section.
      const recipientMitraId = customer.mitraId?.trim().toLowerCase();
      if (recipientMitraId) {
        const recipient = await prisma.user.findUnique({
          where: { mitraId: recipientMitraId },
          select: { id: true },
        });
        if (recipient) {
          if (recipient.id === req.user?.userId) {
            recipientDelivery = {
              status: "SELF",
              message: "The customer account belongs to this seller, so the invoice was not delivered to My Shopping Bills.",
            };
          } else {
            recipientDelivery = {
              status: "MY_BILLS",
              message: "Invoice delivered to customer's My Shopping Bills section.",
            };
          }
        }
      }
    }


    // Invoice numbers are always assigned by GSTMitra so GST returns never get colliding sequences.
    const invNum = await allocateUniqueInvoiceNumber(businessId);
    const buyerStateFromGstin = buyerGstin ? buyerGstin.substring(0, 2) : null;
    const pos = placeOfSupply || buyerStateFromGstin || customer.stateCode || business.stateCode;

    const isIntraState = business.stateCode === pos;
    const supplyType = isIntraState ? "INTRA_STATE" : "INTER_STATE";

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;

    const formattedItems = Items.map((item: any) => {
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

    if (!Number.isSafeInteger(grandTotal)) {
      return res.status(400).json({ error: "Invoice total is too large to calculate accurately." });
    }

    // Dynamic rule validation against active rules in DB (NO HARDCODING)
    const ruleViolations = await validateSalesInvoiceAgainstRules({
      business,
      invoice: {
        invoiceNumber: String(invNum),
        invoiceDate: invDate,
        placeOfSupply: String(pos),
        supplyType,
        subtotal,
        totalAmount: grandTotal,
        totalCgst,
        totalSgst,
        totalIgst,
        totalCess,
        isReverseCharge,
        buyerGstin,
        paymentMode,
      },
      Items: formattedItems,
      customer,
    });

    const errorViolations = ruleViolations.filter((v) => v.severity === "error");
    if (errorViolations.length > 0) {
      return res.status(422).json({
        error: "GST Rule Validation Failed",
        message: "Invoice me GST rules ke anusar galtiyan hain. Kripya niche diye points ko theek karein.",
        ruleViolations,
      });
    }

    const isCash = paymentMode === "CASH";
    const initialPaidAmount = isCash ? grandTotal : 0;
    const initialPaymentStatus = isCash ? "PAID" : "UNPAID";

    const invoice = await prisma.$transaction(async (tx) => {
      const createdInvoice = await tx.salesInvoice.create({
        data: {
          businessId,
          customerId: String(customerId),
          buyerGstin,
          invoiceNumber: String(invNum),
          invoiceDate: invDate,
          dueDate: dueDate ? new Date(dueDate) : null,
          supplyType,
          placeOfSupply: String(pos),
          isReverseCharge,
          applicablePercent,
          ecomGstin,
          status: status ? String(status) : "ISSUED",
          paymentStatus: initialPaymentStatus,
          notes: notes ? String(notes) : null,
          subtotal,
          totalCgst,
          totalSgst,
          totalIgst,
          totalCess,
          roundOff,
          totalAmount: grandTotal,
          paidAmount: initialPaidAmount,
          Items: {
            create: formattedItems,
          },
          ...(isCash
            ? {
                payments: {
                  create: [
                    {
                      businessId,
                      amount: grandTotal,
                      mode: "CASH",
                      paidOn: invDate,
                      note: "Payment received in cash",
                    },
                  ],
                },
              }
            : {}),
        },
        include: {
          customer: true,
          Items: true,
          payments: { orderBy: { paidOn: "desc" } },
        },
      });

      if (recipientBusiness) {
        let vendor = await tx.vendor.findFirst({
          where: {
            businessId: recipientBusiness.id,
            ...(business.gstin
              ? { gstin: { equals: business.gstin, mode: "insensitive" } }
              : { name: { equals: business.tradeName || business.name, mode: "insensitive" } }),
          },
        });
        if (!vendor) {
          vendor = await tx.vendor.create({
            data: {
              businessId: recipientBusiness.id,
              name: business.tradeName || business.name,
              tradeName: business.tradeName,
              gstin: business.gstin,
              stateCode: business.stateCode,
              stateName: business.stateName,
              vendorType: business.gstin ? "REGISTERED" : "UNREGISTERED",
              email: business.email,
              phone: business.phone,
              address: business.address,
            },
          });
        }

        const existingBill = await tx.purchaseBill.findFirst({
          where: {
            businessId: recipientBusiness.id,
            vendorId: vendor.id,
            billNumber: createdInvoice.invoiceNumber,
          },
          select: { id: true },
        });
        if (existingBill) {
          recipientDelivery = {
            status: "ALREADY_EXISTS",
            message: "A bill with this invoice number is already in the customer's Purchases; no duplicate was added.",
          };
        } else {
          await tx.purchaseBill.create({
            data: {
              businessId: recipientBusiness.id,
              vendorId: vendor.id,
              sourceSalesInvoiceId: createdInvoice.id,
              billNumber: createdInvoice.invoiceNumber,
              billDate: createdInvoice.invoiceDate,
              receivedDate: new Date(),
              dueDate: createdInvoice.dueDate,
              supplyType: createdInvoice.supplyType,
              placeOfSupply: createdInvoice.placeOfSupply,
              category: "OTHER",
              isReverseCharge: createdInvoice.isReverseCharge,
              isItcEligible: false,
              itcIneligibilityReason: "Received invoice: review bill details and ITC eligibility before claiming credit.",
              receiptStatus: "PENDING_REVIEW",
              status: createdInvoice.paymentStatus,
              subtotal: createdInvoice.subtotal,
              totalCgst: createdInvoice.totalCgst,
              totalSgst: createdInvoice.totalSgst,
              totalIgst: createdInvoice.totalIgst,
              totalCess: createdInvoice.totalCess,
              totalAmount: createdInvoice.totalAmount,
              paidAmount: createdInvoice.paidAmount,
              payments: createdInvoice.paidAmount > 0 ? {
                create: {
                  amount: createdInvoice.paidAmount,
                  paymentDate: createdInvoice.invoiceDate,
                  mode: createdInvoice.payments?.[0]?.mode || "CASH",
                  notes: "Payment recorded at invoice issuance",
                },
              } : undefined,
              Items: {
                create: createdInvoice.Items.map((item) => ({
                  itemId: null,
                  description: item.description,
                  hsnSacCode: item.hsnSacCode,
                  quantity: item.quantity,
                  unit: item.unit,
                  rate: item.rate,
                  taxableValue: item.taxableValue,
                  gstRate: item.gstRate,
                  cgstAmount: item.cgstAmount,
                  sgstAmount: item.sgstAmount,
                  igstAmount: item.igstAmount,
                  cessRate: item.cessRate,
                  cessAmount: item.cessAmount,
                  isItcEligible: false,
                  totalAmount: item.totalAmount,
                })),
              },
            },
          });
          recipientDelivery = { status: "PENDING_REVIEW" };
        }
      }

      return createdInvoice;
    });

    const warnings = ruleViolations.filter((v) => v.severity === "warning");
    res.json({ ...invoice, ...(warnings.length > 0 ? { ruleWarnings: warnings } : {}), ...(recipientDelivery ? { recipientDelivery } : {}) });
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
      include: { Items: true },
    });
    if (!existing) return res.status(404).json({ error: "Sales invoice not found." });
    const receivedBill = await prisma.purchaseBill.findUnique({
      where: { sourceSalesInvoiceId: existing.id },
      select: { id: true, receiptStatus: true },
    });
    if (receivedBill?.receiptStatus === "ACCEPTED") {
      return res.status(409).json({
        error: "The customer has accepted this invoice. Create a credit or debit note instead of editing it.",
      });
    }

    const {
      customerId,
      invoiceDate,
      dueDate,
      placeOfSupply,
      notes,
      Items,
      isReverseCharge = false,
      applicablePercent: rawApplicablePercent,
      ecomGstin: rawEcomGstin,
    } = req.body;
    if (!customerId || !Array.isArray(Items) || Items.length === 0) {
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

    for (const [index, item] of Items.entries()) {
      const quantity = Number(item.quantity);
      const rate = Number(item.rate);
      const gstRate = Number(item.gstRate ?? 18);
      const discount = Number(item.discount ?? 0);
      if (!item.description || !String(item.description).trim() ||
          !Number.isFinite(quantity) || !(quantity > 0) ||
          !Number.isFinite(rate) || !(rate > 0) ||
          !Number.isFinite(discount) || discount < 0 || discount > quantity * rate ||
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
    if (receivedBill?.receiptStatus === "PENDING_REVIEW" && customerId !== existing.customerId) {
      return res.status(409).json({
        error: "The invoice is awaiting customer review and cannot be reassigned to a different customer.",
      });
    }
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const pos = String(placeOfSupply || customer.stateCode || business.stateCode);
    const intraState = business.stateCode === pos;
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;
    const formattedItems = Items.map((item: any) => {
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
    if (!Number.isSafeInteger(totalAmount)) return res.status(400).json({ error: "Invoice total is too large." });
    if (totalAmount < r2(existing.paidAmount)) {
      return res.status(400).json({ error: "Updated total cannot be lower than the payments already recorded." });
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.salesInvoice.update({
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
          paymentStatus: getPaymentStatus(totalAmount, existing.paidAmount),
          Items: {
            deleteMany: {},
            create: formattedItems,
          },
        },
        include: { customer: true, Items: true },
      });

      if (receivedBill?.receiptStatus === "PENDING_REVIEW") {
        await tx.purchaseBill.update({
          where: { id: receivedBill.id },
          data: {
            billDate: updatedInvoice.invoiceDate,
            dueDate: updatedInvoice.dueDate,
            supplyType: updatedInvoice.supplyType,
            placeOfSupply: updatedInvoice.placeOfSupply,
            isReverseCharge: updatedInvoice.isReverseCharge,
            subtotal: updatedInvoice.subtotal,
            totalCgst: updatedInvoice.totalCgst,
            totalSgst: updatedInvoice.totalSgst,
            totalIgst: updatedInvoice.totalIgst,
            totalCess: updatedInvoice.totalCess,
            totalAmount: updatedInvoice.totalAmount,
            paidAmount: updatedInvoice.paidAmount,
            status: getPaymentStatus(updatedInvoice.totalAmount, updatedInvoice.paidAmount),
            Items: {
              deleteMany: {},
              create: updatedInvoice.Items.map((item) => ({
                itemId: null,
                description: item.description,
                hsnSacCode: item.hsnSacCode,
                quantity: item.quantity,
                unit: item.unit,
                rate: item.rate,
                taxableValue: item.taxableValue,
                gstRate: item.gstRate,
                cgstAmount: item.cgstAmount,
                sgstAmount: item.sgstAmount,
                igstAmount: item.igstAmount,
                cessRate: item.cessRate,
                cessAmount: item.cessAmount,
                isItcEligible: false,
                totalAmount: item.totalAmount,
              })),
            },
          },
        });
      }
      return updatedInvoice;
    });
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
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const id = req.params.id as string;
    const { paidAmount, paymentStatus } = req.body;

    const existing = await prisma.salesInvoice.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Invoice not found." });

    if (paidAmount === undefined) {
      return res.status(400).json({ error: "Provide paidAmount; use the payments endpoint to record a payment." });
    }
    const requestedPaidAmount = Number(paidAmount);
    if (!Number.isFinite(requestedPaidAmount) || requestedPaidAmount < 0) {
      return res.status(400).json({ error: "Paid amount must be a valid non-negative number." });
    }
    const newPaid = r2(requestedPaidAmount);
    if (newPaid > existing.totalAmount) {
      return res.status(400).json({ error: "Paid amount must be between 0 and the invoice total." });
    }
    if (existing.status === "CANCELLED") {
      return res.status(400).json({ error: "Cannot record payment against a cancelled invoice." });
    }
    if (newPaid < r2(existing.paidAmount)) {
      return res.status(400).json({ error: "Paid amount cannot be reduced. Use a payment reversal workflow instead." });
    }
    const newStatus = getPaymentStatus(existing.totalAmount, newPaid);
    if (paymentStatus !== undefined && paymentStatus !== newStatus) {
      return res.status(400).json({ error: "Payment status is calculated from the paid amount and cannot be set independently." });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const delta = r2(newPaid - existing.paidAmount);
      if (delta > 0) {
        const paidOn = new Date();
        await tx.salesPayment.create({
          data: {
            salesInvoiceId: id,
            businessId,
            amount: delta,
            mode: "OTHER",
            paidOn,
            note: "Payment recorded by seller",
          },
        });

        const linkedBill = await tx.purchaseBill.findUnique({
          where: { sourceSalesInvoiceId: id },
          select: { id: true },
        });
        if (linkedBill) {
          await tx.purchasePayment.create({
            data: {
              purchaseBillId: linkedBill.id,
              amount: delta,
              mode: "BANK",
              paymentDate: paidOn,
              notes: "Synced from seller: Payment recorded by seller",
            },
          });
          await tx.purchaseBill.update({
            where: { id: linkedBill.id },
            data: { paidAmount: newPaid, status: newStatus },
          });
        }
      }

      return tx.salesInvoice.update({
        where: { id },
        data: { paidAmount: newPaid, paymentStatus: newStatus },
      });
    });

    res.json(updated);
  } catch (error: any) {
    console.error("Update invoice payment error:", error);
    res.status(500).json({ error: "Failed to update payment status." });
  }
});

// Delete a sales invoice (and cascade to linked purchaseBill if any)
router.delete("/invoices/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: req.params.id as string, businessId },
      select: { id: true, invoiceNumber: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    await prisma.$transaction(async (tx) => {
      // Delete linked purchase bill (auto-delivered B2B copy)
      await tx.purchaseBill.deleteMany({
        where: { sourceSalesInvoiceId: invoice.id },
      });
      // Delete payments and items (cascade in DB but explicit here for safety)
      await tx.salesPayment.deleteMany({ where: { salesInvoiceId: invoice.id } });
      await tx.salesInvoiceItem.deleteMany({ where: { salesInvoiceId: invoice.id } });
      await tx.salesInvoice.delete({ where: { id: invoice.id } });
    });

    res.json({ message: `Invoice ${invoice.invoiceNumber} deleted successfully.` });
  } catch (error: any) {
    console.error("Delete invoice error:", error);
    res.status(500).json({ error: "Failed to delete invoice." });
  }
});

// Record a payment for a sales invoice
router.post("/invoices/:id/payments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const invoiceId = req.params.id as string;
    const { amount, mode, paidOn, note } = req.body;

    const paymentAmount = r2(Number(amount));
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than 0." });
    }

    const paymentMode = mode ? String(mode).toUpperCase() : "CASH";
    if (!["CASH", "UPI", "BANK", "OTHER"].includes(paymentMode)) {
      return res.status(400).json({ error: "Invalid payment mode. Must be CASH, UPI, BANK, or OTHER." });
    }

    const parsedPaidOn = paidOn ? new Date(paidOn) : new Date();
    if (isNaN(parsedPaidOn.getTime())) {
      return res.status(400).json({ error: "Invalid payment date." });
    }

    const updatedInvoice = await prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.findFirst({
        where: { id: invoiceId, businessId },
      });
      if (!invoice) return null;

      if (invoice.status === "CANCELLED") {
        throw new Error("Cannot add payment to a cancelled invoice.");
      }

      const balanceDue = r2(invoice.totalAmount - invoice.paidAmount);
      if (paymentAmount > balanceDue) {
        throw new Error(`Payment amount cannot exceed the pending balance (${balanceDue}).`);
      }

      const newPaidAmount = r2(invoice.paidAmount + paymentAmount);
      const paymentStatus = getPaymentStatus(invoice.totalAmount, newPaidAmount);

      await tx.salesPayment.create({
        data: {
          salesInvoiceId: invoiceId,
          businessId,
          amount: paymentAmount,
          mode: paymentMode,
          paidOn: parsedPaidOn,
          note: note ? String(note).trim() : null,
        },
      });

      // Synchronize recipient's B2B PurchaseBill & ledger
      const linkedBill = await tx.purchaseBill.findUnique({
        where: { sourceSalesInvoiceId: invoiceId },
        select: { id: true },
      });
      if (linkedBill) {
        await tx.purchaseBill.update({
          where: { id: linkedBill.id },
          data: {
            paidAmount: newPaidAmount,
            status: paymentStatus,
          },
        });
        await tx.purchasePayment.create({
          data: {
            purchaseBillId: linkedBill.id,
            amount: paymentAmount,
            mode: paymentMode === "OTHER" ? "BANK" : paymentMode,
            paymentDate: parsedPaidOn,
            notes: note ? `Synced from seller: ${note}` : "Payment recorded by seller",
          },
        });
      }

      return tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          paymentStatus,
        },
        include: {
          customer: true,
          Items: true,
          payments: { orderBy: { paidOn: "desc" } },
        },
      });
    });

    if (!updatedInvoice) return res.status(404).json({ error: "Sales invoice not found." });
    res.json(updatedInvoice);
  } catch (error: any) {
    if (
      error instanceof Error &&
      (error.message.includes("Cannot add payment") || error.message.includes("cannot exceed the pending balance"))
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error("Record sales invoice payment error:", error);
    res.status(500).json({ error: "Failed to record payment." });
  }
});

// POST /invoices/:id/remind - Send a payment reminder email and record it on linked bills
router.post("/invoices/:id/remind", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const invoiceId = req.params.id as string;

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { customer: true },
    });
    if (!invoice) return res.status(404).json({ error: "Sales invoice not found." });

    if (invoice.status === "CANCELLED") {
      return res.status(400).json({ error: "Cannot send reminder for a cancelled invoice." });
    }

    const pending = r2(invoice.totalAmount - invoice.paidAmount);
    if (pending <= 0) {
      return res.status(400).json({ error: "This invoice is already paid in full." });
    }

    const customerEmail = invoice.customer.email?.trim();
    const linkedUser = !customerEmail && invoice.customer.mitraId
      ? await prisma.user.findUnique({
          where: { mitraId: invoice.customer.mitraId.trim().toLowerCase() },
          select: { email: true, name: true },
        })
      : null;
    const recipientEmail = customerEmail || linkedUser?.email;
    if (!recipientEmail) {
      return res.status(400).json({
        error: "No customer email is available. Add an email to the customer profile or link the customer's Mitra ID.",
      });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, tradeName: true, email: true, upiId: true },
    });
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const shopName = business.tradeName || business.name || "Our Shop";
    const dateFormatted = invoice.invoiceDate.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const dueDateFormatted = invoice.dueDate
      ? invoice.dueDate.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;
    const emailResult = await sendPaymentReminderEmail({
      to: recipientEmail,
      customerName: linkedUser?.name || invoice.customer.name,
      sellerName: shopName,
      billNumber: invoice.invoiceNumber,
      billDate: dateFormatted,
      dueDate: dueDateFormatted,
      pendingAmount: pending,
      upiId: business.upiId,
    });
    if (!emailResult.success) {
      return res.status(502).json({ error: "Could not send the payment reminder email. Please check the email configuration and try again." });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.salesInvoice.update({
        where: { id: invoiceId },
        data: {
          lastReminderSentAt: now,
          reminderCount: { increment: 1 },
        },
      });
      await tx.purchaseBill.updateMany({
        where: { sourceSalesInvoiceId: invoiceId },
        data: {
          lastReminderSentAt: now,
          reminderCount: { increment: 1 },
        },
      });
      return updatedInvoice;
    });

    res.json({
      success: true,
      message: "Payment reminder email sent.",
      lastReminderSentAt: updated.lastReminderSentAt,
      reminderCount: updated.reminderCount,
      emailSent: true,
      email: recipientEmail,
      pendingAmount: pending,
    });
  } catch (error: any) {
    console.error("Send payment reminder error:", error);
    res.status(500).json({ error: "Failed to send payment reminder." });
  }
});

// List all payments for an invoice
router.get("/invoices/:id/payments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const invoiceId = req.params.id as string;

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { id: true },
    });
    if (!invoice) return res.status(404).json({ error: "Sales invoice not found." });

    const payments = await prisma.salesPayment.findMany({
      where: { salesInvoiceId: invoiceId, businessId },
      orderBy: { paidOn: "desc" },
    });

    res.json(payments);
  } catch (error: any) {
    console.error("Fetch invoice payments error:", error);
    res.status(500).json({ error: "Failed to fetch payments." });
  }
});

// Helper to convert number to words (Indian Currency Format)
function numberToWords(num: number): string {
  const a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ",
    "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigits = (n: number) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + " " + a[n % 10]);

  function inWords(n: number): string {
    n = Math.floor(n);
    if (n <= 0) return "";
    let str = "";
    const crore = Math.floor(n / 1e7); n %= 1e7;
    if (crore) str += inWords(crore) + "Crore ";
    const lakh = Math.floor(n / 1e5); n %= 1e5;
    if (lakh) str += twoDigits(lakh) + "Lakh ";
    const thousand = Math.floor(n / 1e3); n %= 1e3;
    if (thousand) str += twoDigits(thousand) + "Thousand ";
    const hundred = Math.floor(n / 100); n %= 100;
    if (hundred) str += a[hundred] + "Hundred ";
    if (n) str += (str ? "and " : "") + twoDigits(n);
    return str;
  }

  const whole = Math.floor(num);
  const fraction = Math.round((num - whole) * 100);
  let result = "Indian Rupee " + (whole === 0 ? "Zero " : inWords(whole));
  if (fraction > 0) result += "and " + inWords(fraction) + "Paise ";
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
      include: { customer: true, Items: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business not found." });

    renderInvoicePdfStream(res, invoice, business);
  } catch (error: any) {
    console.error("PDF route error:", error);
    res.status(500).json({ error: "Failed to fetch invoice for PDF." });
  }
});

export function renderInvoicePdfStream(
  res: Response,
  invoice: any,
  business: any,
  documentType: "INVOICE" | "BILL" = "INVOICE"
) {
  try {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    const safeDocumentNumber = String(invoice.invoiceNumber).replace(/[^a-zA-Z0-9_-]/g, "_");
    res.setHeader(
      "Content-Disposition",
      `${documentType === "BILL" ? "attachment" : "inline"}; filename="${documentType}-${safeDocumentNumber}.pdf"`
    );
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

    // ==================== 1. HEADER (logo + business + document title) ====================
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
    doc.text(documentType === "BILL" ? "BILL" : "TAX INVOICE", 340, headerBottom - 40, {
      width: 215,
      align: "right",
      lineBreak: false,
    });

    // ==================== 2. META GRID (invoice no, dates, place of supply) ====================
    const metaTop = headerBottom;
    const metaBottom = metaTop + 62;
    line(LEFT, metaTop, RIGHT, metaTop);
    line(MID, metaTop, MID, metaBottom, GRID);

    const invoiceDateStr = new Date(invoice.invoiceDate).toLocaleDateString("en-GB");
    const dueDateStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString("en-GB") : invoiceDateStr;

    const metaRows: [string, string][] = [
      ["#", invoice.invoiceNumber],
      [documentType === "BILL" ? "Bill Date" : "Invoice Date", invoiceDateStr],
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
      const displayedGstin = invoice.buyerGstin || c.gstin;
      if (displayedGstin) {
        doc.text(`GSTIN ${displayedGstin}`, x, py, { lineBreak: false });
        py += 11;
      }
      if (c.address) {
        doc.text(c.address, x, py, { width: 245, height: 22, ellipsis: true });
      }
    };
    drawParty(40, "#2F7DE1"); // Zoho shows the Bill To name in blue
    drawParty(305, "#222222");

    // This line closes the party block and is the top border of the Items table (no gap).
    line(LEFT, partyBottom, RIGHT, partyBottom);

    // ==================== 4. Items TABLE (with page breaks) ====================
    let tableTop = partyBottom;
    drawTableHeader(tableTop);
    let itemY = tableTop + HEAD_H + 6;

    const descCol = colByKey("desc");
    const qtyCol = colByKey("qty");

    invoice.Items.forEach((item: any, idx: number) => {
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
        doc.text(
          `${documentType === "BILL" ? "Bill" : "Tax Invoice"} ${invoice.invoiceNumber} (continued)`,
          40,
          42,
          { lineBreak: false }
        );
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
    invoice.Items.forEach((it: any) => {
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
}


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
