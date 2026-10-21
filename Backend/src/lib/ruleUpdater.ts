import { prisma } from "./db.js";

export interface GSTAmendmentSeed {
  category: "RATE" | "BLOCK_ITC" | "DUE_DATE" | "THRESHOLD" | "VALIDATION" | "COURT_ORDER" | "AMENDMENT";
  ruleCode: string;
  ruleName: string;
  valueJson: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  description: string;
  officialSource?: string;
  sourceQuote?: string;
  status?: "ACTIVE" | "SUPERSEDED" | "UPCOMING";
}

/**
 * Standard registry of GST Rules, Amendments, and Court Orders.
 * Stored dynamically in DB so no hardcoding exists in business logic.
 */
export const OFFICIAL_GST_RULES_REGISTRY: GSTAmendmentSeed[] = [
  // 1. RATE SLABS
  {
    category: "RATE",
    ruleCode: "GST_SLAB_0",
    ruleName: "0% Tax Rate (Exempt & Essential Goods)",
    valueJson: JSON.stringify({ rate: 0, cgst: 0, sgst: 0, igst: 0 }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Essential daily foods (like fresh milk, fruits, vegetables, grains) and public services have 0% GST. You do not charge any tax on these Items.",
    officialSource: "CBIC Notification No. 2/2017 - Central Tax (Rate)",
    sourceQuote: "Exempt goods & services under Section 11 of CGST Act",
    status: "ACTIVE",
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_5",
    ruleName: "5% Tax Rate (Basic Household Essentials & Medicines)",
    valueJson: JSON.stringify({ rate: 5, cgst: 2.5, sgst: 2.5, igst: 5 }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Applies to packaged basic food Items, essential life-saving medicines, tea, coffee, and economy passenger transport.",
    officialSource: "CBIC Notification No. 1/2017 - Central Tax (Rate)",
    sourceQuote: "Schedule I of Notification No. 1/2017",
    status: "ACTIVE",
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_12",
    ruleName: "12% Tax Rate (Archived / Merged Historical Rate)",
    valueJson: JSON.stringify({ rate: 12, cgst: 6, sgst: 6, igst: 12 }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: new Date("2025-09-21"),
    description: "Historical rate slab previously used for processed foods and electronics prior to council rate revisions. Kept for historical invoice lookups.",
    officialSource: "GST Council Rate Rationalisation Notifications",
    sourceQuote: "GST Council recommendations on slab rationalization",
    status: "SUPERSEDED",
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_18",
    ruleName: "18% Standard Tax Rate (Most Goods & Services)",
    valueJson: JSON.stringify({ rate: 18, cgst: 9, sgst: 9, igst: 18 }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "The most common GST rate in India. Applies to standard manufactured products, software, IT services, and commercial consulting.",
    officialSource: "CBIC Notification No. 1/2017 - Central Tax (Rate)",
    sourceQuote: "Schedule III of Notification No. 1/2017",
    status: "ACTIVE",
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_28",
    ruleName: "28% Luxury Tax Rate (Archived Historical Rate)",
    valueJson: JSON.stringify({ rate: 28, cgst: 14, sgst: 14, igst: 28 }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: new Date("2025-09-21"),
    description: "Historical luxury rate slab used for high-end electronics and motor vehicles prior to rate rationalization revisions.",
    officialSource: "GST Council FAQ on GST rate changes",
    sourceQuote: "GST Council FAQ September 2025",
    status: "SUPERSEDED",
  },
  {
    category: "RATE",
    ruleCode: "GST_SLAB_40",
    ruleName: "40% Peak Tax Rate (Demerit & Heavy Luxury Goods)",
    valueJson: JSON.stringify({ rate: 40, cgst: 20, sgst: 20, igst: 40 }),
    effectiveFrom: new Date("2025-09-22"),
    effectiveTo: null,
    description: "Maximum rate category applicable only to specific luxury goods, pan masala, and aerated drinks.",
    officialSource: "CBIC Notifications / GST Council 2025 Updates",
    sourceQuote: "Schedule IV Rate Rationalization",
    status: "ACTIVE",
  },

  // 2. BLOCK ITC RULES & LANDMARK COURT ORDER
  {
    category: "BLOCK_ITC",
    ruleCode: "ITC_BLOCKED_SEC_17_5",
    ruleName: "No Tax Credit on Personal Purchases (Cars, Food, Gifts)",
    valueJson: JSON.stringify({
      categories: [
        { code: "MOTOR_VEHICLES", name: "Passenger cars & motor vehicles (seating up to 13 people) unless used for driving schools or transport businesses" },
        { code: "FOOD_BEVERAGES", name: "Restaurant food, outdoor catering, beauty treatments, and health club expenses" },
        { code: "CLUB_MEMBERSHIP", name: "Gym, health club, and social club membership fees" },
        { code: "TRAVEL_BENEFITS", name: "Personal travel benefits and leave vacation travel (LTC) for staff" },
        { code: "PERSONAL_CONSUMPTION", name: "Any goods or services bought for personal home use" },
        { code: "WRITTEN_OFF_GOODS", name: "Goods that were lost, stolen, damaged, or given away as free gifts or samples" },
        { code: "WORKS_CONTRACT_CONSTRUCTION", name: "Building construction work (unless constructing commercial property for rental under Safari Retreats ruling)" },
      ],
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "You cannot claim a tax refund/credit on personal cars, restaurant meals, gym memberships, or free gifts bought for your business.",
    officialSource: "Section 17(5) of CGST Act 2017",
    sourceQuote: "CGST Act 2017, Section 17(5) Ineligible Input Tax Credits",
    status: "ACTIVE",
  },
  {
    category: "COURT_ORDER",
    ruleCode: "COURT_ORDER_SAFARI_RETREATS_2024",
    ruleName: "Supreme Court: Tax Credit Allowed for Commercial Rental Buildings",
    valueJson: JSON.stringify({
      caseTitle: "Chief Commissioner of Central Goods and Services Tax v. M/s Safari Retreats Pvt Ltd",
      court: "Supreme Court of India",
      date: "2024-10-03",
      ruling: "Tax credit (ITC) is allowed on construction materials and services for commercial properties (like shopping malls and warehouses) built specifically for continuous commercial leasing or renting.",
      impact: "Businesses constructing buildings for commercial renting can evaluate tax credit (ITC) on building components using the functionality test.",
    }),
    effectiveFrom: new Date("2024-10-03"),
    effectiveTo: null,
    description: "The Supreme Court ruled that businesses constructing shopping malls or warehouses specifically to rent them out can claim GST tax credit on construction costs.",
    officialSource: "Supreme Court Judgment in Civil Appeal No. 2948 of 2023",
    sourceQuote: "Safari Retreats (P) Ltd. Supreme Court Order Oct 2024",
    status: "ACTIVE",
  },

  // 3. THRESHOLD RULES
  {
    category: "THRESHOLD",
    ruleCode: "THRESHOLD_PAN_MANDATORY",
    ruleName: "Ask for Customer PAN on Bills Over ₹2,00,000",
    valueJson: JSON.stringify({
      thresholdAmount: 200000,
      rule: "Rule 114B",
      requirement: "Customer PAN must be recorded on any sales invoice or cash receipt where the total value exceeds ₹2 Lakhs.",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Whenever a single sales invoice or receipt exceeds ₹2 Lakhs, you must record the buyer's 10-character PAN card number.",
    officialSource: "Rule 114B of Income Tax Rules & CBIC Compliance Circulars",
    sourceQuote: "Quoting of PAN for sales exceeding ₹2,00,000",
    status: "ACTIVE",
  },
  {
    category: "THRESHOLD",
    ruleCode: "THRESHOLD_E_INVOICE",
    ruleName: "Government E-Invoicing Mandatory if Yearly Sales > ₹5 Crores",
    valueJson: JSON.stringify({
      aggregateTurnoverThreshold: 50000000, // 5 Crore
      appliesTo: "B2B_INVOICES",
      requirement: "Mandatory generation of digital Invoice Reference Number (IRN) and QR code on the government portal for all B2B sales.",
    }),
    effectiveFrom: new Date("2023-08-01"),
    effectiveTo: null,
    description: "Businesses with annual sales over ₹5 Crores must upload B2B invoices to the government IRP portal to obtain an official digital QR code (IRN).",
    officialSource: "CBIC Notification No. 10/2023 - Central Tax",
    sourceQuote: "Notification No. 10/2023 dated 10th May 2023",
    status: "ACTIVE",
  },
  {
    category: "THRESHOLD",
    ruleCode: "THRESHOLD_E_WAY_BILL",
    ruleName: "E-Way Bill Permit Required for Moving Goods Over ₹50,000",
    valueJson: JSON.stringify({
      consignmentValue: 50000,
      requirement: "Mandatory transport permit (E-Way Bill) generated on the government portal before goods leave the warehouse.",
    }),
    effectiveFrom: new Date("2018-04-01"),
    effectiveTo: null,
    description: "Before sending goods worth more than ₹50,000 to a customer, you must create a digital transport permit (E-Way Bill) on the government portal.",
    officialSource: "Rule 138 of CGST Rules 2017",
    sourceQuote: "CGST Rules 2017 Rule 138 E-Way Bill",
    status: "ACTIVE",
  },
  {
    category: "THRESHOLD",
    ruleCode: "THRESHOLD_HSN_DIGITS",
    ruleName: "Product Code Length: 4 Digits for Small Shops, 6 Digits for Large",
    valueJson: JSON.stringify({
      below5CrMinDigits: 4,
      above5CrMinDigits: 6,
      requirement: "Minimum 4 digits for businesses with yearly sales up to ₹5 Crores; minimum 6 digits for businesses with yearly sales over ₹5 Crores.",
    }),
    effectiveFrom: new Date("2021-04-01"),
    effectiveTo: null,
    description: "If your yearly sales are up to ₹5 Crores, use at least 4 digits for item HSN codes. If yearly sales exceed ₹5 Crores, use 6 digits.",
    officialSource: "CBIC Notification No. 78/2020 - Central Tax",
    sourceQuote: "Notification 78/2020 dated 15th October 2020",
    status: "ACTIVE",
  },

  // 4. DUE DATES
  {
    category: "DUE_DATE",
    ruleCode: "GSTR1_DUE_MONTHLY",
    ruleName: "GSTR-1 Monthly Filing Due Date",
    valueJson: JSON.stringify({ dayOfMonth: 11, frequency: "MONTHLY" }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Monthly outward supply return GSTR-1 is due on the 11th of the succeeding month.",
    officialSource: "CGST Rules, 2017, Rule 59(1)",
    sourceQuote: "Rule 59(1) Form and manner of furnishing details of outward supplies",
    status: "ACTIVE",
  },
  {
    category: "DUE_DATE",
    ruleCode: "GSTR3B_DUE_MONTHLY",
    ruleName: "GSTR-3B Monthly Filing Due Date",
    valueJson: JSON.stringify({ dayOfMonth: 20, frequency: "MONTHLY" }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Monthly summary return and tax payment GSTR-3B is due on the 20th of the succeeding month.",
    officialSource: "CGST Rules, 2017, Rule 61(1)",
    sourceQuote: "Rule 61(1) Return for monthly filers",
    status: "ACTIVE",
  },

  // 5. DECLARATIVE VALIDATION RULES (problemIf engine)
  {
    category: "VALIDATION",
    ruleCode: "VAL_IGST_SAME_STATE",
    ruleName: "Intra-State Supplies Prohibit IGST (CGST + SGST Mandatory)",
    valueJson: JSON.stringify({
      appliesTo: "SALES_INVOICE",
      problemIf: {
        and: [
          { "==": [{ var: "business.stateCode" }, { var: "invoice.placeOfSupply" }] },
          { ">": [{ var: "invoice.totalIgst" }, 0] },
        ],
      },
      severity: "error",
      field: "placeOfSupply",
      message: "Customer is located in the same state, but IGST was charged instead of CGST and SGST.",
      why: "Under Sections 7 and 8 of the IGST Act, supplies within the same state (intra-state) are strictly taxable as CGST (50%) and SGST (50%). IGST applies strictly to inter-state supplies.",
      howToFix: "Select 'Within State' supply type or adjust the tax breakup to CGST and SGST.",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Intra-state sales require an equal 50:50 split of CGST and SGST. Charging IGST within the same state is legally prohibited.",
    officialSource: "IGST Act 2017, Sections 7 and 8",
    status: "ACTIVE",
  },
  {
    category: "VALIDATION",
    ruleCode: "VAL_INTRA_TAX_INTER_STATE",
    ruleName: "Inter-State Supplies Prohibit CGST/SGST (IGST Mandatory)",
    valueJson: JSON.stringify({
      appliesTo: "SALES_INVOICE",
      problemIf: {
        and: [
          { "!=": [{ var: "business.stateCode" }, { var: "invoice.placeOfSupply" }] },
          {
            or: [
              { ">": [{ var: "invoice.totalCgst" }, 0] },
              { ">": [{ var: "invoice.totalSgst" }, 0] },
            ],
          },
        ],
      },
      severity: "error",
      field: "placeOfSupply",
      message: "Customer is located in another state, but CGST or SGST was charged.",
      why: "Under Section 5(1) & Section 7 of the IGST Act 2017, all inter-state supplies are subject exclusively to Integrated Goods and Services Tax (IGST). Charging state-specific taxes across state borders is legally invalid.",
      howToFix: "Remove CGST and SGST and apply the full applicable tax rate as IGST.",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Inter-state sales must carry only IGST. Charging CGST or SGST on cross-border supply is legally invalid.",
    officialSource: "IGST Act 2017, Section 5(1) & Section 7",
    status: "ACTIVE",
  },
  {
    category: "VALIDATION",
    ruleCode: "VAL_HSN_MISSING",
    ruleName: "Mandatory HSN/SAC Classification on Invoices",
    valueJson: JSON.stringify({
      appliesTo: "SALES_INVOICE_ITEM",
      problemIf: {
        "==": [{ trim: [{ var: "item.hsnSacCode" }] }, ""],
      },
      severity: "error",
      field: "hsnSacCode",
      message: "HSN / SAC classification code is missing for item '{item.description}'.",
      why: "Rule 46(g) of the CGST Rules 2017 mandates a valid Harmonized System of Nomenclature (HSN) or SAC code for correct tax classification and GSTR-1 Table 12 summary reporting.",
      howToFix: "Select or enter a valid 4-digit or 6-digit HSN/SAC code for this line item.",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Every item on a tax invoice must have a valid HSN/SAC classification code.",
    officialSource: "CGST Rules 2017, Rule 46(g)",
    status: "ACTIVE",
  },
  {
    category: "VALIDATION",
    ruleCode: "VAL_INVOICE_NO_LENGTH",
    ruleName: "Invoice Number Maximum Length (16 Characters)",
    valueJson: JSON.stringify({
      appliesTo: "SALES_INVOICE",
      problemIf: {
        ">": [{ length: [{ var: "invoice.invoiceNumber" }] }, 16],
      },
      severity: "error",
      field: "invoiceNumber",
      message: "Invoice number '{invoice.invoiceNumber}' exceeds the maximum allowed length of 16 characters ({invoice.invoiceNumber.length} characters).",
      why: "Under Rule 46(b) of CGST Rules 2017, invoice numbers must not exceed 16 consecutive characters. Numbers exceeding 16 characters are rejected by the GST Common Portal.",
      howToFix: "Shorten the invoice number to 16 characters or fewer (e.g. INV-2425-001).",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Statutory length restriction of 16 characters for invoice series numbers.",
    officialSource: "CGST Rules 2017, Rule 46(b)",
    status: "ACTIVE",
  },
  {
    category: "VALIDATION",
    ruleCode: "VAL_INVOICE_NO_FORMAT",
    ruleName: "Invoice Number Permitted Characters",
    valueJson: JSON.stringify({
      appliesTo: "SALES_INVOICE",
      problemIf: {
        regex: ["[\\s#%&*@!$^+={}\\[\\]:;\"'<>?,]", { var: "invoice.invoiceNumber" }],
      },
      severity: "error",
      field: "invoiceNumber",
      message: "Invoice number '{invoice.invoiceNumber}' contains illegal characters or spaces.",
      why: "Rule 46(b) restricts invoice identifiers strictly to alphanumeric characters (A-Z, 0-9), hyphens (-), and forward slashes (/). Spaces and special symbols (@, #, $, %, etc.) are rejected by the GST portal.",
      howToFix: "Remove all spaces and special symbols, keeping only letters, numbers, hyphens, and slashes.",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Only alphanumeric characters, hyphens, and forward slashes are permissible in invoice serials.",
    officialSource: "CGST Rules 2017, Rule 46(b)",
    status: "ACTIVE",
  },
  {
    category: "VALIDATION",
    ruleCode: "VAL_B2B_GSTIN_FORMAT",
    ruleName: "Valid 15-Digit GSTIN Format for B2B Customers",
    valueJson: JSON.stringify({
      appliesTo: "SALES_INVOICE",
      problemIf: {
        and: [
          { "!=": [{ var: "customer.gstin" }, null] },
          { "!=": [{ trim: [{ var: "customer.gstin" }] }, ""] },
          { not_regex: ["^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$", { var: "customer.gstin" }] },
        ],
      },
      severity: "error",
      field: "buyerGstin",
      message: "Customer GSTIN '{customer.gstin}' does not match the standard 15-character GSTIN structure.",
      why: "Under Rules 8 and 46 of CGST Rules 2017, a valid GSTIN consists of 2 state digits, 10 PAN characters, 1 entity code, 1 default 'Z', and 1 checksum character.",
      howToFix: "Verify and enter the customer's correct 15-character GSTIN.",
    }),
    effectiveFrom: new Date("2017-07-01"),
    effectiveTo: null,
    description: "Mandatory standard 15-digit alphanumeric format validation for B2B tax invoices.",
    officialSource: "Rule 8 & Rule 46 of CGST Rules 2017",
    status: "ACTIVE",
  },

  // 6. AMENDMENT: 53rd & 54th GST COUNCIL RECOMMENDATIONS & NOTIFICATIONS
  {
    category: "AMENDMENT",
    ruleCode: "AMEND_SEC_128A_WAIVER",
    ruleName: "Section 128A Interest and Penalty Waiver Scheme",
    valueJson: JSON.stringify({
      section: "128A",
      notifiedDate: "2024-11-01",
      deadline: "2025-03-31",
      details: "Waiver of interest and penalty for demand notices issued under Section 73 for FY 2017-18, 2018-19, and 2019-20, provided full tax is paid before 31st March 2025.",
    }),
    effectiveFrom: new Date("2024-11-01"),
    effectiveTo: new Date("2025-03-31"),
    description: "CBIC Notification No. 12/2024 and Rule 164 implementing Section 128A waiver.",
    officialSource: "CBIC Notification No. 12/2024 - Central Tax",
    sourceQuote: "Rule 164 inserted by Central Goods and Services Tax (Ninth Amendment) Rules, 2024",
    status: "ACTIVE",
  },
  {
    category: "AMENDMENT",
    ruleCode: "AMEND_B2C_REPORTING_LIMIT",
    ruleName: "B2C Large Invoice Reporting Threshold Reduction to ₹1 Lakh",
    valueJson: JSON.stringify({
      previousThreshold: 250000,
      newThreshold: 100000,
      table: "GSTR-1 Table 5 (B2CL)",
      details: "Inter-state B2C supplies with invoice value exceeding ₹1 Lakh (previously ₹2.5 Lakhs) must be reported invoice-wise in Table 5 of GSTR-1.",
    }),
    effectiveFrom: new Date("2024-11-01"),
    effectiveTo: null,
    description: "54th GST Council recommendation lowering the B2CL reporting threshold from ₹2.5L to ₹1L.",
    officialSource: "54th GST Council Meeting Recommendations / Notification 2024",
    sourceQuote: "Amendment to Rule 59 for B2C large invoice threshold",
    status: "ACTIVE",
  },
];

import { simplifyRuleWithAi } from "./ruleAiSimplifier.js";

/**
 * Synchronize and update all rules in DB according to the latest registry.
 * Calls AI simplifier once per rule at ingestion time, persisting plain-English explanations.
 */
export async function syncLatestRulesAndAmendments(performedBy = "SYSTEM"): Promise<{
  inserted: number;
  updated: number;
  total: number;
}> {
  let inserted = 0;
  let updated = 0;

  for (const rule of OFFICIAL_GST_RULES_REGISTRY) {
    const existing = await prisma.gstRule.findUnique({
      where: { ruleCode: rule.ruleCode },
    });

    const aiResult = await simplifyRuleWithAi({
      ruleCode: rule.ruleCode,
      ruleName: rule.ruleName,
      category: rule.category,
      valueJson: rule.valueJson,
      description: rule.description,
      officialSource: rule.officialSource,
      sourceQuote: rule.sourceQuote,
    });

    let parsedVal: any = {};
    try {
      parsedVal = typeof rule.valueJson === "string" ? JSON.parse(rule.valueJson) : { ...rule.valueJson };
    } catch {
      parsedVal = { raw: rule.valueJson };
    }
    parsedVal.aiExplanation = {
      simpleTitle: aiResult.simpleTitle,
      simpleSummary: aiResult.simpleSummary,
      whyThisRuleExists: aiResult.whyThisRuleExists,
      howToComply: aiResult.howToComply,
      keySpecs: aiResult.keySpecs,
      isAiGenerated: aiResult.isAiGenerated,
    };
    const finalValueJson = JSON.stringify(parsedVal);
    const finalRuleName = aiResult.simpleTitle || rule.ruleName;
    const finalDescription = aiResult.simpleSummary || rule.description;

    if (!existing) {
      const created = await prisma.gstRule.create({
        data: {
          category: rule.category,
          ruleCode: rule.ruleCode,
          ruleName: finalRuleName,
          valueJson: finalValueJson,
          effectiveFrom: rule.effectiveFrom,
          effectiveTo: rule.effectiveTo,
          description: finalDescription,
          officialSource: rule.officialSource,
          sourceQuote: rule.sourceQuote,
          status: rule.status || "ACTIVE",
        },
      });

      await prisma.gstRuleAudit.create({
        data: {
          ruleId: created.id,
          action: "CREATED",
          details: `Rule ${rule.ruleCode} initialized with plain-English AI explanations.`,
          sourceUrl: rule.officialSource,
          performedBy,
        },
      });
      inserted++;
    } else {
      // Check if value, status, description, or title changed
      const hasChanged =
        existing.valueJson !== finalValueJson ||
        existing.status !== (rule.status || "ACTIVE") ||
        existing.description !== finalDescription ||
        existing.ruleName !== finalRuleName;

      if (hasChanged) {
        await prisma.gstRule.update({
          where: { id: existing.id },
          data: {
            valueJson: finalValueJson,
            ruleName: finalRuleName,
            status: rule.status || "ACTIVE",
            effectiveTo: rule.effectiveTo,
            description: finalDescription,
            officialSource: rule.officialSource,
            sourceQuote: rule.sourceQuote,
          },
        });

        await prisma.gstRuleAudit.create({
          data: {
            ruleId: existing.id,
            action: "UPDATED",
            details: `Rule ${rule.ruleCode} updated with plain-English explanations.`,
            sourceUrl: rule.officialSource,
            performedBy,
          },
        });
        updated++;
      }
    }
  }

  const total = await prisma.gstRule.count();
  return { inserted, updated, total };
}

/**
 * Ingests a new custom amendment, notification, or court order dynamically into the DB.
 */
export async function ingestCustomAmendment(params: {
  ruleCode: string;
  ruleName: string;
  category: "RATE" | "BLOCK_ITC" | "DUE_DATE" | "THRESHOLD" | "VALIDATION" | "COURT_ORDER" | "AMENDMENT";
  valueJson: string | object;
  effectiveFrom: string | Date;
  effectiveTo?: string | Date | null;
  description: string;
  officialSource?: string;
  sourceQuote?: string;
  performedBy?: string;
}) {
  const effFrom = new Date(params.effectiveFrom);
  const effTo = params.effectiveTo ? new Date(params.effectiveTo) : null;
  const user = params.performedBy || "USER";

  const aiResult = await simplifyRuleWithAi({
    ruleCode: params.ruleCode,
    ruleName: params.ruleName,
    category: params.category,
    valueJson: params.valueJson,
    description: params.description,
    officialSource: params.officialSource,
    sourceQuote: params.sourceQuote,
  });

  let parsedVal: any = {};
  try {
    parsedVal = typeof params.valueJson === "string" ? JSON.parse(params.valueJson) : { ...params.valueJson };
  } catch {
    parsedVal = { raw: params.valueJson };
  }
  parsedVal.aiExplanation = {
    simpleTitle: aiResult.simpleTitle,
    simpleSummary: aiResult.simpleSummary,
    whyThisRuleExists: aiResult.whyThisRuleExists,
    howToComply: aiResult.howToComply,
    keySpecs: aiResult.keySpecs,
    isAiGenerated: aiResult.isAiGenerated,
  };
  const jsonStr = JSON.stringify(parsedVal);
  const finalTitle = aiResult.simpleTitle || params.ruleName;
  const finalDesc = aiResult.simpleSummary || params.description;

  const existing = await prisma.gstRule.findUnique({
    where: { ruleCode: params.ruleCode },
  });

  if (existing) {
    const updated = await prisma.gstRule.update({
      where: { id: existing.id },
      data: {
        category: params.category,
        ruleName: finalTitle,
        valueJson: jsonStr,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        description: finalDesc,
        officialSource: params.officialSource,
        sourceQuote: params.sourceQuote,
        status: "ACTIVE",
      },
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId: updated.id,
        action: "UPDATED",
        details: `Rule updated from new amendment / court order: ${finalTitle}`,
        sourceUrl: params.officialSource,
        performedBy: user,
      },
    });

    return { rule: updated, action: "UPDATED" };
  } else {
    const created = await prisma.gstRule.create({
      data: {
        category: params.category,
        ruleCode: params.ruleCode,
        ruleName: finalTitle,
        valueJson: jsonStr,
        effectiveFrom: effFrom,
        effectiveTo: effTo,
        description: finalDesc,
        officialSource: params.officialSource,
        sourceQuote: params.sourceQuote,
        status: "ACTIVE",
      },
    });

    await prisma.gstRuleAudit.create({
      data: {
        ruleId: created.id,
        action: "CREATED",
        details: `New rule created from amendment / court order: ${params.ruleName}`,
        sourceUrl: params.officialSource,
        performedBy: user,
      },
    });

    return { rule: created, action: "CREATED" };
  }
}

