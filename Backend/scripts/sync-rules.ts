import { syncLatestRulesAndAmendments } from "../src/lib/ruleUpdater.js";
import { prisma } from "../src/lib/db.js";

async function main() {
  console.log("Synchronizing GST rules from latest registry & amendments...");
  try {
    const result = await syncLatestRulesAndAmendments("SEED_SCRIPT");
    console.log("Sync result:", result);
    const count = await prisma.gstRule.count();
    console.log("Total rules in DB:", count);
  } catch (err) {
    console.error("Error during sync:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

