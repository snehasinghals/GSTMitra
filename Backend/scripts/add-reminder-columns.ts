import { prisma } from "../src/lib/db.js";

async function main() {
  console.log("Adding reminder columns if not present...");
  await prisma.$executeRawUnsafe(`ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS "reminderCount" INTEGER NOT NULL DEFAULT 0;`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "lastReminderSentAt" TIMESTAMP(3);`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "reminderCount" INTEGER NOT NULL DEFAULT 0;`);
  console.log("Columns verified and created successfully.");
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
}).finally(() => process.exit(0));

