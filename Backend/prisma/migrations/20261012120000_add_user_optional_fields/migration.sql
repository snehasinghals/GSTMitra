-- AlterTable
ALTER TABLE "User" ADD COLUMN "mitraId" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "pan" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_mitraId_key" ON "User"("mitraId");

