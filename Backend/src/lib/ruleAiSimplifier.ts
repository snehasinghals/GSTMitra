/**
 * AI Rule Simplifier Service
 *
 * Runs ONCE when an official GST amendment, court order, or rule is ingested into the database.
 * Uses Google Gemini AI (via GEMINI_API_KEY) to translate complex statutory legal jargon
 * into crystal-clear plain English that any non-commerce shopkeeper or business owner can understand in 5 seconds.
 *
 * Stored directly in the database (GstRule.valueJson) so page visits have ZERO latency and ZERO extra API calls.
 */

export interface AiSimplifiedRuleResult {
  simpleTitle: string;
  simpleSummary: string;
  whyThisRuleExists: string;
  howToComply: string;
  keySpecs?: { label: string; value: string }[];
  isAiGenerated: boolean;
}

export async function simplifyRuleWithAi(params: {
  ruleCode: string;
  ruleName: string;
  category: string;
  valueJson: string | object;
  description: string;
  officialSource?: string | null;
  sourceQuote?: string | null;
}): Promise<AiSimplifiedRuleResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  const valueStr = typeof params.valueJson === "string" ? params.valueJson : JSON.stringify(params.valueJson, null, 2);

  if (!apiKey) {
    return generateDeterministicSimpleEnglish(params);
  }

  try {
    const prompt = `You are an expert Indian GST plain-language simplifier.
Your mission is to translate complex statutory tax rules, gazette notifications, and court orders into simple, friendly everyday English that a small shopkeeper, kirana owner, or someone with NO commerce/accounting background can immediately understand in 5 seconds.

RULE TO SIMPLIFY:
- Category: ${params.category}
- Code: ${params.ruleCode}
- Official Title: ${params.ruleName}
- Description: ${params.description}
- Official Legal Source: ${params.officialSource || "Official statutory notification"}
- Raw Value / Conditions:
${valueStr}

INSTRUCTIONS:
1. Avoid legal jargon (e.g., avoid "notwithstanding", "inter-state vs intra-state without explanation", "in exercise of powers", "mutatis mutandis", "ad valorem").
2. Return ONLY a valid JSON object with the following exact keys (no markdown backticks, no markdown formatting):
{
  "simpleTitle": "5-8 word simple, clear title in plain English",
  "simpleSummary": "1-2 sentences in simple English explaining what this rule is about.",
  "whyThisRuleExists": "1-2 simple sentences explaining why the government or court created this law.",
  "howToComply": "Concrete, step-by-step instructions on what the shopkeeper or business owner must do to follow this rule.",
  "keySpecs": [
    { "label": "Short Spec Name", "value": "Number or concise requirement" }
  ]
}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!response.ok) {
      console.warn("Gemini API error during rule simplification:", response.status, await response.text());
      return generateDeterministicSimpleEnglish(params);
    }

    const data: any = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const cleanJson = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return {
      simpleTitle: parsed.simpleTitle || params.ruleName,
      simpleSummary: parsed.simpleSummary || params.description,
      whyThisRuleExists: parsed.whyThisRuleExists || "Statutory tax compliance requirement under Indian Goods and Services Tax law.",
      howToComply: parsed.howToComply || "Review your transaction details and apply the required rate or identifier before saving.",
      keySpecs: Array.isArray(parsed.keySpecs) ? parsed.keySpecs : undefined,
      isAiGenerated: true,
    };
  } catch (err) {
    console.warn(`Failed to simplify rule ${params.ruleCode} via Gemini AI, falling back to deterministic explanation:`, err);
    return generateDeterministicSimpleEnglish(params);
  }
}

/**
 * High-quality deterministic fallback for standard Indian GST rules
 * ensuring every single rule has 100% crystal-clear plain English even if AI API is offline.
 */
function generateDeterministicSimpleEnglish(params: {
  ruleCode: string;
  ruleName: string;
  category: string;
  valueJson: string | object;
  description: string;
  officialSource?: string | null;
}): AiSimplifiedRuleResult {
  const code = params.ruleCode.toUpperCase();
  const v = typeof params.valueJson === "string" ? JSON.parse(params.valueJson || "{}") : (params.valueJson || {});

  // 1. Same-State IGST check
  if (code === "VAL_IGST_SAME_STATE") {
    return {
      simpleTitle: "Same-State Sale: Split Tax into CGST + SGST (Never IGST)",
      simpleSummary: "When your customer is in the same state as your shop, you must split the tax into two equal halves (CGST and SGST). Charging IGST within the same state is not allowed.",
      whyThisRuleExists: "Under Sections 7 and 8 of the IGST Act, tax collected from buyers in your own state must be split 50-50 between the Central Government and your State Government.",
      howToComply: "Select 'Within State' as the supply type on your invoice and apply CGST + SGST. Never choose IGST for local buyers.",
      keySpecs: [
        { label: "Buyer Location", value: "Same State as Seller" },
        { label: "Tax Split", value: "50% CGST + 50% SGST" },
        { label: "Prohibited Tax", value: "IGST is Strictly Forbidden" },
      ],
      isAiGenerated: false,
    };
  }

  // 2. Inter-State CGST/SGST check
  if (code === "VAL_INTRA_TAX_INTER_STATE") {
    return {
      simpleTitle: "Out-of-State Sale: Charge IGST Only (Never CGST or SGST)",
      simpleSummary: "When your customer is in a different state, charge one combined tax called IGST. You cannot charge state taxes across state borders.",
      whyThisRuleExists: "Under Section 5 of the IGST Act, all cross-border sales between different Indian states belong to the Central pool as Integrated GST (IGST).",
      howToComply: "Select 'Out of State' supply type and charge the full GST rate as IGST. Do not add CGST or SGST.",
      keySpecs: [
        { label: "Buyer Location", value: "Different State" },
        { label: "Applicable Tax", value: "100% IGST" },
        { label: "Prohibited Taxes", value: "CGST and SGST are Invalid" },
      ],
      isAiGenerated: false,
    };
  }

  // 3. Mandatory HSN Code
  if (code === "VAL_HSN_MISSING" || code === "THRESHOLD_HSN_DIGITS") {
    return {
      simpleTitle: "Every Product Needs an Official Government Item Code (HSN)",
      simpleSummary: "Every item on your invoice must carry an official HSN product code so the tax office and buyer know exactly what product or service was delivered.",
      whyThisRuleExists: "Under Rule 46(g) of the CGST Rules, HSN codes standardize product classifications across India and enable accurate GSTR-1 Table 12 reporting.",
      howToComply: "Select or enter a valid 4-digit (for businesses under ₹5 Cr) or 6-digit (for businesses over ₹5 Cr) HSN code for every item.",
      keySpecs: [
        { label: "Under ₹5 Cr Turnover", value: "Minimum 4-Digit HSN" },
        { label: "Over ₹5 Cr Turnover", value: "Minimum 6-Digit HSN" },
        { label: "Requirement", value: "Mandatory on Every Line Item" },
      ],
      isAiGenerated: false,
    };
  }

  // 4. Invoice Number Length
  if (code === "VAL_INVOICE_NO_LENGTH") {
    return {
      simpleTitle: "Invoice Number Must Be 16 Characters or Shorter",
      simpleSummary: "Your invoice or bill serial number cannot be longer than 16 characters. If it exceeds 16 characters, the government GST portal rejects it.",
      whyThisRuleExists: "Under Rule 46(b) of the CGST Rules, the government GST portal database only accepts invoice series numbers up to 16 characters in length.",
      howToComply: "Shorten your invoice series format (for example: INV-2425-001 or BILL/2026/042).",
      keySpecs: [
        { label: "Maximum Allowed Length", value: "16 Characters" },
        { label: "Portal Validation", value: "Strict Blocking (Rejects Return)" },
      ],
      isAiGenerated: false,
    };
  }

  // 5. Invoice Number Format
  if (code === "VAL_INVOICE_NO_FORMAT") {
    return {
      simpleTitle: "Invoice Number: Use Only Letters, Numbers, Hyphens, and Slashes",
      simpleSummary: "Do not use spaces or special symbols like @, #, $, or & in your bill numbers. Only letters (A-Z), numbers (0-9), hyphens (-), and slashes (/) are accepted.",
      whyThisRuleExists: "Rule 46(b) restricts invoice identifiers to safe alphanumeric characters to avoid file errors when uploading monthly returns to the GST common portal.",
      howToComply: "Remove all spaces and special symbols from your invoice numbers. Use only letters, numbers, hyphens, or slashes.",
      keySpecs: [
        { label: "Allowed Characters", value: "A-Z, 0-9, hyphen (-), slash (/)" },
        { label: "Forbidden Characters", value: "Spaces, @, #, $, %, &, *, etc." },
      ],
      isAiGenerated: false,
    };
  }

  // 6. Valid B2B GSTIN
  if (code === "VAL_B2B_GSTIN_FORMAT") {
    return {
      simpleTitle: "Customer GST Number Must Be Exactly 15 Characters",
      simpleSummary: "Every business GST number in India has a strict 15-character structure: 2 state digits, 10 PAN characters, 1 entity digit, 'Z', and 1 checksum letter.",
      whyThisRuleExists: "Under Rules 8 and 46 of the CGST Rules, an invalid GST number means your buyer cannot claim their purchase tax credit (ITC) in GSTR-2B.",
      howToComply: "Double-check the customer's 15-character GSTIN. Ask for their official GST registration certificate if unsure.",
      keySpecs: [
        { label: "Exact Length", value: "15 Alphanumeric Characters" },
        { label: "Structure", value: "2 State + 10 PAN + 1 Entity + Z + 1 Check" },
      ],
      isAiGenerated: false,
    };
  }

  // 7. Blocked ITC (Section 17(5))
  if (code === "ITC_BLOCKED_SEC_17_5" || params.category === "BLOCK_ITC") {
    return {
      simpleTitle: "No Tax Credit on Personal Purchases (Cars, Food, Gifts)",
      simpleSummary: "You cannot claim a tax refund/discount on passenger cars, restaurant food, gym memberships, or free gifts bought for your business.",
      whyThisRuleExists: "Under Section 17(5) of the CGST Act, the government forbids tax deductions on personal enjoyment expenses to prevent tax misuse.",
      howToComply: "When recording purchase bills for these Items, leave the 'ITC Eligible' box unchecked. Treat the GST paid as a business cost rather than a tax credit.",
      keySpecs: [
        { label: "Statutory Section", value: "Section 17(5) of CGST Act 2017" },
        { label: "Blocked Items", value: "Cars, Food, Clubs, Personal Gifts" },
        { label: "Action on Bill", value: "Mark as 'ITC Ineligible'" },
      ],
      isAiGenerated: false,
    };
  }

  // 8. Supreme Court Safari Retreats Ruling
  if (code.includes("SAFARI") || params.category === "COURT_ORDER") {
    return {
      simpleTitle: "Supreme Court: Tax Credit Allowed for Commercial Buildings Built for Rent",
      simpleSummary: "The Supreme Court ruled that businesses constructing shopping malls, office complexes, or warehouses specifically to rent them out can claim GST tax credit on construction costs.",
      whyThisRuleExists: "In Chief Commissioner of CGST v. Safari Retreats Pvt Ltd (2024), the Supreme Court ruled that commercial rental buildings function as productive 'plants' generating taxable rental income.",
      howToComply: "If you build a commercial property to lease or rent out, consult your tax advisor to evaluate claiming ITC on building construction materials under the functionality test.",
      keySpecs: [
        { label: "Court", value: "Supreme Court of India" },
        { label: "Ruling Date", value: "October 2024" },
        { label: "Applies To", value: "Commercial properties built for continuous rental" },
      ],
      isAiGenerated: false,
    };
  }

  // 9. PAN Requirement for ₹2 Lakh
  if (code.includes("PAN") || code === "THRESHOLD_PAN_MANDATORY") {
    return {
      simpleTitle: "Ask for Customer PAN on Bills Over ₹2,00,000",
      simpleSummary: "Whenever a single sales invoice or receipt exceeds ₹2 Lakhs, you must record the customer's 10-digit PAN card number.",
      whyThisRuleExists: "Under Rule 114B of the Income Tax Rules and statutory anti-evasion directives, high-value sales must be linked to the buyer's PAN to prevent black money transactions.",
      howToComply: "Before saving an invoice over ₹2 Lakhs, ask the customer for their 10-character PAN card number and enter it in customer details.",
      keySpecs: [
        { label: "Threshold Amount", value: "₹2,00,000 (Two Lakhs)" },
        { label: "Mandatory Document", value: "Customer 10-Digit PAN" },
      ],
      isAiGenerated: false,
    };
  }

  // 10. E-Invoicing
  if (code.includes("E_INVOICE")) {
    return {
      simpleTitle: "Government E-Invoicing Mandatory if Yearly Sales > ₹5 Crores",
      simpleSummary: "If your business sales crossed ₹5 Crores in any past financial year, you must upload every B2B sales bill to the government portal to generate an official digital QR code (IRN).",
      whyThisRuleExists: "Mandated under CBIC Notification 10/2023 to automate return matching and eliminate fake invoicing for large businesses.",
      howToComply: "Ensure your accounting system is connected to the government E-Invoice portal (IRP) to automatically print the IRN and QR code on B2B invoices.",
      keySpecs: [
        { label: "Sales Threshold", value: "Exceeding ₹5 Crores Annually" },
        { label: "Mandatory Feature", value: "Government IRN & Signed QR Code" },
      ],
      isAiGenerated: false,
    };
  }

  // 11. E-Way Bill
  if (code.includes("E_WAY_BILL")) {
    return {
      simpleTitle: "E-Way Bill Permit Needed Before Moving Goods Over ₹50,000",
      simpleSummary: "Before sending goods worth more than ₹50,000 out for delivery, you must generate an electronic transport permit (E-Way Bill) on the government portal.",
      whyThisRuleExists: "Under Rule 138 of the CGST Rules, tax inspection squads check transport vehicles on highways to ensure goods in transit match reported sales.",
      howToComply: "Log in to the government E-Way Bill portal, enter the invoice number, vehicle number, and transporter ID, and generate the bill before loading goods.",
      keySpecs: [
        { label: "Consignment Value", value: "Over ₹50,000" },
        { label: "When to Generate", value: "Before Goods Leave the Warehouse" },
      ],
      isAiGenerated: false,
    };
  }

  // 12. GSTR-1 Due Date
  if (code === "GSTR1_DUE_MONTHLY") {
    return {
      simpleTitle: "File Monthly Sales Report (GSTR-1) by 11th of Every Month",
      simpleSummary: "Submit your sales invoice list by the 11th of each month so your buyers can see their purchase tax credit in their portal.",
      whyThisRuleExists: "Under Rule 59(1) of the CGST Rules, submitting your sales by the 11th automatically populates your buyers' GSTR-2B by the 14th.",
      howToComply: "Verify all sales invoices from the previous month and file GSTR-1 before midnight on the 11th.",
      keySpecs: [
        { label: "Filing Deadline", value: "11th of the Succeeding Month" },
        { label: "What It Reports", value: "Outward Sales Invoices" },
      ],
      isAiGenerated: false,
    };
  }

  // 13. GSTR-3B Due Date
  if (code === "GSTR3B_DUE_MONTHLY") {
    return {
      simpleTitle: "Pay Tax and File Monthly Return (GSTR-3B) by 20th of Every Month",
      simpleSummary: "Pay your net tax and file the summary return by the 20th of each month to avoid daily late fees and 18% yearly interest.",
      whyThisRuleExists: "Under Rule 61(1) of the CGST Rules, tax collected on sales must be deposited with the government on a monthly basis.",
      howToComply: "Reconcile your sales tax against your purchase tax credit (ITC) and pay any remaining balance before the 20th.",
      keySpecs: [
        { label: "Filing Deadline", value: "20th of the Succeeding Month" },
        { label: "Late Fee Penalty", value: "₹50/day (₹20/day for Nil returns)" },
      ],
      isAiGenerated: false,
    };
  }

  // Default fallback for any other general rule or rate
  return {
    simpleTitle: params.ruleName,
    simpleSummary: params.description || "Statutory Goods and Services Tax compliance directive applicable to Indian registered businesses.",
    whyThisRuleExists: "Mandated under official statutory notifications and directives issued by the Central Board of Indirect Taxes and Customs (CBIC) and the GST Council.",
    howToComply: "Review your invoices, bills, and tax return filings against this statutory requirement to ensure seamless compliance.",
    isAiGenerated: false,
  };
}

