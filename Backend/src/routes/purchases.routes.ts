import { Router, Response } from "express";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { r2 } from "../lib/money.js";
import { Prisma } from "../../app/generated/prisma/client.js";

const router = Router();

async function syncBillPayment(tx: Prisma.TransactionClient, billId: string) {
  const paymentTotal = await tx.purchasePayment.aggregate({
    where: { purchaseBillId: billId },
    _sum: { amount: true },
  });
  const paidAmount = r2(paymentTotal._sum.amount ?? 0);
  const bill = await tx.purchaseBill.findUniqueOrThrow({ where: { id: billId } });
  const status = paidAmount <= 0 ? "UNPAID" : paidAmount >= bill.totalAmount - 0.01 ? "PAID" : "PARTIAL";

  return tx.purchaseBill.update({
    where: { id: billId },
    data: { paidAmount, status },
    include: { vendor: true, items: true, payments: true },
  });
}

// List all purchase bills
// GET /bills?view=list -> lean payload for the Purchases page table (no line items, max `limit` rows)
// GET /bills           -> unchanged full payload (vendor + items) for any other caller
router.get("/bills", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { vendorId, category, isItcEligible, startDate, endDate } = req.query;

    const whereClause: any = { businessId };
    if (vendorId) whereClause.vendorId = String(vendorId);
    if (category) whereClause.category = String(category);
    if (isItcEligible !== undefined) whereClause.isItcEligible = isItcEligible === "true";

    if (startDate || endDate) {
      whereClause.billDate = {};
      if (startDate) whereClause.billDate.gte = new Date(String(startDate));
      if (endDate) whereClause.billDate.lte = new Date(String(endDate));
    }

    const isListView = req.query.view === "list";
    const take = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);

    const bills = await prisma.purchaseBill.findMany({
      where: whereClause,
      include: isListView
        ? { vendor: { select: { id: true, name: true, gstin: true, stateCode: true, stateName: true } } }
        : { vendor: true, items: true },
      orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
      ...(isListView ? { take } : {}),
    });

    res.json(bills);
  } catch (error: any) {
    console.error("Fetch purchase bills error:", error);
    res.status(500).json({ error: "Failed to fetch purchase bills." });
  }
});

router.get("/bills/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business." });
    const bill = await prisma.purchaseBill.findFirst({
      where: { id: req.params.id as string, businessId },
      include: { vendor: true, items: true },
    });
    if (!bill) return res.status(404).json({ error: "Purchase bill not found." });
    res.json(bill);
  } catch (error) {
    console.error("Fetch purchase bill error:", error);
    res.status(500).json({ error: "Failed to fetch purchase bill." });
  }
});

router.patch("/bills/:id/cess", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business." });
    const requestedItems: unknown = req.body?.items;
    if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
      return res.status(400).json({ error: "Provide at least one purchase line with its cess amount." });
    }

    const changes = new Map<string, number>();
    for (const [index, item] of requestedItems.entries()) {
      if (
        !item ||
        typeof item.id !== "string" ||
        typeof item.cessAmount !== "number" ||
        !Number.isFinite(item.cessAmount) ||
        item.cessAmount < 0
      ) {
        return res.status(400).json({ error: `Purchase line ${index + 1}: enter a valid non-negative cess amount.` });
      }
      if (changes.has(item.id)) return res.status(400).json({ error: "A purchase line was provided more than once." });
      changes.set(item.id, r2(item.cessAmount));
    }

    const updatedBill = await prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.findFirst({
        where: { id: req.params.id as string, businessId },
        include: { vendor: true, items: true },
      });
      if (!bill) return null;
      if ([...changes.keys()].some((id) => !bill.items.some((line) => line.id === id))) {
        throw new Error("Purchase line not found on this bill.");
      }

      let totalCess = 0;
      for (const item of bill.items) {
        const cessAmount = changes.get(item.id) ?? item.cessAmount;
        totalCess += cessAmount;
        if (changes.has(item.id)) {
          await tx.purchaseBillItem.update({
            where: { id: item.id },
            data: {
              cessAmount,
              cessRate: item.taxableValue > 0 ? r2((cessAmount / item.taxableValue) * 100) : 0,
              totalAmount: r2(
                item.taxableValue + item.igstAmount + item.cgstAmount + item.sgstAmount + cessAmount
              ),
            },
          });
        }
      }
      totalCess = r2(totalCess);
      const totalAmount = Math.round(bill.subtotal + bill.totalCgst + bill.totalSgst + bill.totalIgst + totalCess);
      if (totalAmount < bill.paidAmount - 0.01) {
        throw new Error("Updated total cannot be lower than the payments already recorded.");
      }
      const status =
        bill.paidAmount <= 0 ? "UNPAID" : bill.paidAmount >= totalAmount - 0.01 ? "PAID" : "PARTIAL";
      return tx.purchaseBill.update({
        where: { id: bill.id },
        data: { totalCess, totalAmount, status },
        include: { vendor: true, items: true, payments: true },
      });
    });
    if (!updatedBill) return res.status(404).json({ error: "Purchase bill not found." });
    res.json(updatedBill);
  } catch (error) {
    if (error instanceof Error && error.message === "Purchase line not found on this bill.") {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof Error && error.message === "Updated total cannot be lower than the payments already recorded.") {
      return res.status(400).json({ error: error.message });
    }
    console.error("Update purchase bill cess error:", error);
    res.status(500).json({ error: "Failed to update purchase bill cess." });
  }
});

router.get("/bills/:id/pdf", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business." });

    const id = req.params.id as string;
    const bill = await prisma.purchaseBill.findFirst({
      where: { id, businessId },
      include: { vendor: true, items: true },
    });
    if (!bill) return res.status(404).json({ error: "Purchase bill not found." });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business profile not found." });

    const safeBillNumber = bill.billNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="BILL-${safeBillNumber}.pdf"`);
    doc.pipe(res);

    // ---------- Fonts (₹ needs a Unicode TTF; falls back to Times + "Rs.") ----------
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

    // ---------- Layout constants (tune spacing here) ----------
    const L = 40;
    const R = 555;
    const W = R - L;
    const HEADER_H = 28;
    const ROW_MIN = 38; // min item row height
    const SUMMARY_STEP = 24; // gap between Sub Total / CGST / SGST / Total
    const PAGE_LIMIT = 780; // item rows are never drawn below this y
    const SIGN_Y = PAGE_LIMIT - 25; // signature ALWAYS sits here (bottom of the last page)
    const META_TOP = 155;
    const META_STEP = 17;
    const TABLE_TOP = 325;
    const CONT_TABLE_TOP = 75;

    const formatAmount = (amount: number) =>
      new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    const money = (amount: number) => `${cur}${formatAmount(amount)}`;
    const formatDate = (date: Date) => date.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
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

      // Bill number and balance are prominent and use values saved by the app.
      doc.font(boldFont).fontSize(26).fillColor("#111111");
      doc.text("BILL", L, 40, { width: W, align: "right", lineBreak: false });
      doc.font(boldFont).fontSize(11).fillColor("#111111");
      doc.text(`Bill No. ${bill.billNumber}`, L, 78, { width: W, align: "right", lineBreak: false });
      doc.font(regularFont).fontSize(7.5).fillColor("#333333");
      doc.text("Balance Due", L, 104, { width: W, align: "right", lineBreak: false });
      doc.font(boldFont).fontSize(13).fillColor("#111111");
      doc.text(money(balance), L, 117, { width: W, align: "right", lineBreak: false });

      // Left: your business (logo skipped, so the block starts at the top)
      doc.font(boldFont).fontSize(11).fillColor("#111111");
      doc.text(business.name, L, 40, { width: 300, lineBreak: false, ellipsis: true });
      doc.font(regularFont).fontSize(8).fillColor("#333333");
      const businessLines = [
        business.address,
        business.stateName,
        "India",
        business.gstin ? `GSTIN ${business.gstin}` : null,
        business.phone ? String(business.phone) : null,
        business.email ? String(business.email) : null,
      ].filter((v): v is string => Boolean(v));
      businessLines.forEach((v, i) => {
        doc.text(v, L, 58 + i * 12, { width: 300, lineBreak: false, ellipsis: true });
      });

      const metadata: [string, string][] = [
        ["Bill Date", formatDate(bill.billDate)],
        ["Due Date", bill.dueDate ? formatDate(bill.dueDate) : "Not recorded"],
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
        ["ITC Eligibility", bill.isItcEligible ? "Eligible" : "Ineligible"],
      ];
      if (!bill.isItcEligible && bill.itcIneligibilityReason) {
        metadata.push(["ITC Reason", bill.itcIneligibilityReason]);
      }
      metadata.forEach(([label, value], i) => {
        const y = META_TOP + i * META_STEP;
        doc.font(regularFont).fontSize(8).fillColor("#555555");
        doc.text(label, 300, y, { width: 100, lineBreak: false });
        doc.font(boldFont).fontSize(8).fillColor("#222222");
        doc.text(value, 402, y, { width: 153, lineBreak: false, ellipsis: true });
      });

      // Left: supplier details available in the vendor profile.
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
        bill.vendor.gstin ? `GSTIN ${bill.vendor.gstin}` : null,
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

    bill.items.forEach((item, index) => {
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
    bill.items.forEach((item) => {
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

    // Summary + balance box must fit ABOVE the pinned signature; otherwise move to a new page.
    // (The signature itself is not counted here, it is drawn at SIGN_Y on the last page.)
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

    // Balance Due box
    const boxTop = summaryY - 6;
    doc.rect(310, boxTop, R - 310, BOX_H).fillColor("#F4F3F1").fill();
    doc.font(boldFont).fontSize(9).fillColor("#111111");
    doc.text("Balance Due", 330, boxTop + 11, { width: 140, align: "right", lineBreak: false });
    doc.text(money(balance), 475, boxTop + 11, { width: 80, align: "right", lineBreak: false });

    // Footer: thin divider + signature, fixed at the bottom of the last page
    // line(L, SIGN_Y - 14, R, SIGN_Y - 14);
    doc.font(regularFont).fontSize(8).fillColor("#2463C7");
    doc.text("Authorized Signature", L, SIGN_Y, { lineBreak: false });
    line(L + 95, SIGN_Y + 8, L + 250, SIGN_Y + 8, "#333333");

    doc.end();
  } catch (error) {
    console.error("Purchase bill PDF generation error:", error);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: "Failed to generate purchase bill PDF." });
  }
});

// Expense tracking summary - computed inside the database instead of loading every bill into Node
router.get("/expenses-summary", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const taxFields = { totalCgst: true, totalSgst: true, totalIgst: true, totalCess: true } as const;

    const [all, eligible, blocked, byCategory] = await Promise.all([
      prisma.purchaseBill.aggregate({
        where: { businessId },
        _sum: { totalAmount: true, subtotal: true },
        _count: true,
      }),
      prisma.purchaseBill.aggregate({ where: { businessId, isItcEligible: true }, _sum: taxFields }),
      prisma.purchaseBill.aggregate({ where: { businessId, isItcEligible: false }, _sum: taxFields }),
      prisma.purchaseBill.groupBy({
        by: ["category"],
        where: { businessId },
        _sum: { totalAmount: true },
      }),
    ]);

    const sumTax = (s: {
      totalCgst: number | null;
      totalSgst: number | null;
      totalIgst: number | null;
      totalCess: number | null;
    }) => (s.totalCgst ?? 0) + (s.totalSgst ?? 0) + (s.totalIgst ?? 0) + (s.totalCess ?? 0);

    res.json({
      totalPurchases: all._sum.totalAmount ?? 0,
      totalTaxable: all._sum.subtotal ?? 0,
      totalEligibleItc: r2(sumTax(eligible._sum)),
      totalBlockedItc: r2(sumTax(blocked._sum)),
      categoryBreakdown: Object.fromEntries(byCategory.map((c) => [c.category, c._sum.totalAmount ?? 0])),
      billCount: all._count,
    });
  } catch (error: any) {
    console.error("Expense summary error:", error);
    res.status(500).json({ error: "Failed to fetch expense summary." });
  }
});

router.get("/itc-payment-risk", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const now = new Date();
    const threshold = new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000);
    const bills = await prisma.purchaseBill.findMany({
      where: {
        businessId,
        isItcEligible: true,
        isReverseCharge: false,
        status: { not: "PAID" },
        billDate: { lte: threshold },
      },
      include: { vendor: { select: { name: true } }, items: true },
      orderBy: { billDate: "asc" },
    });

    res.json(
      bills.map((bill) => {
        const daysOld = Math.floor((now.getTime() - bill.billDate.getTime()) / (24 * 60 * 60 * 1000));
        const balanceDue = r2(bill.totalAmount - bill.paidAmount);
        const eligibleItc = r2(
          bill.items.reduce(
            (sum, item) =>
              sum + (item.isItcEligible ? item.cgstAmount + item.sgstAmount + item.igstAmount + item.cessAmount : 0),
            0
          )
        );

        return {
          id: bill.id,
          billNumber: bill.billNumber,
          vendorName: bill.vendor.name,
          billDate: bill.billDate,
          daysOld,
          daysLeft: 180 - daysOld,
          balanceDue,
          itcAtRisk: bill.totalAmount > 0 ? r2(eligibleItc * (balanceDue / bill.totalAmount)) : 0,
          level: daysOld > 180 ? "REVERSE_NOW" : "WARNING",
        };
      })
    );
  } catch (error: any) {
    console.error("ITC payment risk error:", error);
    res.status(500).json({ error: "Failed to fetch ITC payment risks." });
  }
});

// Create purchase bill
router.post("/bills", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const business = await prisma.business.findUnique({ where: { id: businessId } });
    if (!business) return res.status(404).json({ error: "Business profile not found" });

    const {
      vendorId,
      billNumber,
      billDate,
      dueDate,
      receivedDate,
      placeOfSupply,
      category, // STOCK, RENT, UTILITIES, CAPITAL_GOODS, FREIGHT, PROFESSIONAL_SERVICES, OFFICE_SUPPLIES, IT_SERVICES, ADVERTISING, OTHER
      isReverseCharge,
      isItcEligible,
      itcIneligibilityReason,
      items, // array of items: { description, hsnSacCode, quantity, unit, rate, gstRate, isItcEligible }
    } = req.body;

    const cleanBillNumber = String(billNumber || "").trim();

    if (!vendorId || !cleanBillNumber || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Vendor, bill number, and at least one item are required." });
    }

    // Same item checks as sales invoices - never store negative / NaN / out-of-range values.
    for (const [i, it] of items.entries()) {
      const qty = Number(it.quantity ?? 1);
      const rate = Number(it.rate);
      const gst = Number(it.gstRate ?? 18);
      const cessRate = Number(it.cessRate ?? 0);
      const cessAmount = it.cessAmount === undefined ? null : Number(it.cessAmount);

      if (!(qty > 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity must be greater than 0.` });
      }
      if (!(rate > 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: amount must be greater than 0.` });
      }
      if (!(gst >= 0 && gst <= 40)) {
        return res.status(400).json({ error: `Item ${i + 1}: invalid GST rate.` });
      }
      if (!Number.isFinite(cessRate) || cessRate < 0 || cessRate > 100) {
        return res.status(400).json({ error: `Item ${i + 1}: invalid cess rate.` });
      }
      if (cessAmount !== null && (!Number.isFinite(cessAmount) || cessAmount < 0)) {
        return res.status(400).json({ error: `Item ${i + 1}: invalid cess amount.` });
      }
    }

    const parsedBillDate = billDate ? new Date(billDate) : new Date();
    if (isNaN(parsedBillDate.getTime())) {
      return res.status(400).json({ error: "Invalid bill date." });
    }
    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (dueDate && (!parsedDueDate || isNaN(parsedDueDate.getTime()) || parsedDueDate < parsedBillDate)) {
      return res.status(400).json({ error: "Invalid due date." });
    }

    // Vendor must belong to THIS business
    const vendor = await prisma.vendor.findFirst({ where: { id: String(vendorId), businessId } });
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });
    if (
      vendor.vendorType !== "REGISTERED" &&
      !isReverseCharge &&
      items.some((item: any) => Number(item.gstRate ?? 18) > 0)
    ) {
      return res.status(400).json({
        error: "An unregistered supplier should not charge GST. Use a 0% rate, or mark reverse charge when it legally applies.",
      });
    }

    const pos = placeOfSupply || vendor.stateCode || business.stateCode;
    const isIntraState = business.stateCode === pos;
    const supplyType = isIntraState ? "INTRA_STATE" : "INTER_STATE";

    // ITC can never be claimed on a bill from an unregistered (or non-regular) vendor.
    const vendorCanGiveItc = vendor.vendorType === "REGISTERED" && !!vendor.gstin;
    const requestedItc = isItcEligible !== undefined ? Boolean(isItcEligible) : true;
    const overallItcEligible = vendorCanGiveItc && requestedItc;

    let reason: string | null = null;
    if (!overallItcEligible) {
      reason = !vendorCanGiveItc
        ? "Unregistered vendor - no GST charged, ITC not available"
        : itcIneligibilityReason || "Blocked credit under Sec 17(5)";
    }

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;

    const formattedItems = items.map((item: any) => {
      const qty = Number(item.quantity ?? 1);
      const rate = Number(item.rate);
      const taxableVal = r2(qty * rate);
      const gstRate = Number(item.gstRate ?? 18);
      const cessRate = Number(item.cessRate ?? 0);
      const requestedCess = item.cessAmount === undefined ? null : Number(item.cessAmount);
      const itemItcEligible = overallItcEligible && (item.isItcEligible !== undefined ? Boolean(item.isItcEligible) : true);

      let cgst = 0, sgst = 0, igst = 0;
      if (isIntraState) {
        cgst = r2((taxableVal * (gstRate / 2)) / 100);
        sgst = r2((taxableVal * (gstRate / 2)) / 100);
      } else {
        igst = r2((taxableVal * gstRate) / 100);
      }

      const cess = requestedCess === null ? r2((taxableVal * cessRate) / 100) : r2(requestedCess);
      const storedCessRate = requestedCess === null ? cessRate : taxableVal > 0 ? r2((cess / taxableVal) * 100) : 0;
      const itemTotal = r2(taxableVal + cgst + sgst + igst + cess);

      subtotal += taxableVal;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      totalCess += cess;

      return {
        itemId: item.itemId || null,
        description: item.description || "Purchase Item / Expense",
        hsnSacCode: item.hsnSacCode || "998313",
        quantity: qty,
        unit: item.unit || "PCS",
        rate,
        taxableValue: taxableVal,
        gstRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        cessRate: storedCessRate,
        cessAmount: cess,
        isItcEligible: itemItcEligible,
        totalAmount: itemTotal,
      };
    });

    subtotal = r2(subtotal);
    totalCgst = r2(totalCgst);
    totalSgst = r2(totalSgst);
    totalIgst = r2(totalIgst);
    totalCess = r2(totalCess);

    const totalAmount = Math.round(subtotal + totalCgst + totalSgst + totalIgst + totalCess);

    const bill = await prisma.purchaseBill.create({
      data: {
        businessId,
        vendorId: String(vendorId),
        billNumber: cleanBillNumber,
        billDate: parsedBillDate,
        dueDate: parsedDueDate,
        receivedDate: receivedDate ? new Date(receivedDate) : null,
        supplyType,
        placeOfSupply: pos,
        category: category || "STOCK",
        isReverseCharge: Boolean(isReverseCharge),
        isItcEligible: overallItcEligible,
        itcIneligibilityReason: reason,
        status: "UNPAID",
        subtotal,
        totalCgst,
        totalSgst,
        totalIgst,
        totalCess,
        totalAmount,
        paidAmount: 0,
        items: {
          create: formattedItems,
        },
      },
      include: {
        vendor: true,
        items: true,
      },
    });

    res.json(bill);
  } catch (error: any) {
    // Unique constraint (businessId + vendorId + billNumber) violated
    if (error?.code === "P2002") {
      return res.status(409).json({
        error: "A bill with this number already exists for this vendor.",
      });
    }
    console.error("Create purchase bill error:", error);
    res.status(500).json({ error: "Failed to create purchase bill." });
  }
});

router.put("/bills/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business." });
    const existing = await prisma.purchaseBill.findFirst({
      where: { id: req.params.id as string, businessId },
      include: { payments: true },
    });
    if (!existing) return res.status(404).json({ error: "Purchase bill not found." });

    const {
      vendorId, billNumber, billDate, dueDate, category, isReverseCharge,
      isItcEligible, itcIneligibilityReason, items,
    } = req.body;
    const cleanBillNumber = String(billNumber || "").trim();
    if (!vendorId || !cleanBillNumber || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Vendor, bill number, and at least one item are required." });
    }
    if (typeof isReverseCharge !== "boolean") {
      return res.status(400).json({ error: "Reverse charge must be a boolean." });
    }
    if (typeof isItcEligible !== "boolean") {
      return res.status(400).json({ error: "ITC eligibility must be a boolean." });
    }
    for (const [index, item] of items.entries()) {
      const quantity = Number(item.quantity ?? 1);
      const rate = Number(item.rate);
      const gstRate = Number(item.gstRate ?? 18);
      const cessAmount = Number(item.cessAmount ?? 0);
      if (!(quantity > 0) || !(rate > 0) || !(gstRate >= 0 && gstRate <= 40) ||
          !Number.isFinite(cessAmount) || cessAmount < 0) {
        return res.status(400).json({ error: `Item ${index + 1}: enter a valid quantity, amount, GST rate, and cess amount.` });
      }
    }
    const parsedBillDate = new Date(billDate);
    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (Number.isNaN(parsedBillDate.getTime())) return res.status(400).json({ error: "Invalid bill date." });
    if (dueDate && (!parsedDueDate || Number.isNaN(parsedDueDate.getTime()) || parsedDueDate < parsedBillDate)) {
      return res.status(400).json({ error: "Invalid due date." });
    }
    const [vendor, business] = await Promise.all([
      prisma.vendor.findFirst({ where: { id: String(vendorId), businessId } }),
      prisma.business.findUnique({ where: { id: businessId } }),
    ]);
    if (!vendor) return res.status(404).json({ error: "Vendor not found." });
    if (!business) return res.status(404).json({ error: "Business profile not found." });
    if (vendor.vendorType !== "REGISTERED" && !isReverseCharge && items.some((item: any) => Number(item.gstRate ?? 18) > 0)) {
      return res.status(400).json({ error: "An unregistered supplier should not charge GST. Use a 0% rate, or mark reverse charge when it legally applies." });
    }

    const pos = vendor.stateCode || business.stateCode;
    const intraState = business.stateCode === pos;
    const vendorCanGiveItc = vendor.vendorType === "REGISTERED" && !!vendor.gstin;
    const eligible = vendorCanGiveItc && Boolean(isItcEligible);
    const reason = eligible ? null : !vendorCanGiveItc
      ? "Unregistered vendor - no GST charged, ITC not available"
      : String(itcIneligibilityReason || "Blocked credit under Sec 17(5)");
    let subtotal = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;
    const formattedItems = items.map((item: any) => {
      const quantity = Number(item.quantity ?? 1);
      const rate = Number(item.rate);
      const taxableValue = r2(quantity * rate);
      const gstRate = Number(item.gstRate ?? 18);
      const cessAmount = r2(Number(item.cessAmount ?? (taxableValue * Number(item.cessRate ?? 0)) / 100));
      const cgstAmount = intraState ? r2((taxableValue * gstRate) / 200) : 0;
      const sgstAmount = intraState ? cgstAmount : 0;
      const igstAmount = intraState ? 0 : r2((taxableValue * gstRate) / 100);
      subtotal += taxableValue;
      totalCgst += cgstAmount;
      totalSgst += sgstAmount;
      totalIgst += igstAmount;
      totalCess += cessAmount;
      return {
        itemId: item.itemId || null,
        description: String(item.description || "Purchase Item / Expense"),
        hsnSacCode: item.hsnSacCode || "998313",
        quantity,
        unit: item.unit || "PCS",
        rate,
        taxableValue,
        gstRate,
        cgstAmount,
        sgstAmount,
        igstAmount,
        cessRate: taxableValue > 0 ? r2((cessAmount / taxableValue) * 100) : 0,
        cessAmount,
        isItcEligible: eligible && (item.isItcEligible === undefined || Boolean(item.isItcEligible)),
        totalAmount: r2(taxableValue + cgstAmount + sgstAmount + igstAmount + cessAmount),
      };
    });
    subtotal = r2(subtotal);
    totalCgst = r2(totalCgst);
    totalSgst = r2(totalSgst);
    totalIgst = r2(totalIgst);
    totalCess = r2(totalCess);
    const totalAmount = Math.round(subtotal + totalCgst + totalSgst + totalIgst + totalCess);
    if (totalAmount < existing.paidAmount - 0.01) {
      return res.status(400).json({ error: "Updated total cannot be lower than the payments already recorded." });
    }
    const status = existing.paidAmount <= 0 ? "UNPAID" : existing.paidAmount >= totalAmount - 0.01 ? "PAID" : "PARTIAL";
    const bill = await prisma.purchaseBill.update({
      where: { id: existing.id },
      data: {
        vendorId: String(vendorId),
        billNumber: cleanBillNumber,
        billDate: parsedBillDate,
        dueDate: parsedDueDate,
        category: category || "STOCK",
        isReverseCharge,
        isItcEligible: eligible,
        itcIneligibilityReason: reason,
        supplyType: intraState ? "INTRA_STATE" : "INTER_STATE",
        placeOfSupply: pos,
        subtotal,
        totalCgst,
        totalSgst,
        totalIgst,
        totalCess,
        totalAmount,
        status,
        items: { deleteMany: {}, create: formattedItems },
      },
      include: { vendor: true, items: true, payments: true },
    });
    res.json(bill);
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(409).json({ error: "A bill with this number already exists for this vendor." });
    console.error("Update purchase bill error:", error);
    res.status(500).json({ error: "Failed to update purchase bill." });
  }
});

router.post("/bills/:id/payments", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const billId = req.params.id as string;
    const { amount, paymentDate, mode, reference, notes } = req.body;
    const paymentAmount = r2(Number(amount));
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      return res.status(400).json({ error: "Payment amount must be greater than 0." });
    }

    const paymentMode = mode ?? "UPI";
    if (!["UPI", "BANK", "CHEQUE", "CASH"].includes(paymentMode)) {
      return res.status(400).json({ error: "Invalid payment mode." });
    }

    const parsedPaymentDate = paymentDate ? new Date(paymentDate) : new Date();
    if (
      isNaN(parsedPaymentDate.getTime()) ||
      parsedPaymentDate.getTime() > Date.now() + 24 * 60 * 60 * 1000
    ) {
      return res.status(400).json({ error: "Invalid payment date." });
    }

    const updatedBill = await prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.findFirst({ where: { id: billId, businessId } });
      if (!bill) return null;

      const balanceDue = r2(bill.totalAmount - bill.paidAmount);
      if (paymentAmount > balanceDue + 0.01) {
        throw new Error("Payment amount cannot exceed the balance due.");
      }

      await tx.purchasePayment.create({
        data: {
          purchaseBillId: billId,
          amount: paymentAmount,
          paymentDate: parsedPaymentDate,
          mode: paymentMode,
          reference: reference ? String(reference) : null,
          notes: notes ? String(notes) : null,
        },
      });
      return syncBillPayment(tx, billId);
    });

    if (!updatedBill) return res.status(404).json({ error: "Purchase bill not found." });
    res.json(updatedBill);
  } catch (error: any) {
    if (error instanceof Error && error.message === "Payment amount cannot exceed the balance due.") {
      return res.status(400).json({ error: error.message });
    }
    console.error("Record purchase bill payment error:", error);
    res.status(500).json({ error: "Failed to record purchase bill payment." });
  }
});

router.delete("/bills/:id/payments/:paymentId", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
    const billId = req.params.id as string;
    const paymentId = req.params.paymentId as string;

    const updatedBill = await prisma.$transaction(async (tx) => {
      const payment = await tx.purchasePayment.findFirst({
        where: {
          id: paymentId,
          purchaseBillId: billId,
          purchaseBill: { businessId },
        },
      });
      if (!payment) return null;

      await tx.purchasePayment.delete({ where: { id: paymentId } });
      return syncBillPayment(tx, billId);
    });

    if (!updatedBill) return res.status(404).json({ error: "Payment not found." });
    res.json(updatedBill);
  } catch (error: any) {
    console.error("Delete purchase bill payment error:", error);
    res.status(500).json({ error: "Failed to delete purchase bill payment." });
  }
});

export default router;