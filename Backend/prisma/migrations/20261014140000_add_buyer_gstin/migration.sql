-- AlterTable
ALTER TABLE "SalesInvoice" ADD COLUMN "buyerGstin" TEXT;

-- Backfill existing rows: set SalesInvoice.buyerGstin = Customer.gstin for existing invoices
UPDATE "SalesInvoice" si
SET "buyerGstin" = c."gstin"
FROM "Customer" c
WHERE si."customerId" = c."id"
  AND c."gstin" IS NOT NULL
  AND si."buyerGstin" IS NULL;

