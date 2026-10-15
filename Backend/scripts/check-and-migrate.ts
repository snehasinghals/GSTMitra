import { prisma } from "../src/lib/db.js";

async function main() {
  console.log("Checking all table columns in Neon DB...");

  // Let's test standard queries on Customer, PurchaseBill, SalesInvoice, Item, User, Business
  try {
    const custCount = await prisma.customer.count();
    console.log("Customer count query successful:", custCount);

    const pbCount = await prisma.purchaseBill.count();
    console.log("PurchaseBill count query successful:", pbCount);

    const pbAgg = await prisma.purchaseBill.aggregate({
      where: { receiptStatus: "ACCEPTED" },
      _count: true,
    });
    console.log("PurchaseBill aggregate query successful:", pbAgg);

    const siCount = await prisma.salesInvoice.count();
    console.log("SalesInvoice count query successful:", siCount);

    const hsnCount = await prisma.hsnCode.count();
    console.log("HsnCode count query successful:", hsnCount);

    const userCount = await prisma.user.count();
    console.log("User count query successful:", userCount);

    const bizCount = await prisma.business.count();
    console.log("Business count query successful:", bizCount);

    const itemCount = await prisma.item.count();
    console.log("Item count query successful:", itemCount);

    const spCount = await prisma.salesPayment.count();
    console.log("SalesPayment count query successful:", spCount);

    console.log("ALL MODEL QUERIES PASSED WITHOUT ERRORS!");
  } catch (err: any) {
    console.error("Error testing queries:", err);
  }
}

main().finally(() => process.exit(0));

