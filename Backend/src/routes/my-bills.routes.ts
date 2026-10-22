import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { r2 } from "../lib/money.js";
import { extractBillDetails } from "../lib/billExtractor.js";

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

const router = Router();

// GET /api/my-bills
// Returns personal B2C bills received on the authenticated user's Mitra ID or phone,
// as well as any personal shopping bills added manually, uploaded, or scanned by the user.
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mitraId: true, phone: true, email: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const { q, status } = req.query;
    const term = typeof q === "string" && q.trim() ? q.trim() : "";

    // 1. Fetch personal bills created by this user
    const personalWhere: any = { userId };
    if (status && status !== "ALL") {
      if (status === "PAID") {
        personalWhere.paymentStatus = "PAID";
      } else if (status === "UNPAID") {
        personalWhere.paymentStatus = { in: ["UNPAID", "PARTIAL"] };
      }
    }
    if (term) {
      personalWhere.OR = [
        { shopName: { contains: term, mode: "insensitive" } },
        { billNumber: { contains: term, mode: "insensitive" } },
        { notes: { contains: term, mode: "insensitive" } },
      ];
    }

    const rawPersonalBills = await prisma.personalBill.findMany({
      where: personalWhere,
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    });

    // 2. Fetch seller-sent bills matching customer criteria
    const customerConditions: any[] = [];
    if (user.mitraId) {
      customerConditions.push({ mitraId: { equals: user.mitraId, mode: "insensitive" } });
    }
    if (user.phone) {
      customerConditions.push({ phone: user.phone });
    }
    if (user.email) {
      customerConditions.push({ email: user.email });
    }

    let rawSellerBills: any[] = [];
    if (customerConditions.length > 0) {
      const sellerWhere: any = {
        status: { not: "CANCELLED" },
        OR: [{ buyerGstin: null }, { buyerGstin: "" }],
        customer: {
          OR: customerConditions,
        },
        ...(req.user?.businessId ? { businessId: { not: req.user.businessId } } : {}),
      };

      if (status && status !== "ALL") {
        if (status === "PAID") {
          sellerWhere.paymentStatus = "PAID";
        } else if (status === "UNPAID") {
          sellerWhere.paymentStatus = { in: ["UNPAID", "PARTIAL"] };
        }
      }

      if (term) {
        sellerWhere.AND = [
          {
            OR: [
              { invoiceNumber: { contains: term, mode: "insensitive" } },
              { business: { name: { contains: term, mode: "insensitive" } } },
              { business: { tradeName: { contains: term, mode: "insensitive" } } },
            ],
          },
        ];
      }

      rawSellerBills = await prisma.salesInvoice.findMany({
        where: sellerWhere,
        include: {
          business: {
            select: {
              id: true,
              name: true,
              tradeName: true,
              phone: true,
              address: true,
              gstin: true,
              upiId: true,
            },
          },
          Items: true,
          payments: {
            orderBy: { paidOn: "desc" },
            take: 5,
          },
        },
        orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
      });
    }

    let totalSpent = 0;
    let paidAmount = 0;
    let unpaidAmount = 0;
    let unpaidCount = 0;

    // Map seller bills
    const formattedSellerBills = rawSellerBills.map((b) => {
      totalSpent += b.totalAmount;
      paidAmount += b.paidAmount;
      const pending = r2(Math.max(0, b.totalAmount - b.paidAmount));
      if (pending > 0 && b.paymentStatus !== "PAID") {
        unpaidAmount += pending;
        unpaidCount++;
      }

      return {
        id: b.id,
        source: "SELLER" as const,
        invoiceNumber: b.invoiceNumber,
        invoiceDate: b.invoiceDate,
        totalAmount: b.totalAmount,
        subtotal: b.subtotal,
        totalTax: r2(b.totalCgst + b.totalSgst + b.totalIgst + b.totalCess),
        paidAmount: b.paidAmount,
        pendingAmount: pending,
        paymentStatus: b.paymentStatus,
        paymentMode: b.payments?.[0]?.mode || (b.paymentStatus === "PAID" ? "PAID" : "UNPAID"),
        lastReminderSentAt: b.lastReminderSentAt,
        reminderCount: b.reminderCount,
        receiptUrl: null,
        seller: {
          name: b.business.tradeName || b.business.name,
          phone: b.business.phone,
          address: b.business.address,
          gstin: b.business.gstin,
          upiId: b.business.upiId,
        },
        Items: b.Items.map((it: any) => ({
          id: it.id,
          description: it.description,
          hsnSacCode: it.hsnSacCode,
          quantity: it.quantity,
          unit: it.unit,
          rate: it.rate,
          gstRate: it.gstRate,
          totalAmount: it.totalAmount,
        })),
      };
    });

    // Map personal bills
    const formattedPersonalBills = rawPersonalBills.map((pb) => {
      totalSpent += pb.totalAmount;
      paidAmount += pb.paidAmount;
      const pending = r2(Math.max(0, pb.totalAmount - pb.paidAmount));
      if (pending > 0 && pb.paymentStatus !== "PAID") {
        unpaidAmount += pending;
        unpaidCount++;
      }

      let parsedItems: any[] = [];
      try {
        parsedItems = typeof pb.items === "string" ? JSON.parse(pb.items) : (pb.items as any[]) || [];
      } catch {
        parsedItems = [];
      }

      return {
        id: pb.id,
        source: "PERSONAL" as const,
        invoiceNumber: pb.billNumber || "PERSONAL",
        invoiceDate: pb.billDate.toISOString(),
        totalAmount: pb.totalAmount,
        subtotal: pb.subtotal,
        totalTax: pb.totalTax,
        paidAmount: pb.paidAmount,
        pendingAmount: pending,
        paymentStatus: pb.paymentStatus,
        paymentMode: pb.paymentMode,
        lastReminderSentAt: null,
        reminderCount: 0,
        receiptUrl: pb.receiptUrl,
        notes: pb.notes,
        seller: {
          name: pb.shopName,
          phone: null,
          address: null,
          gstin: null,
          upiId: null,
        },
        Items: parsedItems.map((it: any, idx: number) => ({
          id: it.id || `item_${idx}`,
          description: it.description || "Item",
          hsnSacCode: it.hsnSacCode || null,
          quantity: Number(it.quantity) || 1,
          unit: it.unit || "PCS",
          rate: Number(it.rate) || 0,
          gstRate: Number(it.gstRate) || 0,
          totalAmount: Number(it.totalAmount) || 0,
        })),
      };
    });

    // Merge and sort by date descending
    const allBills = [...formattedSellerBills, ...formattedPersonalBills].sort((a, b) => {
      const dateA = new Date(a.invoiceDate).getTime();
      const dateB = new Date(b.invoiceDate).getTime();
      return dateB - dateA;
    });

    res.json({
      bills: allBills,
      summary: {
        totalBills: allBills.length,
        totalSpent: r2(totalSpent),
        paidAmount: r2(paidAmount),
        unpaidAmount: r2(unpaidAmount),
        unpaidCount,
      },
    });
  } catch (error: any) {
    console.error("My Shopping Bills error:", error);
    res.status(500).json({ error: "Failed to fetch bills." });
  }
});

// POST /api/my-bills/personal
// Creates a personal shopping bill manually
router.post("/personal", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const {
      shopName,
      billNumber,
      billDate,
      items,
      subtotal,
      totalTax,
      totalAmount,
      paidAmount,
      paymentStatus,
      paymentMode,
      notes,
      receiptUrl,
    } = req.body;

    if (!shopName || !shopName.trim()) {
      return res.status(400).json({ error: "Shop / Store name is required." });
    }

    const parsedDate = billDate ? new Date(billDate) : new Date();
    const finalItems = Array.isArray(items) && items.length > 0 ? items : [];

    let computedSubtotal = Number(subtotal) || 0;
    let computedTax = Number(totalTax) || 0;
    let computedTotal = Number(totalAmount) || 0;

    if (computedTotal === 0 && finalItems.length > 0) {
      computedSubtotal = finalItems.reduce((acc, it) => acc + (Number(it.rate) * Number(it.quantity) || 0), 0);
      computedTotal = finalItems.reduce((acc, it) => acc + (Number(it.totalAmount) || 0), 0);
      computedTax = Math.max(0, computedTotal - computedSubtotal);
    }

    const status = paymentStatus === "UNPAID" || paymentStatus === "PARTIAL" ? paymentStatus : "PAID";
    const finalPaid = status === "PAID" ? computedTotal : Number(paidAmount) || 0;

    const newBill = await prisma.personalBill.create({
      data: {
        userId,
        shopName: shopName.trim(),
        billNumber: billNumber ? billNumber.trim() : `PB-${Date.now().toString().slice(-6)}`,
        billDate: parsedDate,
        notes: notes ? notes.trim() : null,
        subtotal: r2(computedSubtotal),
        totalTax: r2(computedTax),
        totalAmount: r2(computedTotal),
        paidAmount: r2(finalPaid),
        paymentStatus: status,
        paymentMode: paymentMode || "CASH",
        receiptUrl: receiptUrl || null,
        items: finalItems,
      },
    });

    res.status(201).json({
      message: "Shopping bill added successfully.",
      bill: newBill,
    });
  } catch (error: any) {
    console.error("Create personal bill error:", error);
    res.status(500).json({ error: "Failed to add personal bill." });
  }
});

// POST /api/my-bills/extract-bill
// AI OCR Extraction for Shopping Bills (Photos/PDFs) without requiring a business
router.post("/extract-bill", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    let incomingFiles: Array<{ name?: string; type?: string; data?: string }> = [];
    if (Array.isArray(req.body.files)) {
      incomingFiles = req.body.files;
    } else if (req.body.file) {
      incomingFiles = [req.body.file];
    } else if (req.body.data) {
      incomingFiles = [{ name: req.body.name, type: req.body.type, data: req.body.data }];
    }

    if (incomingFiles.length === 0) {
      return res.status(400).json({ error: "No files provided for extraction." });
    }

    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const results = [];

    for (const [idx, item] of incomingFiles.entries()) {
      if (!item || !item.data) continue;

      let base64String = item.data;
      let detectedType = item.type || "image/jpeg";
      const originalName = item.name || `scanned_receipt_${idx + 1}.jpg`;

      if (base64String.includes(";base64,")) {
        const parts = base64String.split(";base64,");
        detectedType = parts[0].replace(/^data:/, "");
        base64String = parts[1];
      }

      const fileBuffer = Buffer.from(base64String, "base64");
      const ext =
        detectedType.includes("pdf") || originalName.toLowerCase().endsWith(".pdf")
          ? ".pdf"
          : detectedType.includes("png")
            ? ".png"
            : detectedType.includes("webp")
              ? ".webp"
              : ".jpg";

      const safeBase = originalName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30);
      const savedFileName = `receipt_${userId.slice(0, 8)}_${Date.now()}_${safeBase}${ext}`;
      const savedPath = path.join(UPLOADS_DIR, savedFileName);

      fs.writeFileSync(savedPath, fileBuffer);

      // Perform extraction
      const extracted = await extractBillDetails(
        fileBuffer,
        detectedType,
        originalName
      );

      results.push({
        id: `extracted_${Date.now()}_${idx}`,
        fileName: originalName,
        fileUrl: `/uploads/${savedFileName}`,
        shopName: extracted.vendorName || "Retail Store",
        billNumber: extracted.billNumber || "",
        billDate: extracted.billDate || new Date().toISOString().substring(0, 10),
        subtotal: extracted.subtotal,
        totalTax: r2(extracted.totalCgst + extracted.totalSgst + extracted.totalIgst + extracted.totalCess),
        totalAmount: extracted.totalAmount,
        confidence: extracted.confidence,
        Items: extracted.Items.map((it) => ({
          description: it.description,
          quantity: it.quantity || 1,
          unit: it.unit || "PCS",
          rate: it.rate,
          gstRate: it.gstRate,
          totalAmount: it.totalAmount,
        })),
      });
    }

    res.json({
      success: true,
      extractedCount: results.length,
      bills: results,
    });
  } catch (error: any) {
    console.error("Extract shopping bill error:", error);
    res.status(500).json({ error: error.message || "Failed to extract receipt details." });
  }
});

// POST /api/my-bills/batch-save-personal
// Batch save extracted shopping receipts
router.post("/batch-save-personal", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { bills } = req.body;
    if (!Array.isArray(bills) || bills.length === 0) {
      return res.status(400).json({ error: "No bills provided to save." });
    }

    let savedCount = 0;
    for (const b of bills) {
      const shopName = b.shopName || b.vendor?.name || "Retail Store";
      const billDate = b.billDate ? new Date(b.billDate) : new Date();
      const billNumber = b.billNumber || `PB-${Date.now().toString().slice(-6)}`;
      const items = b.Items || [];
      const totalAmount = Number(b.totalAmount) || 0;
      const subtotal = Number(b.subtotal) || 0;
      const totalTax = Number(b.totalTax) || 0;

      await prisma.personalBill.create({
        data: {
          userId,
          shopName,
          billNumber,
          billDate,
          items,
          subtotal: r2(subtotal),
          totalTax: r2(totalTax),
          totalAmount: r2(totalAmount),
          paidAmount: r2(totalAmount),
          paymentStatus: "PAID",
          paymentMode: "CASH",
          receiptUrl: b.fileUrl || null,
        },
      });
      savedCount++;
    }

    res.json({ success: true, savedCount });
  } catch (error: any) {
    console.error("Batch save personal bills error:", error);
    res.status(500).json({ error: "Failed to save bills." });
  }
});

function drawMyBillPdf(res: Response, bill: any, business: any) {
  const safeBillNumber = (bill.billNumber || "RECEIPT").replace(/[^a-zA-Z0-9_-]/g, "_");
  const doc = new PDFDocument({ margin: 30, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="BILL-${safeBillNumber}.pdf"`);
  doc.pipe(res);

  const fontDir = path.join(__dirname, "..", "assets", "fonts");
  const regPath = path.join(fontDir, "NotoSerif-Regular.ttf");
  const boldPath = path.join(fontDir, "NotoSerif-Bold.ttf");
  const hasUnicodeFont = fs.existsSync(regPath) && fs.existsSync(boldPath);
  if (hasUnicodeFont) {
    doc.registerFont("Bill-Regular", regPath);
    doc.registerFont("Bill-Bold", boldPath);
  }
  const regularFont = hasUnicodeFont ? "Bill-Regular" : "Times-Roman";
  const boldFont = hasUnicodeFont ? "Bill-Bold" : "Times-Bold";
  const cur = hasUnicodeFont ? "₹" : "Rs. ";

  const L = 40, R = 555, W = R - L;
  const HEADER_H = 28, ROW_MIN = 38, SUMMARY_STEP = 24;
  const PAGE_LIMIT = 780, SIGN_Y = PAGE_LIMIT - 25;
  const META_TOP = 155, META_STEP = 17;
  const TABLE_TOP = 325, CONT_TABLE_TOP = 75;

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  const money = (amount: number) => `${cur}${formatAmount(amount)}`;
  const formatDate = (date: Date) => new Date(date).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
  const formatRate = (rate: number) => (Number.isInteger(rate) ? String(rate) : String(Number(rate.toFixed(2))));
  const line = (x1: number, y1: number, x2: number, y2: number, color = "#D0D0D0") => {
    doc.moveTo(x1, y1).lineTo(x2, y2).lineWidth(0.5).strokeColor(color).stroke();
  };
  const balance = Math.max(0, bill.totalAmount - bill.paidAmount);
  const drawFrame = () => {
    doc.rect(20, 20, 555, 802).lineWidth(0.8).strokeColor("#64748B").stroke();
  };
  const startPage = () => {
    doc.addPage();
    drawFrame();
  };
  drawFrame();

  const columns = [
    { x: 40, width: 25, label: "#", align: "center" as const },
    { x: 65, width: 145, label: "Item / Description", align: "left" as const },
    { x: 210, width: 55, label: "HSN/SAC", align: "center" as const },
    { x: 265, width: 45, label: "Qty", align: "right" as const },
    { x: 310, width: 60, label: "Rate", align: "right" as const },
    { x: 370, width: 50, label: "GST", align: "right" as const },
    { x: 420, width: 65, label: "Tax", align: "right" as const },
    { x: 485, width: 70, label: "Amount", align: "right" as const },
  ];

  const drawTableHeader = (top: number) => {
    doc.rect(L, top, W, HEADER_H).fillColor("#3D403D").fill();
    doc.font(boldFont).fontSize(7.5).fillColor("#FFFFFF");
    columns.forEach((c) => {
      doc.text(c.label, c.x + 3, top + 10, { width: c.width - 6, align: c.align, lineBreak: false });
    });
    line(L, top, R, top, "#64748B");
    line(L, top + HEADER_H, R, top + HEADER_H, "#64748B");
    line(L, top, L, top + HEADER_H, "#64748B");
    line(R, top, R, top + HEADER_H, "#64748B");
    columns.slice(1).forEach((column) => line(column.x, top, column.x, top + HEADER_H, "#64748B"));
  };

  const drawHeading = (continued = false) => {
    if (continued) {
      doc.font(boldFont).fontSize(12).fillColor("#111111");
      doc.text(`BILL ${bill.billNumber} (continued)`, L, 40, { width: W, align: "right", lineBreak: false });
      return;
    }

    doc.font(boldFont).fontSize(26).fillColor("#111111");
    doc.text("RECEIPT", L, 40, { width: W, align: "right", lineBreak: false });
    doc.font(boldFont).fontSize(11).fillColor("#111111");
    doc.text(`Bill No. ${bill.billNumber}`, L, 78, { width: W, align: "right", lineBreak: false });
    doc.font(regularFont).fontSize(7.5).fillColor("#333333");
    doc.text("Balance Due", L, 104, { width: W, align: "right", lineBreak: false });
    doc.font(boldFont).fontSize(13).fillColor("#111111");
    doc.text(money(balance), L, 117, { width: W, align: "right", lineBreak: false });

    // Buyer / Customer block
    doc.font(boldFont).fontSize(11).fillColor("#111111");
    doc.text(business.name, L, 40, { width: 300, lineBreak: false, ellipsis: true });
    doc.font(regularFont).fontSize(8).fillColor("#333333");
    const businessLines = [
      business.address,
      business.stateName,
      "India",
      business.phone ? String(business.phone) : null,
      business.email ? String(business.email) : null,
    ].filter((v): v is string => Boolean(v));
    businessLines.forEach((v, i) => {
      doc.text(v, L, 58 + i * 12, { width: 300, lineBreak: false, ellipsis: true });
    });

    const metadata: [string, string][] = [
      ["Bill Date", formatDate(new Date(bill.billDate))],
      ["Payment Status", bill.status === "PAID" ? "Paid" : bill.status === "PARTIAL" ? "Partially paid" : "Unpaid"],
      ["Payment Mode", bill.paymentMode || "CASH"],
    ];
    metadata.forEach(([label, value], i) => {
      const y = META_TOP + i * META_STEP;
      doc.font(regularFont).fontSize(8).fillColor("#555555");
      doc.text(label, 300, y, { width: 100, lineBreak: false });
      doc.font(boldFont).fontSize(8).fillColor("#222222");
      doc.text(value, 402, y, { width: 153, lineBreak: false, ellipsis: true });
    });

    // Store / Shop block
    const bfY = META_TOP;
    doc.font(regularFont).fontSize(8).fillColor("#555555").text("Purchased At", L, bfY, { lineBreak: false });
    doc.font(boldFont).fontSize(9).fillColor("#2463C7").text(bill.vendor.name, L, bfY + 14, {
      width: 250,
      lineBreak: false,
      ellipsis: true,
    });
    doc.font(regularFont).fontSize(8).fillColor("#333333");
    const vendorLines = [
      bill.vendor.address,
      bill.vendor.stateName,
      bill.vendor.phone ? String(bill.vendor.phone) : null,
      bill.vendor.email ? String(bill.vendor.email) : null,
    ].filter((v): v is string => Boolean(v));
    vendorLines.forEach((v, i) => {
      doc.text(v, L, bfY + 28 + i * 12, { width: 250, lineBreak: false, ellipsis: true });
    });
  };

  // Page 1
  drawHeading();
  let tableTop = TABLE_TOP;
  drawTableHeader(tableTop);
  let itemY = tableTop + HEADER_H;

  bill.Items.forEach((item: any, index: number) => {
    doc.font(regularFont).fontSize(8);
    const description = String(item.description || "");
    const rowHeight = Math.min(90, Math.max(ROW_MIN, doc.heightOfString(description, { width: 137 }) + 20));

    if (itemY + rowHeight > PAGE_LIMIT && itemY > tableTop + HEADER_H) {
      startPage();
      drawHeading(true);
      tableTop = CONT_TABLE_TOP;
      drawTableHeader(tableTop);
      itemY = tableTop + HEADER_H;
    }

    const textY = itemY + 11;
    doc.font(regularFont).fontSize(8).fillColor("#222222");
    doc.text(String(index + 1), 42, textY, { width: 21, align: "center", lineBreak: false });
    doc.text(description, 68, textY, { width: 137, height: rowHeight - 16, ellipsis: true });
    doc.text(item.hsnSacCode || "-", 212, textY, { width: 51, align: "center", lineBreak: false });
    doc.text(Number(item.quantity).toFixed(2), 267, textY, { width: 41, align: "right", lineBreak: false });
    doc.text(formatAmount(item.rate), 312, textY, { width: 55, align: "right", lineBreak: false });
    doc.text(`${formatRate(item.gstRate || 0)}%`, 372, textY, { width: 45, align: "right", lineBreak: false });
    const itemTax = (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0) + (item.cessAmount || 0);
    doc.text(formatAmount(itemTax), 422, textY, { width: 59, align: "right", lineBreak: false });
    doc.font(boldFont).text(formatAmount(item.totalAmount), 487, textY, { width: 64, align: "right", lineBreak: false });
    doc.font(regularFont).fontSize(7).fillColor("#555555").text(String(item.unit || "pcs").toLowerCase(), 267, textY + 11, {
      width: 41,
      align: "right",
      lineBreak: false,
    });

    line(L, itemY, R, itemY);
    line(L, itemY + rowHeight, R, itemY + rowHeight);
    line(L, itemY, L, itemY + rowHeight, "#E2E8F0");
    line(R, itemY, R, itemY + rowHeight, "#E2E8F0");
    columns.slice(1).forEach((column) => line(column.x, itemY, column.x, itemY + rowHeight, "#E2E8F0"));
    itemY += rowHeight;
  });

  // Summary rows
  type SummaryRow = { label: string; amount: number; bold?: boolean; color?: string };
  const rows: SummaryRow[] = [{ label: "Sub Total", amount: bill.subtotal }];

  if (bill.totalTax > 0) {
    rows.push({ label: "Estimated Tax", amount: bill.totalTax });
  }
  rows.push({ label: "Total", amount: bill.totalAmount, bold: true, color: "#111111" });
  if (bill.paidAmount > 0) {
    rows.push({ label: "Paid Amount (-)", amount: bill.paidAmount, color: "#B42318" });
  }

  const BOX_H = 30;
  const summaryHeight = rows.length * SUMMARY_STEP + 8 + BOX_H;
  let summaryY = itemY + 20;
  if (summaryY + summaryHeight > SIGN_Y - 20) {
    startPage();
    drawHeading(true);
    summaryY = 80;
  }

  rows.forEach((r) => {
    doc.font(r.bold ? boldFont : regularFont).fontSize(r.bold ? 9 : 8).fillColor(r.color ?? "#333333");
    doc.text(r.label, 330, summaryY, { width: 140, align: "right", lineBreak: false });
    doc.text(r.bold || r.label.startsWith("Paid") ? money(r.amount) : formatAmount(r.amount), 475, summaryY, {
      width: 80,
      align: "right",
      lineBreak: false,
    });
    summaryY += SUMMARY_STEP;
  });

  const boxTop = summaryY - 6;
  doc.rect(310, boxTop, R - 310, BOX_H).fillColor("#F4F3F1").fill();
  doc.font(boldFont).fontSize(9).fillColor("#111111");
  doc.text("Balance Due", 330, boxTop + 11, { width: 140, align: "right", lineBreak: false });
  doc.text(money(balance), 475, boxTop + 11, { width: 80, align: "right", lineBreak: false });

  doc.end();
}

// GET /api/my-bills/:id/pdf
// Direct PDF download for customer viewing their own B2C bill (seller invoice or personal bill)
router.get("/:id/pdf", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mitraId: true, phone: true, email: true },
    });

    const billId = req.params.id as string;

    // Check personal bills first
    const personal = await prisma.personalBill.findFirst({
      where: { id: billId, userId },
    });

    if (personal) {
      let items: any[] = [];
      try {
        items = typeof personal.items === "string" ? JSON.parse(personal.items) : (personal.items as any[]) || [];
      } catch {
        items = [];
      }

      const bill = {
        billNumber: personal.billNumber || "RECEIPT",
        billDate: personal.billDate,
        status: personal.paymentStatus,
        paymentMode: personal.paymentMode,
        subtotal: personal.subtotal,
        totalTax: personal.totalTax,
        totalAmount: personal.totalAmount,
        paidAmount: personal.paidAmount,
        vendor: {
          name: personal.shopName,
          address: null,
          stateName: null,
          stateCode: null,
          phone: null,
          email: null,
        },
        Items: items.map((it: any) => ({
          description: it.description || "Item",
          hsnSacCode: it.hsnSacCode || null,
          quantity: it.quantity || 1,
          unit: it.unit || "PCS",
          rate: it.rate || 0,
          gstRate: it.gstRate || 0,
          totalAmount: it.totalAmount || 0,
        })),
      };

      const buyer = {
        name: user?.name || "Customer",
        address: null,
        stateName: null,
        stateCode: null,
        phone: user?.phone || null,
        email: user?.email || null,
      };

      drawMyBillPdf(res, bill, buyer);
      return;
    }

    // Otherwise check seller invoice
    const customerConditions: any[] = [];
    if (user?.mitraId) customerConditions.push({ mitraId: { equals: user.mitraId, mode: "insensitive" } });
    if (user?.phone) customerConditions.push({ phone: user.phone });
    if (user?.email) customerConditions.push({ email: user.email });

    if (customerConditions.length === 0) return res.status(404).json({ error: "Bill not found." });

    const invoice: any = await prisma.salesInvoice.findFirst({
      where: { id: billId, customer: { OR: customerConditions } },
      include: { customer: true, Items: true },
    });
    if (!invoice) return res.status(404).json({ error: "Bill not found." });

    const seller = await prisma.business.findUnique({ where: { id: invoice.businessId } });
    if (!seller) return res.status(404).json({ error: "Business profile not found." });

    const cust: any = invoice.customer;

    const bill = {
      billNumber: invoice.invoiceNumber,
      billDate: invoice.invoiceDate,
      dueDate: invoice.dueDate ?? null,
      category: "OTHER",
      status: invoice.paymentStatus,
      paymentMode: invoice.paymentStatus === "PAID" ? "PAID" : "UNPAID",
      placeOfSupply: invoice.placeOfSupply ?? seller.stateCode,
      isItcEligible: false,
      subtotal: invoice.subtotal,
      totalTax: r2(invoice.totalCgst + invoice.totalSgst + invoice.totalIgst + (invoice.totalCess ?? 0)),
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      vendor: {
        name: seller.tradeName || seller.name,
        address: seller.address,
        stateName: seller.stateName,
        stateCode: seller.stateCode,
        phone: seller.phone,
        email: seller.email,
      },
      Items: invoice.Items.map((it: any) => ({
        description: it.description,
        hsnSacCode: it.hsnSacCode,
        quantity: it.quantity,
        unit: it.unit,
        rate: it.rate,
        gstRate: it.gstRate,
        cgstAmount: it.cgstAmount ?? 0,
        sgstAmount: it.sgstAmount ?? 0,
        igstAmount: it.igstAmount ?? 0,
        cessAmount: it.cessAmount ?? 0,
        totalAmount: it.totalAmount,
      })),
    };

    const buyer = {
      name: cust?.name || user?.name || "Customer",
      address: cust?.address ?? null,
      stateName: cust?.stateName ?? seller.stateName,
      stateCode: cust?.stateCode ?? seller.stateCode,
      phone: cust?.phone ?? user?.phone ?? null,
      email: cust?.email ?? null,
    };

    drawMyBillPdf(res, bill, buyer);
  } catch (error: any) {
    console.error("My bill PDF error:", error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: "Failed to generate PDF." });
  }
});

// DELETE /api/my-bills/:id
// Removes a bill from the authenticated customer's shopping bills (handles both personal and seller-sent bills)
router.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const billId = req.params.id as string;

    // 1. Check if it's a personal bill
    const personalBill = await prisma.personalBill.findFirst({
      where: { id: billId, userId },
    });

    if (personalBill) {
      await prisma.personalBill.delete({ where: { id: billId } });
      return res.json({ message: "Bill deleted from your shopping bills successfully." });
    }

    // 2. Otherwise check if it's a seller-sent bill
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mitraId: true, phone: true, email: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const customerConditions: any[] = [];
    if (user.mitraId) {
      customerConditions.push({ mitraId: { equals: user.mitraId, mode: "insensitive" } });
    }
    if (user.phone) {
      customerConditions.push({ phone: user.phone });
    }
    if (user.email) {
      customerConditions.push({ email: user.email });
    }

    if (customerConditions.length === 0) {
      return res.status(404).json({ error: "No matching shopping bills found." });
    }

    const invoice = await prisma.salesInvoice.findFirst({
      where: {
        id: billId,
        customer: { OR: customerConditions },
      },
      include: { customer: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Bill not found in your shopping bills." });
    }

    // Reassign invoice to an unlinked customer profile under the seller's shop
    let unlinkedCustomer = await prisma.customer.findFirst({
      where: {
        businessId: invoice.businessId,
        name: invoice.customer.name,
        mitraId: null,
        phone: null,
        email: null,
      },
    });

    if (!unlinkedCustomer) {
      unlinkedCustomer = await prisma.customer.create({
        data: {
          businessId: invoice.businessId,
          name: invoice.customer.name || "Customer",
          stateCode: invoice.customer.stateCode,
          stateName: invoice.customer.stateName,
          address: invoice.customer.address,
        },
      });
    }

    await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: { customerId: unlinkedCustomer.id },
    });

    res.json({ message: "Bill removed from your shopping bills successfully." });
  } catch (error: any) {
    console.error("Delete my-bill error:", error);
    res.status(500).json({ error: "Failed to remove bill from your shopping bills." });
  }
});

export default router;
