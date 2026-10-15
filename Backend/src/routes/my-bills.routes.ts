import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { renderInvoicePdfStream } from "./sales.routes.js";
import { r2 } from "../lib/money.js";

import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

const router = Router();

// GET /api/my-bills
// Returns personal B2C bills received on the authenticated user's Mitra ID or phone
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mitraId: true, phone: true },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const customerConditions: any[] = [];
    if (user.mitraId) {
      customerConditions.push({ mitraId: { equals: user.mitraId, mode: "insensitive" } });
    }
    if (user.phone) {
      customerConditions.push({ phone: user.phone });
    }

    if (customerConditions.length === 0) {
      return res.json({
        bills: [],
        summary: {
          totalBills: 0,
          totalSpent: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          unpaidCount: 0,
        },
      });
    }

    const { q, status } = req.query;

    const whereClause: any = {
      status: { not: "CANCELLED" },
      OR: [{ buyerGstin: null }, { buyerGstin: "" }],
      customer: {
        OR: customerConditions,
      },
      ...(req.user?.businessId ? { businessId: { not: req.user.businessId } } : {}),
    };

    if (status && status !== "ALL") {
      if (status === "PAID") {
        whereClause.paymentStatus = "PAID";
      } else if (status === "UNPAID") {
        whereClause.paymentStatus = { in: ["UNPAID", "PARTIAL"] };
      }
    }

    if (q && typeof q === "string" && q.trim()) {
      const term = q.trim();
      whereClause.AND = [
        {
          OR: [
            { invoiceNumber: { contains: term, mode: "insensitive" } },
            { business: { name: { contains: term, mode: "insensitive" } } },
            { business: { tradeName: { contains: term, mode: "insensitive" } } },
          ],
        },
      ];
    }

    const rawBills = await prisma.salesInvoice.findMany({
      where: whereClause,
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
        items: true,
        payments: {
          orderBy: { paidOn: "desc" },
          take: 5,
        },
      },
      orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    });

    let totalSpent = 0;
    let paidAmount = 0;
    let unpaidAmount = 0;
    let unpaidCount = 0;

    const bills = rawBills.map((b) => {
      totalSpent += b.totalAmount;
      paidAmount += b.paidAmount;
      const pending = r2(Math.max(0, b.totalAmount - b.paidAmount));
      if (pending > 0 && b.paymentStatus !== "PAID") {
        unpaidAmount += pending;
        unpaidCount++;
      }

      return {
        id: b.id,
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
        seller: {
          name: b.business.tradeName || b.business.name,
          phone: b.business.phone,
          address: b.business.address,
          gstin: b.business.gstin,
          upiId: b.business.upiId,
        },
        items: b.items.map((it) => ({
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

    res.json({
      bills,
      summary: {
        totalBills: bills.length,
        totalSpent: r2(totalSpent),
        paidAmount: r2(paidAmount),
        unpaidAmount: r2(unpaidAmount),
        unpaidCount,
      },
    });
  } catch (error: any) {
    console.error("My bills error:", error);
    res.status(500).json({ error: "Failed to fetch bills." });
  }
});

function drawMyBillPdf(res: Response, bill: any, business: any) {
  const safeBillNumber = bill.billNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
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
    doc.text("BILL", L, 40, { width: W, align: "right", lineBreak: false });
    doc.font(boldFont).fontSize(11).fillColor("#111111");
    doc.text(`Bill No. ${bill.billNumber}`, L, 78, { width: W, align: "right", lineBreak: false });
    doc.font(regularFont).fontSize(7.5).fillColor("#333333");
    doc.text("Balance Due", L, 104, { width: W, align: "right", lineBreak: false });
    doc.font(boldFont).fontSize(13).fillColor("#111111");
    doc.text(money(balance), L, 117, { width: W, align: "right", lineBreak: false });

    // Top-left block (the customer, same position the purchase bill uses for the buyer). GSTIN removed.
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
      ["Bill Date", formatDate(bill.billDate)],
      ["Category", bill.category.replace(/_/g, " ")],
      ["Payment Status", bill.status === "PAID" ? "Paid" : bill.status === "PARTIAL" ? "Partially paid" : "Unpaid"],
      [
        "Place of Supply",
        bill.placeOfSupply === business.stateCode
          ? `${business.stateName} (${bill.placeOfSupply})`
          : bill.placeOfSupply === bill.vendor.stateCode
            ? `${bill.vendor.stateName} (${bill.placeOfSupply})`
            : bill.placeOfSupply,
      ],
    ];
    metadata.forEach(([label, value], i) => {
      const y = META_TOP + i * META_STEP;
      doc.font(regularFont).fontSize(8).fillColor("#555555");
      doc.text(label, 300, y, { width: 100, lineBreak: false });
      doc.font(boldFont).fontSize(8).fillColor("#222222");
      doc.text(value, 402, y, { width: 153, lineBreak: false, ellipsis: true });
    });

    // Bill From (the seller shop). GSTIN removed.
    const bfY = META_TOP;
    doc.font(regularFont).fontSize(8).fillColor("#555555").text("Bill From", L, bfY, { lineBreak: false });
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

  // ---------- Page 1 ----------
  drawHeading();
  let tableTop = TABLE_TOP;
  drawTableHeader(tableTop);
  let itemY = tableTop + HEADER_H;

  bill.items.forEach((item: any, index: number) => {
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
    doc.text(`${formatRate(item.gstRate)}%`, 372, textY, { width: 45, align: "right", lineBreak: false });
    const itemTax = item.cgstAmount + item.sgstAmount + item.igstAmount + item.cessAmount;
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

  // ---------- Summary rows ----------
  type SummaryRow = { label: string; amount: number; bold?: boolean; color?: string };
  const rows: SummaryRow[] = [{ label: "Sub Total", amount: bill.subtotal }];

  const taxSlabs = new Map<number, { cgst: number; sgst: number; igst: number }>();
  bill.items.forEach((item: any) => {
    const slab = taxSlabs.get(item.gstRate) ?? { cgst: 0, sgst: 0, igst: 0 };
    slab.cgst += item.cgstAmount;
    slab.sgst += item.sgstAmount;
    slab.igst += item.igstAmount;
    taxSlabs.set(item.gstRate, slab);
  });
  [...taxSlabs.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([rate, tax]) => {
      if (tax.cgst > 0) rows.push({ label: `CGST (${formatRate(rate / 2)}%)`, amount: tax.cgst });
      if (tax.sgst > 0) rows.push({ label: `SGST (${formatRate(rate / 2)}%)`, amount: tax.sgst });
      if (tax.igst > 0) rows.push({ label: `IGST (${formatRate(rate)}%)`, amount: tax.igst });
    });
  if (bill.totalCess > 0) rows.push({ label: "Cess", amount: bill.totalCess });
  rows.push({ label: "Total", amount: bill.totalAmount, bold: true, color: "#111111" });
  if (bill.paidAmount > 0) {
    rows.push({ label: "Payments Made (-)", amount: bill.paidAmount, color: "#B42318" });
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
    doc.text(r.bold || r.label.startsWith("Payments") ? money(r.amount) : formatAmount(r.amount), 475, summaryY, {
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

  doc.font(regularFont).fontSize(8).fillColor("#2463C7");
  doc.text("Authorized Signature", L, SIGN_Y, { lineBreak: false });
  line(L + 95, SIGN_Y + 8, L + 250, SIGN_Y + 8, "#333333");

  doc.end();
}

// GET /api/my-bills/:id/pdf
// Direct PDF download for customer viewing their own B2C bill
router.get("/:id/pdf", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, mitraId: true, phone: true },
    });

    const customerConditions: any[] = [];
    if (user?.mitraId) customerConditions.push({ mitraId: { equals: user.mitraId, mode: "insensitive" } });
    if (user?.phone) customerConditions.push({ phone: user.phone });
    if (customerConditions.length === 0) return res.status(404).json({ error: "Bill not found." });

    const invoice: any = await prisma.salesInvoice.findFirst({
      where: { id: req.params.id as string, customer: { OR: customerConditions } },
      include: { customer: true, items: true },
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
      placeOfSupply: invoice.placeOfSupply ?? seller.stateCode,
      isItcEligible: false,
      subtotal: invoice.subtotal,
      totalCgst: invoice.totalCgst,
      totalSgst: invoice.totalSgst,
      totalIgst: invoice.totalIgst,
      totalCess: invoice.totalCess ?? 0,
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
      items: invoice.items.map((it: any) => ({
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

export default router;
