CREATE INDEX "SalesInvoice_businessId_invoiceDate_idx"
ON "SalesInvoice"("businessId", "invoiceDate");

CREATE INDEX "PurchaseBill_businessId_billDate_idx"
ON "PurchaseBill"("businessId", "billDate");
