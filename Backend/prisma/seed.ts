import { prisma } from "../src/lib/db";

const GST_RATE_SOURCE = "https://gstcouncil.gov.in/sites/default/files/2025-09/faq.pdf";
const GST_RATE_SOURCE_QUOTE = "GST Council FAQ on GST rate changes (September 2025); verify the applicable CBIC notification for the item.";
const GST_RATE_EFFECTIVE_FROM = new Date("2025-09-22");

export const INITIAL_GST_RULES = [
  {
    category: "RATE",
    ruleCode: "GST_SLAB_0",
    ruleName: "0% GST rate",
    valueJson: JSON.stringify({ rate: 0, cgst: 0, sgst: 0, igst: 0 }),
    effectiveFrom: GST_RATE_EFFECTIVE_FROM,
    effectiveTo: null,
    status: "ACTIVE",
    description: "Rate-slab reference only, not an item classification. Nil-rated, exempt and zero-rated supplies are distinct legal treatments; verify the HSN/SAC-specific entry before applying a rate.",
    officialSource: GST_RATE_SOURCE,
    sourceQuote: GST_RATE_SOURCE_QUOTE,
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_5",
    ruleName: "5% GST rate",
    valueJson: JSON.stringify({ rate: 5, cgst: 2.5, sgst: 2.5, igst: 5 }),
    effectiveFrom: GST_RATE_EFFECTIVE_FROM,
    effectiveTo: null,
    status: "ACTIVE",
    description: "Rate-slab reference only, not an item classification. The applicable rate depends on the exact HSN/SAC entry and conditions in the current notification.",
    officialSource: GST_RATE_SOURCE,
    sourceQuote: GST_RATE_SOURCE_QUOTE,
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_18",
    ruleName: "18% GST rate",
    valueJson: JSON.stringify({ rate: 18, cgst: 9, sgst: 9, igst: 18 }),
    effectiveFrom: GST_RATE_EFFECTIVE_FROM,
    effectiveTo: null,
    status: "ACTIVE",
    description: "Rate-slab reference only, not an item classification. The applicable rate depends on the exact HSN/SAC entry and conditions in the current notification.",
    officialSource: GST_RATE_SOURCE,
    sourceQuote: GST_RATE_SOURCE_QUOTE,
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_28",
    ruleName: "40% GST rate (superseded slab)",
    valueJson: JSON.stringify({ rate: 28, cgst: 14, sgst: 14, igst: 28 }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: new Date("2025-09-21"),
    status: "SUPERSEDED",
    description: "Retained as historical reference only. Do not apply to a current supply without confirming the applicable HSN/SAC notification and time-of-supply rules.",
    officialSource: GST_RATE_SOURCE,
    sourceQuote: GST_RATE_SOURCE_QUOTE,
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_40",
    ruleName: "40% GST rate",
    valueJson: JSON.stringify({ rate: 40, cgst: 20, sgst: 20, igst: 40 }),
    effectiveFrom: GST_RATE_EFFECTIVE_FROM,
    effectiveTo: null,
    status: "ACTIVE",
    description: "Rate-slab reference only, not an item classification. The applicable rate depends on the exact HSN/SAC entry and conditions in the current notification.",
    officialSource: GST_RATE_SOURCE,
    sourceQuote: GST_RATE_SOURCE_QUOTE,
  },
  {
    category: "DUE_DATE",
    ruleCode: "GSTR1_DUE_MONTHLY",
    ruleName: "GSTR-1 Monthly Filing Due Date",
    valueJson: JSON.stringify({ dayOfMonth: 11, frequency: "MONTHLY" }),
    effectiveFrom: new Date("2017-07-01"),
    description: "The general due date for monthly filers is the 11th of the following month. Quarterly filers and notified extensions have different due dates; verify the period on the GST portal.",
    officialSource: "https://cbic-gst.gov.in",
    sourceQuote: "CGST Rules, 2017, Rule 59(1), subject to applicable notifications.",
  },
  {
    category: "DUE_DATE",
    ruleCode: "GSTR3B_DUE_MONTHLY",
    ruleName: "GSTR-3B Monthly Filing Due Date",
    valueJson: JSON.stringify({ dayOfMonth: 20, frequency: "MONTHLY" }),
    effectiveFrom: new Date("2017-07-01"),
    description: "The general due date for monthly filers is the 20th of the following month. Special taxpayer groups, quarterly filers and notified extensions can have different due dates; verify the period on the GST portal.",
    officialSource: "https://cbic-gst.gov.in",
    sourceQuote: "CGST Rules, 2017, Rule 61(1), subject to applicable notifications.",
  },
  {
    category: "BLOCK_ITC",
    ruleCode: "ITC_BLOCKED_SEC_17_5",
    ruleName: "Blocked Input Tax Credit (Section 17(5))",
    valueJson: JSON.stringify({
      categories: [
        { code: "MOTOR_VEHICLES", name: "Specified motor vehicles for transportation of persons with seating capacity up to 13, subject to statutory exceptions" },
        { code: "FOOD_BEVERAGES", name: "Specified food and beverages, outdoor catering, beauty treatment, health services and cosmetic surgery, subject to statutory exceptions" },
        { code: "CLUB_MEMBERSHIP", name: "Membership of a club, health or fitness centre" },
        { code: "TRAVEL_BENEFITS", name: "Specified rent-a-cab, life or health insurance, and employee travel benefits, subject to statutory exceptions" },
        { code: "PERSONAL_CONSUMPTION", name: "Goods or services used for personal consumption" },
        { code: "WRITTEN_OFF_GOODS", name: "Goods lost, stolen, destroyed, written off or disposed of by way of gift or free samples" }
      ]
    }),
    effectiveFrom: new Date("2017-07-01"),
    description: "Selected blocked-credit categories under Section 17(5) of the CGST Act, as amended. This is not an exhaustive list; eligibility depends on the statutory conditions and exceptions. Check the current Act before deciding ITC eligibility.",
    officialSource: "https://cbic-gst.gov.in",
    sourceQuote: "Section 17(5) of CGST Act 2017",
  }
];

export const INITIAL_HSN_CODES = [
  { code: "998313", description: "Information technology (IT) design and development services", rate: 18, type: "SERVICE" },
  { code: "998314", description: "Information technology (IT) infrastructure management services", rate: 18, type: "SERVICE" },
  { code: "998311", description: "Management consulting and management services", rate: 18, type: "SERVICE" },
  { code: "998211", description: "Legal advisory and representation services", rate: 18, type: "SERVICE" },
  { code: "998222", description: "Accounting, auditing and bookkeeping services", rate: 18, type: "SERVICE" },
  { code: "997212", description: "Renting of commercial immovable property", rate: 18, type: "SERVICE" },
  { code: "847130", description: "Laptops, Notebooks and Portable Data Processing Machines", rate: 18, type: "GOODS" },
  { code: "851712", description: "Telephones for cellular networks or for other wireless networks (Mobile Phones)", rate: 18, type: "GOODS" },
  { code: "844331", description: "Printers, Photo Copiers, Facsimile Machines", rate: 18, type: "GOODS" },
  { code: "940330", description: "Wooden Furniture of a kind used in offices", rate: 18, type: "GOODS" },
  { code: "482010", description: "Registers, Account Books, Note Books, Order Books, Receipt Books", rate: 12, type: "GOODS" },
  { code: "610910", description: "T-shirts, Singlets and Other Vests of Cotton", rate: 5, type: "GOODS" },
  { code: "040110", description: "Fresh Milk and Cream, Not Concentrated nor Sweetened", rate: 0, type: "GOODS" },
  { code: "100630", description: "Semi-milled or Wholly Milled Rice (Unbranded)", rate: 0, type: "GOODS" }
];

async function seed() {
  console.log("Seeding GST rules...");
  
  for (const rule of INITIAL_GST_RULES) {
    await prisma.gstRule.upsert({
      where: { ruleCode: rule.ruleCode },
      create: rule,
      update: rule,
    });
    console.log(`Upserted GST Rule: ${rule.ruleCode}`);
  }

  console.log("Seeding completed successfully!");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
