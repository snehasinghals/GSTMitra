import { Router, Response } from "express";
import { prisma } from "../lib/db.js";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth.js";
import { validateGstin, INDIAN_STATES } from "../lib/constants.js";

const router = Router();

// List vendors
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });

    const vendors = await prisma.vendor.findMany({
      where: { businessId },
      orderBy: { name: "asc" },
    });

    res.json(vendors);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to fetch vendors." });
  }
});

// Create vendor
 
const STATE_NAMES: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
  "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
  "34": "Puducherry", "35": "Andaman and Nicobar Islands", "36": "Telangana",
  "37": "Andhra Pradesh", "38": "Ladakh",
};
 
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return res.status(400).json({ error: "No active business" });
 
    const name = String(req.body.name || "").trim();
    // Empty string -> null, so unregistered vendors don't collide on the unique GSTIN
    const gstin = String(req.body.gstin || "").trim().toUpperCase() || null;
 
    if (!name) return res.status(400).json({ error: "Vendor name is required." });
 
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      return res.status(400).json({ error: "Invalid GSTIN format." });
    }
 
    const stateCode = gstin ? gstin.substring(0, 2) : String(req.body.stateCode || "27");
    const stateName = STATE_NAMES[stateCode] || "Unknown";
    // Match whatever values your app already uses for vendorType
    const vendorType = gstin ? "REGISTERED" : "UNREGISTERED";
 
    // Friendly pre-check for unregistered vendors (GSTIN duplicates are caught by the DB constraint)
    if (!gstin) {
      const existing = await prisma.vendor.findFirst({
        where: { businessId, gstin: null, name: { equals: name, mode: "insensitive" } },
      });
      if (existing) return res.status(409).json({ error: "This vendor already exists." });
    }
 
    const vendor = await prisma.vendor.create({
      data: { businessId, name, gstin, stateCode, stateName, vendorType },
    });
 
    res.json(vendor);
  } catch (error: any) {
    if (error?.code === "P2002") {
      return res.status(409).json({ error: "A vendor with this GSTIN already exists." });
    }
    console.error("Create vendor error:", error);
    res.status(500).json({ error: "Failed to create vendor." });
  }
});
 
// Update vendor
router.put("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const existing = await prisma.vendor.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Vendor not found." });

    const { name, tradeName, gstin, stateCode, vendorType, email, phone, address } = req.body;

    let finalStateCode = stateCode ? String(stateCode) : existing.stateCode;
    let finalVendorType = vendorType ? String(vendorType) : existing.vendorType;

    if (gstin && String(gstin).trim() !== "") {
      const gstinVal = validateGstin(String(gstin));
      if (!gstinVal.isValid) {
        return res.status(400).json({ error: gstinVal.message });
      }
      finalVendorType = "REGISTERED";
      if (gstinVal.stateCode) finalStateCode = gstinVal.stateCode;
    }

    const stateName = INDIAN_STATES.find((s) => s.code === finalStateCode)?.name || existing.stateName;

    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        name: name ? String(name).trim() : undefined,
        tradeName: tradeName !== undefined ? (tradeName ? String(tradeName).trim() : null) : undefined,
        gstin: gstin !== undefined ? (gstin ? String(gstin).trim().toUpperCase() : null) : undefined,
        stateCode: finalStateCode,
        stateName,
        vendorType: finalVendorType,
        email: email !== undefined ? (email ? String(email).trim() : null) : undefined,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : undefined,
        address: address !== undefined ? (address ? String(address).trim() : null) : undefined,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update vendor." });
  }
});

// Delete vendor
router.delete("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const businessId = req.user?.businessId;
    const id = req.params.id as string;

    const existing = await prisma.vendor.findFirst({ where: { id, businessId } });
    if (!existing) return res.status(404).json({ error: "Vendor not found." });

    await prisma.vendor.delete({ where: { id } });
    res.json({ message: "Vendor deleted successfully." });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete vendor." });
  }
});

export default router;
