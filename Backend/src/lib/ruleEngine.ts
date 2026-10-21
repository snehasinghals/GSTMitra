import { prisma } from "./db.js";

export interface RuleViolation {
  id?: string;
  ruleCode: string;
  ruleName: string;
  category: string;
  severity: "error" | "warning";
  title?: string;
  message: string;
  why: string;
  howToFix: string;
  officialSource?: string | null;
  field?: string;
  itemIndex?: number;
  recordType?: "invoice" | "bill" | "gstr";
  recordIdentifier?: string;
}

/**
 * Safely resolves a path like "business.stateCode" or "invoice.placeOfSupply" from context
 */
function resolveVar(path: string, ctx: Record<string, any>): any {
  if (!path) return undefined;
  const parts = path.split(".");
  let curr = ctx;
  for (const part of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[part];
  }
  return curr;
}

/**
 * Evaluates declarative problemIf condition tree against context
 */
export function evaluateCondition(cond: any, ctx: Record<string, any>): boolean {
  if (!cond || typeof cond !== "object") return false;

  // Handle boolean primitive directly
  if (typeof cond === "boolean") return cond;

  // Key-based operator
  const keys = Object.keys(cond);
  if (keys.length === 0) return false;
  const op = keys[0];
  const val = cond[op];

  switch (op) {
    case "var": {
      return Boolean(resolveVar(String(val), ctx));
    }
    case "==": {
      const left = resolveValue(val[0], ctx);
      const right = resolveValue(val[1], ctx);
      return String(left ?? "").trim() === String(right ?? "").trim();
    }
    case "!=": {
      const left = resolveValue(val[0], ctx);
      const right = resolveValue(val[1], ctx);
      return String(left ?? "").trim() !== String(right ?? "").trim();
    }
    case ">": {
      const left = Number(resolveValue(val[0], ctx) ?? 0);
      const right = Number(resolveValue(val[1], ctx) ?? 0);
      return left > right;
    }
    case "<": {
      const left = Number(resolveValue(val[0], ctx) ?? 0);
      const right = Number(resolveValue(val[1], ctx) ?? 0);
      return left < right;
    }
    case ">=": {
      const left = Number(resolveValue(val[0], ctx) ?? 0);
      const right = Number(resolveValue(val[1], ctx) ?? 0);
      return left >= right;
    }
    case "<=": {
      const left = Number(resolveValue(val[0], ctx) ?? 0);
      const right = Number(resolveValue(val[1], ctx) ?? 0);
      return left <= right;
    }
    case "and": {
      if (!Array.isArray(val)) return false;
      return val.every((item) => evaluateCondition(item, ctx));
    }
    case "or": {
      if (!Array.isArray(val)) return false;
      return val.some((item) => evaluateCondition(item, ctx));
    }
    case "not": {
      const inner = Array.isArray(val) ? val[0] : val;
      return !evaluateCondition(inner, ctx);
    }
    case "in": {
      const needle = resolveValue(val[0], ctx);
      const haystack = resolveValue(val[1], ctx);
      if (Array.isArray(haystack)) {
        return haystack.includes(needle);
      }
      if (typeof haystack === "string") {
        return haystack.includes(String(needle));
      }
      return false;
    }
    case "not_in": {
      const needle = resolveValue(val[0], ctx);
      const haystack = resolveValue(val[1], ctx);
      if (Array.isArray(haystack)) {
        return !haystack.includes(needle);
      }
      return true;
    }
    case "contains": {
      const str = String(resolveValue(val[0], ctx) ?? "");
      const search = String(resolveValue(val[1], ctx) ?? "");
      return str.toLowerCase().includes(search.toLowerCase());
    }
    case "regex": {
      const pattern = String(val[0]);
      const target = String(resolveValue(val[1], ctx) ?? "");
      try {
        return new RegExp(pattern).test(target);
      } catch {
        return false;
      }
    }
    case "not_regex": {
      const pattern = String(val[0]);
      const target = String(resolveValue(val[1], ctx) ?? "");
      try {
        return !new RegExp(pattern).test(target);
      } catch {
        return false;
      }
    }
    case "length": {
      const v = resolveValue(val[0], ctx);
      return String(v ?? "").length > 0;
    }
    case "trim": {
      const v = resolveValue(val[0], ctx);
      return String(v ?? "").trim().length > 0;
    }
    case "is_empty": {
      const v = resolveValue(val[0], ctx);
      return v === null || v === undefined || String(v).trim() === "";
    }
    default:
      return false;
  }
}

function resolveValue(node: any, ctx: Record<string, any>): any {
  if (node === null || node === undefined) return node;
  if (typeof node !== "object") return node;

  if (node.var !== undefined) {
    return resolveVar(String(node.var), ctx);
  }
  if (node.length !== undefined) {
    const v = resolveValue(node.length[0], ctx);
    return String(v ?? "").length;
  }
  if (node.trim !== undefined) {
    const v = resolveValue(node.trim[0], ctx);
    return String(v ?? "").trim();
  }
  if (node.number !== undefined) {
    return Number(resolveValue(node.number[0], ctx) ?? 0);
  }
  return node;
}

/**
 * Replaces placeholders like "{invoice.invoiceNumber}" with values from ctx
 */
function interpolateMessage(template: string, ctx: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{([\w.]+)\}/g, (_match, path) => {
    const val = resolveVar(path, ctx);
    return val !== undefined && val !== null ? String(val) : "";
  });
}

/**
 * Fetch all active GST rules from database for a specific date.
 * NO HARDCODING: This ensures all rules dynamically come from DB!
 */
export async function getActiveRulesForDate(txDate: Date = new Date(), category?: string) {
  const where: any = {
    status: "ACTIVE",
    effectiveFrom: { lte: txDate },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: txDate } }],
  };

  if (category) {
    where.category = category;
  }

  return prisma.gstRule.findMany({
    where,
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * Validate a sales invoice and its line Items against dynamic rules stored in DB.
 */
export async function validateSalesInvoiceAgainstRules(params: {
  business: { id: string; stateCode: string; stateName?: string; gstin?: string | null };
  invoice: {
    invoiceNumber?: string;
    invoiceDate?: Date | string;
    placeOfSupply?: string;
    supplyType?: string;
    subtotal?: number;
    totalAmount?: number;
    totalCgst?: number;
    totalSgst?: number;
    totalIgst?: number;
    totalCess?: number;
    isReverseCharge?: boolean;
    buyerGstin?: string | null;
    paymentMode?: string | null;
  };
  Items: Array<{
    description: string;
    hsnSacCode?: string | null;
    quantity: number;
    rate: number;
    gstRate: number;
    cessRate?: number;
    taxableValue?: number;
    totalAmount?: number;
  }>;
  customer?: {
    name?: string;
    gstin?: string | null;
    stateCode?: string;
    pan?: string | null;
    registrationType?: string;
  } | null;
}): Promise<RuleViolation[]> {
  const txDate = params.invoice.invoiceDate ? new Date(params.invoice.invoiceDate) : new Date();
  const activeRules = await getActiveRulesForDate(txDate);
  const violations: RuleViolation[] = [];

  // Extract active rates and thresholds from DB
  const rateRules = activeRules.filter((r) => r.category === "RATE");
  const activeRateNumbers = new Set<number>();
  for (const r of rateRules) {
    try {
      const parsed = JSON.parse(r.valueJson);
      if (typeof parsed.rate === "number") activeRateNumbers.add(parsed.rate);
    } catch {}
  }

  // Threshold rules
  const panThresholdRule = activeRules.find((r) => r.ruleCode.includes("PAN") || r.category === "THRESHOLD");
  let panThresholdLimit = 200000; // default fallback if no threshold rule
  if (panThresholdRule) {
    try {
      const parsed = JSON.parse(panThresholdRule.valueJson);
      if (typeof parsed.thresholdAmount === "number") panThresholdLimit = parsed.thresholdAmount;
      else if (typeof parsed.limit === "number") panThresholdLimit = parsed.limit;
    } catch {}
  }

  const effectiveState = params.invoice.placeOfSupply || params.customer?.stateCode || params.business.stateCode;
  const isIntraState = effectiveState === params.business.stateCode;

  // Build full evaluation context
  const invoiceContext = {
    business: params.business,
    invoice: {
      ...params.invoice,
      placeOfSupply: effectiveState,
      ItemsCount: params.Items.length,
      isIntraState,
    },
    customer: {
      ...params.customer,
      gstin: params.invoice.buyerGstin || params.customer?.gstin || null,
    },
  };

  // 1. Evaluate declarative VALIDATION rules from DB
  const validationRules = activeRules.filter((r) => r.category === "VALIDATION" || r.category === "COMPLIANCE");

  for (const rule of validationRules) {
    try {
      const ruleVal = JSON.parse(rule.valueJson);
      const appliesTo = ruleVal.appliesTo || "SALES_INVOICE";

      if (appliesTo === "SALES_INVOICE") {
        if (ruleVal.problemIf && evaluateCondition(ruleVal.problemIf, invoiceContext)) {
          violations.push({
            ruleCode: rule.ruleCode,
            ruleName: rule.ruleName,
            category: rule.category,
            severity: ruleVal.severity || "error",
            title: rule.ruleName,
            message: interpolateMessage(ruleVal.message || rule.description, invoiceContext),
            why: ruleVal.why || rule.description,
            howToFix: ruleVal.howToFix || "Please review and correct the invoice details.",
            officialSource: rule.officialSource,
            field: ruleVal.field,
            recordType: "invoice",
            recordIdentifier: params.invoice.invoiceNumber,
          });
        }
      } else if (appliesTo === "SALES_INVOICE_ITEM") {
        params.Items.forEach((item, idx) => {
          const itemCtx = {
            ...invoiceContext,
            item: {
              ...item,
              hsnSacCode: item.hsnSacCode || "",
              description: item.description || "",
            },
            itemIndex: idx + 1,
          };
          if (ruleVal.problemIf && evaluateCondition(ruleVal.problemIf, itemCtx)) {
            violations.push({
              ruleCode: rule.ruleCode,
              ruleName: rule.ruleName,
              category: rule.category,
              severity: ruleVal.severity || "error",
              title: `${rule.ruleName} (Item #${idx + 1}: ${item.description || "Line item"})`,
              message: interpolateMessage(ruleVal.message || rule.description, itemCtx),
              why: ruleVal.why || rule.description,
              howToFix: ruleVal.howToFix || "Provide the correct value in line item details.",
              officialSource: rule.officialSource,
              field: ruleVal.field || `Items[${idx}]`,
              itemIndex: idx,
              recordType: "invoice",
              recordIdentifier: params.invoice.invoiceNumber,
            });
          }
        });
      }
    } catch (e) {
      console.error(`Error evaluating rule ${rule.ruleCode}:`, e);
    }
  }

  // 2. Validate GST Rates dynamically against active DB rate rules
  if (activeRateNumbers.size > 0) {
    params.Items.forEach((item, idx) => {
      const itemGst = Number(item.gstRate ?? 18);
      if (!activeRateNumbers.has(itemGst)) {
        const activeRatesList = Array.from(activeRateNumbers).sort((a, b) => a - b).join("%, ") + "%";
        violations.push({
          ruleCode: "VAL_DYNAMIC_GST_RATE",
          ruleName: "GST Rate Must Match an Active Statutory Slab",
          category: "RATE",
          severity: "error",
          title: `Item #${idx + 1} GST rate (${itemGst}%) is not an active slab`,
          message: `The GST rate of ${itemGst}% applied to '${item.description}' is not an active tax slab for this transaction date.`,
          why: `According to official GST notifications, the active rate slabs for this date are only [${activeRatesList}]. Applying an invalid rate will lead to tax return rejection on the GST portal.`,
          howToFix: `Select an active GST rate slab for this item (${activeRatesList}).`,
          officialSource: "CBIC GST Rate Notifications",
          field: `Items[${idx}].gstRate`,
          itemIndex: idx,
          recordType: "invoice",
          recordIdentifier: params.invoice.invoiceNumber,
        });
      }
    });
  }

  // 3. Dynamic Threshold check: PAN requirement for high-value sales
  const invoiceTotal = params.invoice.totalAmount ?? (params.Items.reduce((acc, it) => acc + (it.quantity * it.rate), 0));
  if (invoiceTotal >= panThresholdLimit && !params.customer?.pan) {
    violations.push({
      ruleCode: "VAL_THRESHOLD_PAN",
      ruleName: `Mandatory PAN for Transactions Exceeding ₹${panThresholdLimit.toLocaleString("en-IN")}`,
      category: "THRESHOLD",
      severity: "error",
      title: "Customer PAN is Required",
      message: `The invoice total of ₹${invoiceTotal.toLocaleString("en-IN")} exceeds the statutory threshold of ₹${panThresholdLimit.toLocaleString("en-IN")}, requiring the customer's PAN.`,
      why: `Under Rule 114B of the Income Tax Rules and GST compliance directives, quoting the buyer's Permanent Account Number (PAN) is mandatory for high-value commercial transactions.`,
      howToFix: "Enter the customer's valid 10-character PAN number in the customer details section.",
      officialSource: "Rule 114B & High Value Transaction Compliance",
      field: "customer.pan",
      recordType: "invoice",
      recordIdentifier: params.invoice.invoiceNumber,
    });
  }

  return violations;
}

/**
 * Validate a purchase bill against dynamic rules stored in DB.
 */
export async function validatePurchaseBillAgainstRules(params: {
  business: { id: string; stateCode: string; gstin?: string | null };
  bill: {
    billNumber: string;
    billDate?: Date | string;
    placeOfSupply?: string;
    category?: string;
    isReverseCharge?: boolean;
    isItcEligible?: boolean;
    totalAmount?: number;
    totalCgst?: number;
    totalSgst?: number;
    totalIgst?: number;
  };
  Items: Array<{
    description: string;
    hsnSacCode?: string | null;
    quantity: number;
    rate: number;
    gstRate: number;
    isItcEligible?: boolean;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
  }>;
  vendor?: {
    name?: string;
    gstin?: string | null;
    stateCode?: string;
    vendorType?: string;
  } | null;
}): Promise<RuleViolation[]> {
  const txDate = params.bill.billDate ? new Date(params.bill.billDate) : new Date();
  const activeRules = await getActiveRulesForDate(txDate);
  const violations: RuleViolation[] = [];

  // Extract Blocked ITC categories from DB
  const blockedItcRules = activeRules.filter((r) => r.category === "BLOCK_ITC");
  const blockedCodes = new Map<string, string>(); // code -> description
  for (const r of blockedItcRules) {
    try {
      const parsed = JSON.parse(r.valueJson);
      if (Array.isArray(parsed.categories)) {
        for (const cat of parsed.categories) {
          if (cat && cat.code) {
            blockedCodes.set(String(cat.code).toUpperCase(), cat.name || r.ruleName);
          }
        }
      }
    } catch {}
  }

  // Active Rates from DB
  const rateRules = activeRules.filter((r) => r.category === "RATE");
  const activeRateNumbers = new Set<number>();
  for (const r of rateRules) {
    try {
      const parsed = JSON.parse(r.valueJson);
      if (typeof parsed.rate === "number") activeRateNumbers.add(parsed.rate);
    } catch {}
  }

  const effectivePos = params.bill.placeOfSupply || params.business.stateCode;
  const vendorState = params.vendor?.stateCode || effectivePos;
  const isIntraState = vendorState === params.business.stateCode;

  const billContext = {
    business: params.business,
    bill: {
      ...params.bill,
      placeOfSupply: effectivePos,
      isIntraState,
    },
    vendor: params.vendor,
  };

  // 1. Evaluate declarative VALIDATION rules for purchase bill
  const validationRules = activeRules.filter((r) => r.category === "VALIDATION");
  for (const rule of validationRules) {
    try {
      const ruleVal = JSON.parse(rule.valueJson);
      const appliesTo = ruleVal.appliesTo;

      if (appliesTo === "PURCHASE_BILL") {
        if (ruleVal.problemIf && evaluateCondition(ruleVal.problemIf, billContext)) {
          violations.push({
            ruleCode: rule.ruleCode,
            ruleName: rule.ruleName,
            category: rule.category,
            severity: ruleVal.severity || "error",
            title: rule.ruleName,
            message: interpolateMessage(ruleVal.message || rule.description, billContext),
            why: ruleVal.why || rule.description,
            howToFix: ruleVal.howToFix || "Please review and correct the bill details.",
            officialSource: rule.officialSource,
            field: ruleVal.field,
            recordType: "bill",
            recordIdentifier: params.bill.billNumber,
          });
        }
      } else if (appliesTo === "PURCHASE_BILL_ITEM") {
        params.Items.forEach((item, idx) => {
          const itemCtx = {
            ...billContext,
            item,
            itemIndex: idx + 1,
          };
          if (ruleVal.problemIf && evaluateCondition(ruleVal.problemIf, itemCtx)) {
            violations.push({
              ruleCode: rule.ruleCode,
              ruleName: rule.ruleName,
              category: rule.category,
              severity: ruleVal.severity || "error",
              title: `${rule.ruleName} (Item #${idx + 1}: ${item.description})`,
              message: interpolateMessage(ruleVal.message || rule.description, itemCtx),
              why: ruleVal.why || rule.description,
              howToFix: ruleVal.howToFix || "Correct the line item details.",
              officialSource: rule.officialSource,
              field: ruleVal.field || `Items[${idx}]`,
              itemIndex: idx,
              recordType: "bill",
              recordIdentifier: params.bill.billNumber,
            });
          }
        });
      }
    } catch {}
  }

  // 2. Blocked ITC check (Section 17(5)) dynamically checked against DB categories
  const billCategory = (params.bill.category || "").toUpperCase();
  const isClaimingItc = params.bill.isItcEligible !== false;
  if (isClaimingItc && blockedCodes.has(billCategory)) {
    const blockedReason = blockedCodes.get(billCategory);
    violations.push({
      ruleCode: "ITC_BLOCKED_SEC_17_5",
      ruleName: "Blocked Input Tax Credit (Section 17(5))",
      category: "BLOCK_ITC",
      severity: "warning",
      title: `Input Tax Credit is blocked for category '${params.bill.category}'`,
      message: `Input Tax Credit is marked as eligible on this purchase bill, but the category '${params.bill.category}' is classified as blocked credit under Section 17(5).`,
      why: `Under Section 17(5) of the CGST Act 2017: ${blockedReason}. Claiming ITC on blocked categories without statutory exemption invites tax penalties and audit scrutiny.`,
      howToFix: "Uncheck the 'ITC Eligible' box or change the expense classification if an exemption applies.",
      officialSource: "Section 17(5) of CGST Act 2017",
      field: "isItcEligible",
      recordType: "bill",
      recordIdentifier: params.bill.billNumber,
    });
  }

  // 3. Intra/Inter tax matching
  if (params.bill.totalIgst && params.bill.totalIgst > 0 && isIntraState) {
    violations.push({
      ruleCode: "VAL_PURCHASE_IGST_SAME_STATE",
      ruleName: "Intra-State Purchases Prohibit IGST (CGST & SGST Mandatory)",
      category: "VALIDATION",
      severity: "error",
      title: "IGST entered for an in-state supplier bill",
      message: `The supplier is located in your state (${params.business.stateCode}), but IGST was entered on the purchase bill.`,
      why: "Purchases from suppliers within the same state carry CGST and SGST. IGST is valid only on inter-state purchases.",
      howToFix: "Split the tax amount equally into CGST and SGST, or verify the supplier's state code.",
      officialSource: "IGST Act Section 7 & 8",
      field: "totalIgst",
      recordType: "bill",
      recordIdentifier: params.bill.billNumber,
    });
  }

  return violations;
}

/**
 * Validate entire GSTR filing dataset against dynamic DB rules before generation.
 */
export async function validateGstrFilingAgainstRules(params: {
  businessId: string;
  returnType: "GSTR1" | "GSTR3B";
  period: string; // e.g. "102026"
}): Promise<{
  canProceed: boolean;
  violations: RuleViolation[];
  counts: { errors: number; warnings: number };
}> {
  const month = parseInt(params.period.substring(0, 2), 10);
  const year = parseInt(params.period.substring(2, 6), 10);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
  });
  if (!business) throw new Error("Business not found");

  const violations: RuleViolation[] = [];

  if (params.returnType === "GSTR1") {
    // Check sales invoices for the period
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        businessId: params.businessId,
        invoiceDate: { gte: startDate, lt: endDate },
        status: { not: "CANCELLED" },
      },
      include: { customer: true, Items: true },
    });

    for (const inv of invoices) {
      const invViolations = await validateSalesInvoiceAgainstRules({
        business,
        invoice: inv,
        Items: inv.Items,
        customer: inv.customer,
      });
      violations.push(...invViolations);
    }
  } else if (params.returnType === "GSTR3B") {
    // Check purchase bills for blocked ITC and sales invoices for tax matching
    const [invoices, bills] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          businessId: params.businessId,
          invoiceDate: { gte: startDate, lt: endDate },
          status: { not: "CANCELLED" },
        },
        include: { customer: true, Items: true },
      }),
      prisma.purchaseBill.findMany({
        where: {
          businessId: params.businessId,
          billDate: { gte: startDate, lt: endDate },
          receiptStatus: "ACCEPTED",
        },
        include: { vendor: true, Items: true },
      }),
    ]);

    for (const inv of invoices) {
      const invViolations = await validateSalesInvoiceAgainstRules({
        business,
        invoice: inv,
        Items: inv.Items,
        customer: inv.customer,
      });
      violations.push(...invViolations);
    }

    for (const bill of bills) {
      const billViolations = await validatePurchaseBillAgainstRules({
        business,
        bill,
        Items: bill.Items,
        vendor: bill.vendor,
      });
      violations.push(...billViolations);
    }
  }

  const errors = violations.filter((v) => v.severity === "error").length;
  const warnings = violations.filter((v) => v.severity === "warning").length;

  return {
    canProceed: errors === 0,
    violations,
    counts: { errors, warnings },
  };
}
