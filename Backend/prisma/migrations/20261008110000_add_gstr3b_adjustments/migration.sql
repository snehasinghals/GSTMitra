CREATE TABLE "Gstr3bAdjustment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "valuesJson" TEXT NOT NULL DEFAULT '{}',
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gstr3bAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Gstr3bAdjustment_businessId_period_key" ON "Gstr3bAdjustment"("businessId", "period");

ALTER TABLE "Gstr3bAdjustment"
ADD CONSTRAINT "Gstr3bAdjustment_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
