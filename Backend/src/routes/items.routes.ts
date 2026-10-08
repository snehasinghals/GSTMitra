import { Router, Response } from "express";
import { prisma } from "../lib/db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { COMMON_HSN_CODES } from "../lib/constants";

const router = Router();

// HSN Code search by item name or code
router.get("/hsn-search", authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const query = ((req.query.q as string) || "").trim().toLowerCase();
  if (!query) {
    return res.json(COMMON_HSN_CODES);
  }

  const results = COMMON_HSN_CODES.filter(
    (item) => item.code.includes(query) || item.description.toLowerCase().includes(query)
  );

  res.json(results);
});

// List all items for active business
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const items = await prisma.item.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });

    res.json(items);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch items." });
  }
});

// Create item
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const {
      name,
      description,
      type,
      hsnSacCode,
      unit,
      sellingPrice,
      purchasePrice,
      isTaxInclusive,
      gstRate,
      cessRate,
    } = req.body;

    if (!name || sellingPrice === undefined || !hsnSacCode) {
      return res.status(400).json({ error: "Item name, selling price, and HSN/SAC code are required." });
    }

    const item = await prisma.item.create({
      data: {
        businessId,
        name: String(name).trim(),
        description: description ? String(description) : null,
        type: type ? String(type) : "GOODS",
        hsnSacCode: String(hsnSacCode).trim(),
        unit: unit ? String(unit) : "PCS",
        sellingPrice: Number(sellingPrice),
        purchasePrice: Number(purchasePrice || 0),
        isTaxInclusive: Boolean(isTaxInclusive),
        gstRate: Number(gstRate !== undefined ? gstRate : 18.0),
        cessRate: Number(cessRate || 0.0),
      },
    });

    res.json(item);
  } catch (error: any) {
    console.error("Create item error:", error);
    res.status(500).json({ error: "Failed to create item." });
  }
});

// Update item
router.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const existing = await prisma.item.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Item not found." });

    const {
      name,
      description,
      type,
      hsnSacCode,
      unit,
      sellingPrice,
      purchasePrice,
      isTaxInclusive,
      gstRate,
      cessRate,
    } = req.body;

    const updated = await prisma.item.update({
      where: { id },
      data: {
        name: name ? String(name).trim() : undefined,
        description: description !== undefined ? (description ? String(description) : null) : undefined,
        type: type ? String(type) : undefined,
        hsnSacCode: hsnSacCode ? String(hsnSacCode).trim() : undefined,
        unit: unit ? String(unit) : undefined,
        sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : undefined,
        purchasePrice: purchasePrice !== undefined ? Number(purchasePrice) : undefined,
        isTaxInclusive: isTaxInclusive !== undefined ? Boolean(isTaxInclusive) : undefined,
        gstRate: gstRate !== undefined ? Number(gstRate) : undefined,
        cessRate: cessRate !== undefined ? Number(cessRate) : undefined,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update item." });
  }
});

// Delete item
router.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const existing = await prisma.item.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Item not found." });

    await prisma.item.delete({ where: { id } });
    res.json({ message: "Item deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete item." });
  }
});

export default router;
