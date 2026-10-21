import { prisma } from "../src/lib/db.js";
import { validateSalesInvoiceAgainstRules, validatePurchaseBillAgainstRules, validateGstrFilingAgainstRules } from "../src/lib/ruleEngine.js";
import { syncLatestRulesAndAmendments } from "../src/lib/ruleUpdater.js";

async function retry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      console.log(`Connection attempt ${i + 1} failed (${e?.message || e}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

async function runVerification() {
  console.log("=== STARTING GST RULES VERIFICATION TEST ===");

  // 1. Verify rules are stored in DB
  const dbRulesCount = await retry(() => prisma.gstRule.count());
  console.log(`1. Total GST rules in DB: ${dbRulesCount}`);
  if (dbRulesCount === 0) {
    throw new Error("No rules in database!");
  }

  // 2. Test Sales Invoice Validation: Same-state IGST violation
  const mockBusiness = {
    id: "test-biz-id",
    stateCode: "27", // Maharashtra
    stateName: "Maharashtra",
    gstin: "27AAAAA0000A1Z5",
  };

  const invalidInvoicePayload = {
    invoiceNumber: "INV-TEST-001",
    invoiceDate: new Date(),
    placeOfSupply: "27", // Same state (Maharashtra)
    supplyType: "INTRA_STATE",
    totalIgst: 1800, // VIOLATION: charging IGST in same state!
    totalCgst: 0,
    totalSgst: 0,
    totalAmount: 11800,
  };

  const invalidItems = [
    {
      description: "Consulting Services",
      hsnSacCode: "998313",
      quantity: 1,
      rate: 10000,
      gstRate: 18,
      taxableValue: 10000,
    },
  ];

  console.log("2. Testing same-state IGST rule violation...");
  const violations1 = await validateSalesInvoiceAgainstRules({
    business: mockBusiness,
    invoice: invalidInvoicePayload,
    Items: invalidItems,
    customer: { name: "Local Client", stateCode: "27" },
  });

  console.log(`   Found ${violations1.length} violations:`);
  for (const v of violations1) {
    console.log(`   - [${v.severity}] ${v.ruleCode} (${v.ruleName})`);
    console.log(`     Message: ${v.message}`);
    console.log(`     Why: ${v.why}`);
    console.log(`     How to fix: ${v.howToFix}`);
  }

  const hasIgstViolation = violations1.some((v) => v.ruleCode === "VAL_IGST_SAME_STATE");
  if (!hasIgstViolation) {
    throw new Error("Expected VAL_IGST_SAME_STATE violation was not detected!");
  }
  console.log("   ✓ VAL_IGST_SAME_STATE successfully caught with rich explanation!");

  // 3. Test Invalid GST Rate Slab violation
  console.log("3. Testing non-active GST rate violation...");
  const invalidRateItems = [
    {
      description: "Odd Item",
      hsnSacCode: "847130",
      quantity: 1,
      rate: 1000,
      gstRate: 23.5, // Non-standard / non-existent rate in DB
    },
  ];

  const violations2 = await validateSalesInvoiceAgainstRules({
    business: mockBusiness,
    invoice: { ...invalidInvoicePayload, totalIgst: 0, totalCgst: 117.5, totalSgst: 117.5 },
    Items: invalidRateItems,
    customer: { name: "Local Client", stateCode: "27" },
  });

  const hasRateViolation = violations2.some((v) => v.ruleCode === "VAL_DYNAMIC_GST_RATE");
  if (!hasRateViolation) {
    throw new Error("Expected VAL_DYNAMIC_GST_RATE violation was not detected!");
  }
  console.log("   ✓ Dynamic DB rate check successfully caught non-active rate!");

  // 4. Test Purchase Bill Validation: Blocked ITC Section 17(5)
  console.log("4. Testing Purchase Bill Blocked ITC check (Section 17(5))...");
  const mockBill = {
    billNumber: "BILL-VEND-101",
    billDate: new Date(),
    placeOfSupply: "27",
    category: "MOTOR_VEHICLES", // Blocked under 17(5)
    isItcEligible: true, // User trying to claim ITC
    totalAmount: 500000,
  };

  const billViolations = await validatePurchaseBillAgainstRules({
    business: mockBusiness,
    bill: mockBill,
    Items: [
      {
        description: "Company Car",
        quantity: 1,
        rate: 500000,
        gstRate: 18,
        isItcEligible: true,
      },
    ],
    vendor: { name: "Car Dealer", gstin: "27XXXXX0000X1Z1", stateCode: "27" },
  });

  console.log(`   Found ${billViolations.length} bill violations:`);
  for (const v of billViolations) {
    console.log(`   - [${v.severity}] ${v.ruleCode}: ${v.message}`);
    console.log(`     Why: ${v.why}`);
    console.log(`     How to fix: ${v.howToFix}`);
  }

  const hasBlockedItc = billViolations.some((v) => v.ruleCode === "ITC_BLOCKED_SEC_17_5");
  if (!hasBlockedItc) {
    throw new Error("Expected ITC_BLOCKED_SEC_17_5 violation was not detected!");
  }
  console.log("   ✓ Section 17(5) Blocked ITC successfully detected and explained!");

  // 5. Test Valid Invoice: Clean
  console.log("5. Testing valid clean invoice...");
  const validInvoice = {
    invoiceNumber: "INV-2425-001",
    invoiceDate: new Date(),
    placeOfSupply: "27",
    supplyType: "INTRA_STATE",
    totalCgst: 900,
    totalSgst: 900,
    totalIgst: 0,
    totalAmount: 11800,
  };
  const validCleanItems = [
    {
      description: "Laptop Sales",
      hsnSacCode: "847130",
      quantity: 1,
      rate: 10000,
      gstRate: 18,
    },
  ];
  const cleanViolations = await validateSalesInvoiceAgainstRules({
    business: mockBusiness,
    invoice: validInvoice,
    Items: validCleanItems,
    customer: { name: "Client Ltd", stateCode: "27" },
  });

  const cleanErrors = cleanViolations.filter((v) => v.severity === "error");
  console.log(`   Clean invoice errors: ${cleanErrors.length}`);
  if (cleanErrors.length !== 0) {
    throw new Error(`Valid invoice had unexpected errors: ${JSON.stringify(cleanErrors)}`);
  }
  console.log("   ✓ Valid invoice passes rule verification completely!");

  console.log("=== ALL GST RULES VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
}

runVerification()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

