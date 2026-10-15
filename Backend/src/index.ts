import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from root directory if running via ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

import express from "express";
import cors from "cors";

// Import all API routes
import authRoutes from "./routes/auth.routes.js";
import itemsRoutes from "./routes/items.routes.js";
import customersRoutes from "./routes/customers.routes.js";
import vendorsRoutes from "./routes/vendors.routes.js";
import salesRoutes from "./routes/sales.routes.js";
import purchasesRoutes from "./routes/purchases.routes.js";
import rulesRoutes from "./routes/rules.routes.js";
import healthCheckRoutes from "./routes/health-check.routes.js";
import filingRoutes from "./routes/filing.routes.js";
import hsnRoutes from "./routes/hsn.routes.js";
import myBillsRoutes from "./routes/my-bills.routes.js";

import { authMiddleware, requireShop } from "./middleware/auth.js";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve uploaded files (bill PDFs, purchase attachments, etc.)
app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

// Health check (public)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Allowed routes (available for all users / public)
app.use("/api/auth", authRoutes);
app.use("/api/rules", rulesRoutes);

// Customer personal bills (available to any authenticated user, shop not required)
app.use("/api/my-bills", authMiddleware, myBillsRoutes);

// Shop-only route groups (protected by authMiddleware and requireShop)
app.use("/api/items", authMiddleware, requireShop, itemsRoutes);
app.use("/api/customers", authMiddleware, requireShop, customersRoutes);
app.use("/api/vendors", authMiddleware, requireShop, vendorsRoutes);
app.use("/api/sales", authMiddleware, requireShop, salesRoutes);
app.use("/api/purchases", authMiddleware, requireShop, purchasesRoutes);
app.use("/api/health-check", authMiddleware, requireShop, healthCheckRoutes);
app.use("/api/filing", authMiddleware, requireShop, filingRoutes);
app.use("/api/hsn", authMiddleware, requireShop, hsnRoutes);

// Catch-all 404 handler for API routes (returns JSON, not HTML)
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API endpoint not found." });
});

// Global error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Global API Error:", err);
  res.status(500).json({ error: err?.message || "Internal server error." });
});

import { warmupDatabase } from "./lib/db.js";

if (!process.env.VERCEL) {
  const port = process.env.PORT ?? 4000;
  app.listen(port, async () => {
    console.log(`GSTMitra Backend running on http://localhost:${port}`);
    await warmupDatabase();
  });
}

export default app;