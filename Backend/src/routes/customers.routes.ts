import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validateGstin, INDIAN_STATES } from "../lib/constants.js";
import { r2 } from "../lib/money.js";

const router = Router();

type CustomerBase = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  stateCode: string;
  address: string | null;
  mitraId: string | null;
};
async function attachCustomerStats(
  businessId: string,
  customers: CustomerBase[]
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

  // Fetch linked user profiles by mitraId, phone, or email to populate missing emails & PANs
  const mitraIds = customers.map((c) => c.mitraId).filter(Boolean) as string[];
  const phones = customers.map((c) => c.phone).filter(Boolean) as string[];
  const emails = customers.map((c) => c.email).filter(Boolean) as string[];

  const userConditions: any[] = [];
  if (mitraIds.length > 0) userConditions.push({ mitraId: { in: mitraIds } });
  if (phones.length > 0) userConditions.push({ phone: { in: phones } });
  if (emails.length > 0) userConditions.push({ email: { in: emails } });

  let matchedUsers: Array<{
    id: string;
    email: string;
    phone: string | null;
    mitraId: string | null;
    pan: string | null;
    address: string | null;
  }> = [];

  if (userConditions.length > 0) {
    matchedUsers = await prisma.user.findMany({
      where: { OR: userConditions },
      select: {
        id: true,
        email: true,
        phone: true,
        mitraId: true,
        pan: true,
        address: true,
      },
    });
  }

  return customers.map((c) => {
    const st = statsMap.get(c.id);
    const u = matchedUsers.find(
      (usr) =>
        (c.mitraId && usr.mitraId?.toLowerCase() === c.mitraId.toLowerCase()) ||
        (c.phone && usr.phone === c.phone) ||
        (c.email && usr.email?.toLowerCase() === c.email.toLowerCase())
    );

    return {
      id: c.id,
      name: c.name,
      phone: c.phone || u?.phone || null,
      email: c.email || u?.email || null,
      gstin: c.gstin,
      stateCode: c.stateCode,
      address: c.address || u?.address || null,
      mitraId: c.mitraId || u?.mitraId || null,
      pan: u?.pan || null,
      lastBilledAt: st?.lastBilledAt ?? null,
      pendingAmount: st?.pendingAmount ?? 0,
    };
  });
}

// Live suggestions while typing a Mitra ID
router.get("/mitra-suggest", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q.length < 3) return res.json([]);

    const users = await prisma.user.findMany({
      where: { mitraId: { startsWith: q, mode: "insensitive" } },
      select: { name: true, mitraId: true },
      orderBy: { mitraId: "asc" },
      take: 5,
    });

    res.json(users.filter((u) => u.mitraId));
  } catch (error) {
    console.error("Mitra suggest error:", error);
    res.status(500).json({ error: "Failed to fetch suggestions." });
  }
});

// Lookup User or Customer by Mitra ID (or phone/email)
router.get("/lookup-mitra", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rawId = String(req.query.id || req.query.mitraId || "").trim();
    if (!rawId) {
      return res.status(400).json({ error: "Mitra ID is required" });
    }

    const cleanId = rawId.toLowerCase();

    // 1. First look up in User table by mitraId, phone or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { mitraId: cleanId },
          { phone: rawId },
          { email: cleanId },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        mitraId: true,
        email: true,
        address: true,
        pan: true,
      },
    });

    if (user) {
      let linkedCustomer = user.mitraId && req.user?.businessId
        ? await prisma.customer.findFirst({
            where: { businessId: req.user.businessId, mitraId: user.mitraId },
            select: { id: true },
          })
        : null;
      if (!linkedCustomer && user.mitraId && user.phone && req.user?.businessId) {
        const existingCustomer = await prisma.customer.findFirst({
          where: { businessId: req.user.businessId, phone: user.phone, mitraId: null },
          select: { id: true },
        });
        if (existingCustomer) {
          linkedCustomer = await prisma.customer.update({
            where: { id: existingCustomer.id },
            data: { mitraId: user.mitraId },
            select: { id: true },
          });
        }
      }
      // Collect gstins from user's businesses where gstin is not null
      const userBusinesses = await prisma.businessUser.findMany({
        where: { userId: user.id },
        include: {
          business: {
            select: { name: true, tradeName: true, gstin: true },
          },
        },
      });

      const gstinsList: Array<{ shopName: string; gstin: string }> = [];
      const seenGstins = new Set<string>();

      for (const ub of userBusinesses) {
        const b = ub.business;
        if (b.gstin && b.gstin.trim()) {
          const clean = b.gstin.trim().toUpperCase();
          if (!seenGstins.has(clean)) {
            seenGstins.add(clean);
            gstinsList.push({
              shopName: b.tradeName || b.name || "Business",
              gstin: clean,
            });
          }
        }
      }

      // Also include existing Customer.gstin if present and not already added
      if (linkedCustomer && req.user?.businessId) {
        const fullCustomer = await prisma.customer.findUnique({
          where: { id: linkedCustomer.id },
          select: { gstin: true, name: true },
        });
        if (fullCustomer?.gstin && fullCustomer.gstin.trim()) {
          const clean = fullCustomer.gstin.trim().toUpperCase();
          if (!seenGstins.has(clean)) {
            seenGstins.add(clean);
            gstinsList.push({
              shopName: fullCustomer.name,
              gstin: clean,
            });
          }
        }
      }

      return res.json({
        found: true,
        source: "USER",
        name: user.name,
        phone: user.phone || "",
        email: user.email || "",
        mitraId: user.mitraId,
        address: user.address || "",
        pan: user.pan || "",
        gstin: "",
        gstins: gstinsList,
        customerId: linkedCustomer?.id || null,
      });
    }

    // 2. Also check if business has existing customer with matching phone
    const businessId = req.user?.businessId;
    if (businessId) {
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          businessId,
          phone: rawId,
        },
      });

      if (existingCustomer) {
        // Look up linked User profile to retrieve their registered PAN and email
        const linkedUser = await prisma.user.findFirst({
          where: {
            OR: [
              ...(existingCustomer.phone ? [{ phone: existingCustomer.phone }] : []),
              ...(existingCustomer.mitraId ? [{ mitraId: existingCustomer.mitraId }] : []),
              ...(existingCustomer.email ? [{ email: existingCustomer.email }] : []),
            ],
          },
          select: { pan: true, email: true, address: true, mitraId: true },
        });

        const gstinsList: Array<{ shopName: string; gstin: string }> = [];
        if (existingCustomer.gstin && existingCustomer.gstin.trim()) {
          gstinsList.push({
            shopName: existingCustomer.tradeName || existingCustomer.name,
            gstin: existingCustomer.gstin.trim().toUpperCase(),
          });
        }

        return res.json({
          found: true,
          source: "CUSTOMER",
          name: existingCustomer.name,
          phone: existingCustomer.phone || "",
          email: existingCustomer.email || linkedUser?.email || "",
          mitraId: existingCustomer.mitraId || linkedUser?.mitraId || null,
          address: existingCustomer.address || linkedUser?.address || "",
          pan: linkedUser?.pan || "",
          gstin: existingCustomer.gstin || "",
          gstins: gstinsList,
          customerId: existingCustomer.id,
        });
      }
    }

    return res.status(404).json({ found: false, message: "No account found with this Mitra ID" });
  } catch (error: any) {
    console.error("Mitra lookup error:", error);
    res.status(500).json({ error: "Failed to look up Mitra ID" });
  }
});

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
        email: true,
        gstin: true,
        stateCode: true,
        address: true,
        mitraId: true,
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
        email: true,
        gstin: true,
        stateCode: true,
        address: true,
        mitraId: true,
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

    const { name, phone, gstin, address, mitraId, email } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Customer name is required." });
    }

    const cleanGstin = gstin && String(gstin).trim() ? String(gstin).trim().toUpperCase() : null;
    const cleanMitraId = mitraId && String(mitraId).trim() ? String(mitraId).trim().toLowerCase() : null;
    const cleanEmail = email && String(email).trim() ? String(email).trim() : null;
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Enter a valid customer email address." });
    }

    if (cleanMitraId && !/^[a-z0-9._-]+@[a-z0-9._-]+$/i.test(cleanMitraId)) {
      return res.status(400).json({ error: "Invalid Mitra ID." });
    }

    if (cleanMitraId) {
      const linkedUser = await prisma.user.findUnique({
        where: { mitraId: cleanMitraId },
        select: { id: true },
      });
      if (!linkedUser) {
        return res.status(404).json({ error: "No GSTMitra account found for this Mitra ID." });
      }

      const linkedCustomer = await prisma.customer.findFirst({
        where: { businessId, mitraId: cleanMitraId },
        select: { id: true, name: true, phone: true, email: true, gstin: true, stateCode: true, address: true, mitraId: true },
      });
      if (linkedCustomer) {
        const customer = cleanEmail
          ? await prisma.customer.update({
              where: { id: linkedCustomer.id },
              data: { email: cleanEmail },
              select: { id: true, name: true, phone: true, email: true, gstin: true, stateCode: true, address: true, mitraId: true },
            })
          : linkedCustomer;
        const withStats = await attachCustomerStats(businessId, [customer]);
        return res.json(withStats[0]);
      }
    }

    if (cleanGstin) {
      const existing = await prisma.customer.findFirst({
        where: { businessId, gstin: cleanGstin },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          gstin: true,
          stateCode: true,
          address: true,
          mitraId: true,
        },
      });

      if (existing) {
        if (cleanMitraId && existing.mitraId && existing.mitraId !== cleanMitraId) {
          return res.status(409).json({ error: "This customer is already linked to a different Mitra account." });
        }
        const updated = (cleanMitraId && !existing.mitraId) || cleanEmail
          ? await prisma.customer.update({
              where: { id: existing.id },
              data: {
                mitraId: cleanMitraId && !existing.mitraId ? cleanMitraId : undefined,
                email: cleanEmail || undefined,
              },
              select: { id: true, name: true, phone: true, email: true, gstin: true, stateCode: true, address: true, mitraId: true },
            })
          : existing;
        const withStats = await attachCustomerStats(businessId, [updated]);
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
        mitraId: cleanMitraId,
        tradeName: null,
        gstin: cleanGstin,
        stateCode: finalStateCode,
        stateName,
        registrationType: finalRegType,
        email: cleanEmail,
        phone: phone && String(phone).trim() ? String(phone).trim() : null,
        address: address && String(address).trim() ? String(address).trim() : null,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        gstin: true,
        stateCode: true,
        address: true,
        mitraId: true,
      },
    });

    res.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      gstin: customer.gstin,
      stateCode: customer.stateCode,
      address: customer.address,
      mitraId: customer.mitraId,
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

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: "Enter a valid customer email address." });
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
    if (email !== undefined && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: "Enter a valid customer email address." });
    }

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
