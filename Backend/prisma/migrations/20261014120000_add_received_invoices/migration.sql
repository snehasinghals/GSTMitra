ALTER TABLE "Customer"
ADD COLUMN "mitraId" TEXT;

CREATE UNIQUE INDEX "Customer_businessId_mitraId_key"
ON "Customer"("businessId", "mitraId");

ALTER TABLE "PurchaseBill"
ADD COLUMN "sourceSalesInvoiceId" TEXT,
ADD COLUMN "receiptStatus" TEXT NOT NULL DEFAULT 'ACCEPTED';

CREATE UNIQUE INDEX "PurchaseBill_sourceSalesInvoiceId_key"
ON "PurchaseBill"("sourceSalesInvoiceId");

ALTER TABLE "PurchaseBill"
ADD CONSTRAINT "PurchaseBill_sourceSalesInvoiceId_fkey"
FOREIGN KEY ("sourceSalesInvoiceId") REFERENCES "SalesInvoice"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
