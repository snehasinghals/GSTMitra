import { Router, Response } from "express";
import { prisma } from "../lib/db";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { validateGstin, INDIAN_STATES } from "../lib/constants";

const router = Router();

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
