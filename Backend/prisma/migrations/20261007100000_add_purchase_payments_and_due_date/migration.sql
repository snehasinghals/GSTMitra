-- AlterTable
ALTER TABLE "PurchaseBill" ADD COLUMN "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PurchasePayment" (
    "id" TEXT NOT NULL,
    "purchaseBillId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'UPI',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchasePayment_purchaseBillId_idx" ON "PurchasePayment"("purchaseBillId");

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
