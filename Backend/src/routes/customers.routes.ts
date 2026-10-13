import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validateGstin, INDIAN_STATES } from "../lib/constants.js";
import { r2 } from "../lib/money.js";

const router = Router();

async function attachCustomerStats(
  businessId: string,
  customers: Array<{ id: string; name: string; phone: string | null; gstin: string | null; stateCode: string }>
) {
  if (customers.length === 0) return [];

  const customerIds = customers.map((c) => c.id);
  const stats = await prisma.salesInvoice.groupBy({
    by: ["customerId"],
    where: {
      businessId,
      customerId: { in: customerIds },
      status: { not: "CANCELLED" },
    },
    _max: {
      invoiceDate: true,
    },
    _sum: {
      totalAmount: true,
      paidAmount: true,
    },
  });

  const statsMap = new Map<string, { lastBilledAt: Date | null; pendingAmount: number }>();
  for (const s of stats) {
    const total = s._sum.totalAmount ?? 0;
    const paid = s._sum.paidAmount ?? 0;
    statsMap.set(s.customerId, {
      lastBilledAt: s._max.invoiceDate ?? null,
      pendingAmount: r2(Math.max(0, total - paid)),
    });
  }

  return customers.map((c) => {
    const st = statsMap.get(c.id);
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      gstin: c.gstin,
      stateCode: c.stateCode,
      lastBilledAt: st?.lastBilledAt ?? null,
      pendingAmount: st?.pendingAmount ?? 0,
    };
  });
}

// List customers
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const customers = await prisma.customer.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });

    res.json(customers);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch customers." });
  }
});

// Search customers by name, phone, or GSTIN
router.get("/search", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.json([]);
    }

    const matched = await prisma.customer.findMany({
      where: {
        businessId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { phone: { contains: q, mode: "insensitive" } },
          { gstin: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gstin: true,
        stateCode: true,
      },
      take: 50,
    });

    const withStats = await attachCustomerStats(businessId, matched);

    const qLower = q.toLowerCase();
    withStats.sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(qLower);
      const bStarts = b.name.toLowerCase().startsWith(qLower);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      const aTime = a.lastBilledAt ? new Date(a.lastBilledAt).getTime() : 0;
      const bTime = b.lastBilledAt ? new Date(b.lastBilledAt).getTime() : 0;
      if (bTime !== aTime) return bTime - aTime;

      return a.name.localeCompare(b.name);
    });

    res.json(withStats.slice(0, 8));
  } catch (error: any) {
    console.error("Customer search error:", error);
    res.status(500).json({ error: "Failed to search customers." });
  }
});

// Recently billed customers
router.get("/recent", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);

    const recentInvoices = await prisma.salesInvoice.findMany({
      where: {
        businessId,
        status: { not: "CANCELLED" },
      },
      orderBy: { invoiceDate: "desc" },
      distinct: ["customerId"],
      select: { customerId: true },
      take: limit,
    });

    if (recentInvoices.length === 0) {
      return res.json([]);
    }

    const customerIds = recentInvoices.map((inv) => inv.customerId);

    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        businessId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gstin: true,
        stateCode: true,
      },
    });

    const withStats = await attachCustomerStats(businessId, customers);

    const orderMap = new Map(customerIds.map((id, index) => [id, index]));
    withStats.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));

    res.json(withStats);
  } catch (error: any) {
    console.error("Recent customers error:", error);
    res.status(500).json({ error: "Failed to fetch recent customers." });
  }
});

// Quick create customer
router.post("/quick", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { name, phone, gstin } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Customer name is required." });
    }

    const cleanGstin = gstin && String(gstin).trim() ? String(gstin).trim().toUpperCase() : null;

    if (cleanGstin) {
      const existing = await prisma.customer.findFirst({
        where: { businessId, gstin: cleanGstin },
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
          stateCode: true,
        },
      });

      if (existing) {
        const withStats = await attachCustomerStats(businessId, [existing]);
        return res.json(withStats[0]);
      }
    }

    let finalStateCode = "";
    let finalRegType = "UNREGISTERED";

    if (cleanGstin) {
      const gstinVal = validateGstin(cleanGstin);
      if (!gstinVal.isValid) {
        return res.status(400).json({ error: gstinVal.message });
      }
      finalRegType = "REGULAR";
      finalStateCode = gstinVal.stateCode || cleanGstin.substring(0, 2);
    }

    if (!finalStateCode) {
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { stateCode: true },
      });
      finalStateCode = business?.stateCode || "27";
    }

    const stateName = INDIAN_STATES.find((s) => s.code === finalStateCode)?.name || "Maharashtra";

    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: String(name).trim(),
        tradeName: null,
        gstin: cleanGstin,
        stateCode: finalStateCode,
        stateName,
        registrationType: finalRegType,
        email: null,
        phone: phone && String(phone).trim() ? String(phone).trim() : null,
        address: null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        gstin: true,
        stateCode: true,
      },
    });

    res.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      gstin: customer.gstin,
      stateCode: customer.stateCode,
      lastBilledAt: null,
      pendingAmount: 0,
    });
  } catch (error: any) {
    console.error("Quick create customer error:", error);
    res.status(500).json({ error: "Failed to create customer." });
  }
});

// Create customer
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const { name, tradeName, gstin, stateCode, registrationType, email, phone, address } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Customer name is required." });
    }

    let finalStateCode = stateCode || "27";
    let finalRegType = registrationType || "UNREGISTERED";

    if (gstin && String(gstin).trim() !== "") {
      const gstinVal = validateGstin(String(gstin));
      if (!gstinVal.isValid) {
        return res.status(400).json({ error: gstinVal.message });
      }
      finalRegType = "REGULAR";
      if (gstinVal.stateCode) {
        finalStateCode = gstinVal.stateCode;
      }
    }

    const stateName = INDIAN_STATES.find((s) => s.code === finalStateCode)?.name || "Maharashtra";

    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: String(name).trim(),
        tradeName: tradeName ? String(tradeName).trim() : null,
        gstin: gstin ? String(gstin).trim().toUpperCase() : null,
        stateCode: String(finalStateCode),
        stateName,
        registrationType: String(finalRegType),
        email: email ? String(email).trim() : null,
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
      },
    });

    res.json(customer);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create customer." });
  }
});

// Update customer
router.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const existing = await prisma.customer.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Customer not found." });

    const { name, tradeName, gstin, stateCode, registrationType, email, phone, address } = req.body;

    let finalStateCode = stateCode ? String(stateCode) : existing.stateCode;
    let finalRegType = registrationType ? String(registrationType) : existing.registrationType;

    if (gstin && String(gstin).trim() !== "") {
      const gstinVal = validateGstin(String(gstin));
      if (!gstinVal.isValid) {
        return res.status(400).json({ error: gstinVal.message });
      }
      finalRegType = "REGULAR";
      if (gstinVal.stateCode) finalStateCode = gstinVal.stateCode;
    }

    const stateName = INDIAN_STATES.find((s) => s.code === finalStateCode)?.name || existing.stateName;

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        name: name ? String(name).trim() : undefined,
        tradeName: tradeName !== undefined ? (tradeName ? String(tradeName).trim() : null) : undefined,
        gstin: gstin !== undefined ? (gstin ? String(gstin).trim().toUpperCase() : null) : undefined,
        stateCode: finalStateCode,
        stateName,
        registrationType: finalRegType,
        email: email !== undefined ? (email ? String(email).trim() : null) : undefined,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : undefined,
        address: address !== undefined ? (address ? String(address).trim() : null) : undefined,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update customer." });
  }
});

// Delete customer
router.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const existing = await prisma.customer.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Customer not found." });

    await prisma.customer.delete({ where: { id } });
    res.json({ message: "Customer deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete customer." });
  }
});

export default router;
