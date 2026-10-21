import { prisma } from "../src/lib/db.js";

async function main() {
  try {
    const rules = await prisma.gstRule.findMany({
      select: {
        ruleCode: true,
        category: true,
        ruleName: true,
        status: true,
        effectiveFrom: true,
        effectiveTo: true,
        valueJson: true,
      },
      orderBy: { category: "asc" },
    });
    console.log(`Total rules in DB: ${rules.length}`);
    for (const r of rules) {
      console.log(`- [${r.category}] ${r.ruleCode} (${r.status}): ${r.ruleName}`);
      console.log(`  Value: ${r.valueJson}`);
    }
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

main();

