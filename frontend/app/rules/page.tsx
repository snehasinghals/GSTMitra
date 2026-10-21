"use client";

import React, { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { Tooltip } from "../components/Tooltip";
import {
  Ban,
  BookOpen,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  ExternalLink,
  FileText,
  Gavel,
  Gauge,
  HelpCircle,
  Info,
  Lightbulb,
  Percent,
  Plus,
  Receipt,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

/* ----------------------------- types & helpers ----------------------------- */

type Rule = {
  id: string;
  category: string;
  ruleCode: string;
  ruleName: string;
  valueJson: any;
  effectiveFrom: string;
  effectiveTo?: string | null;
  description?: string | null;
  officialSource?: string | null;
  sourceQuote?: string | null;
  status?: string | null;
  updatedAt?: string | null;
};

type Phase = "current" | "upcoming" | "superseded";

/* ------------------- plain english gst terms dictionary ------------------- */

const GST_GLOSSARY_TERMS: Record<string, { term: string; meaning: string; example?: string }> = {
  "input tax credit": {
    term: "Input Tax Credit (ITC)",
    meaning:
      "The tax you already paid on your business purchases. You subtract this amount from the tax you collect on sales so you only pay the net difference to the government.",
    example: "You bought stock and paid ₹18,000 tax. You owe ₹50,000 tax on sales. With ITC, you pay only ₹32,000.",
  },
  "itc": {
    term: "Input Tax Credit (ITC)",
    meaning:
      "Tax you already paid on your purchases that reduces the final tax bill you pay the government.",
    example: "You paid ₹1,800 tax on inventory. You subtract this ₹1,800 from your customer tax collections.",
  },
  "cgst": {
    term: "Central GST (CGST)",
    meaning:
      "The 50% half of GST that goes to the Central Government of India on local (same-state) sales.",
    example: "On a ₹1,000 sale with 18% tax in Mumbai, ₹90 is CGST (Central Government).",
  },
  "sgst": {
    term: "State GST (SGST)",
    meaning:
      "The 50% half of GST that goes to your State Government on local (same-state) sales.",
    example: "On a ₹1,000 sale with 18% tax in Mumbai, ₹90 is SGST (State Government).",
  },
  "utgst": {
    term: "Union Territory GST (UTGST)",
    meaning:
      "The state tax equivalent for Union Territories without a state legislature (e.g., Chandigarh, Ladakh).",
  },
  "igst": {
    term: "Integrated GST (IGST)",
    meaning:
      "The single combined GST charged when you sell goods or services to a customer in a different state.",
    example: "Selling from Delhi to Bengaluru: instead of splitting, you charge the full 18% as IGST.",
  },
  "hsn": {
    term: "HSN Code",
    meaning:
      "Harmonized System of Nomenclature: An official 4, 6, or 8-digit government code that classifies what product you sold.",
    example: "Code 0902 identifies 'Tea'. Putting 0902 on your bill proves the 5% rate applies.",
  },
  "hsn code": {
    term: "HSN Code",
    meaning:
      "Harmonized System of Nomenclature: An official 4, 6, or 8-digit government code that classifies what product you sold.",
    example: "Code 0902 identifies 'Tea'. Putting 0902 on your bill proves the 5% rate applies.",
  },
  "sac": {
    term: "SAC Code",
    meaning:
      "Services Accounting Code: An official 6-digit code used specifically for services (not physical goods).",
    example: "Code 998313 identifies 'Information Technology & Consulting Services'.",
  },
  "gstin": {
    term: "GSTIN (GST Number)",
    meaning:
      "Goods and Services Tax Identification Number: A unique 15-character official government tax ID for registered businesses.",
    example: "27AAAAA0000A1Z5: 27 is the state, followed by 10 PAN characters, entity code, Z, and check digit.",
  },
  "b2b": {
    term: "B2B (Business-to-Business)",
    meaning:
      "Selling to another registered business that has its own GST number and can claim tax credit.",
    example: "A distributor selling 50 boxes of goods to a shopkeeper who has a GSTIN.",
  },
  "b2c": {
    term: "B2C (Business-to-Consumer)",
    meaning:
      "Selling directly to an everyday shopper or unregistered customer for their own personal use.",
    example: "A customer walks into your store and buys groceries for home use.",
  },
  "intra-state": {
    term: "Intra-State (Same State)",
    meaning: "When both the seller and the buyer are located in the same Indian state. You charge CGST + SGST.",
    example: "A shop in Pune selling to a customer in Mumbai (both in Maharashtra).",
  },
  "inter-state": {
    term: "Inter-State (Different State)",
    meaning: "When the seller and the buyer are in different Indian states. You charge IGST.",
    example: "A shop in Jaipur (Rajasthan) selling to a customer in Ahmedabad (Gujarat).",
  },
  "place of supply": {
    term: "Place of Supply (POS)",
    meaning:
      "The state where the delivery happens. It decides whether you charge CGST + SGST (same state) or IGST (different state).",
    example: "Delivering goods to Haryana means Place of Supply is Haryana.",
  },
  "e-way bill": {
    term: "E-Way Bill",
    meaning:
      "A digital transport permit generated on the government portal before moving goods worth over ₹50,000.",
    example: "Truck transporting ₹70,000 of goods must carry an E-Way Bill slip on the highway.",
  },
  "e-invoicing": {
    term: "E-Invoicing",
    meaning:
      "Uploading B2B invoice details to the government portal (IRP) to get an official digital QR code (IRN).",
    example: "Mandatory for businesses with yearly sales exceeding ₹5 Crores.",
  },
  "e-invoice": {
    term: "E-Invoice",
    meaning: "A B2B invoice verified on the government IRP portal with an official digital QR code and IRN number.",
  },
  "irn": {
    term: "Invoice Reference Number (IRN)",
    meaning: "A unique 64-character digital verification code generated on the government portal for B2B invoices.",
  },
  "turnover": {
    term: "Turnover (Annual Sales)",
    meaning: "Total gross sales of all goods and services made by your business across all branches in a financial year.",
  },
  "gstr-1": {
    term: "GSTR-1 (Sales Report)",
    meaning:
      "The monthly or quarterly tax form where you report details of all sales invoices you issued to customers. Due by the 11th.",
  },
  "gstr-3b": {
    term: "GSTR-3B (Monthly Summary & Payment)",
    meaning:
      "The monthly summary form where you declare total sales tax, subtract purchase tax credits (ITC), and pay any remaining tax. Due by the 20th.",
  },
  "gstr-2b": {
    term: "GSTR-2B (Purchase Credit Statement)",
    meaning:
      "An auto-generated monthly statement on the GST portal showing all purchase bills reported by your suppliers that you can claim credit for.",
  },
  "reverse charge": {
    term: "Reverse Charge (RCM)",
    meaning: "A special rule where the buyer pays the GST directly to the government instead of the seller.",
    example: "Paying a lawyer or goods transport agency (GTA): you pay the GST directly to the tax office.",
  },
  "section 17(5)": {
    term: "Section 17(5) (Blocked Credits)",
    meaning:
      "A specific section in GST law listing expenses where businesses are strictly forbidden from claiming purchase tax credit (ITC).",
    example: "Personal cars, restaurant dining, gym memberships, and staff gifts cannot have tax credit claimed.",
  },
  "section 128a": {
    term: "Section 128A Amnesty",
    meaning:
      "A government relief scheme waiving 100% of interest and penalties on disputed tax notices from 2017 to 2020 if the original tax was paid before 31 March 2025.",
  },
  "pan": {
    term: "Permanent Account Number (PAN)",
    meaning: "A 10-character official tax identity card issued by the Income Tax Department of India.",
  },
};

/**
 * SmartText component that automatically detects hard tax terms and wraps them
 * in an interactive hover tooltip with plain-English definitions and real-world examples.
 */
function SmartText({ text }: { text?: string | null }) {
  if (!text) return null;

  // Build sorted regex pattern (longest terms first to avoid partial word overlaps)
  const termKeys = Object.keys(GST_GLOSSARY_TERMS).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${termKeys.map((k) => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`, "gi");

  const parts = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = pattern.lastIndex;
    const matchedWord = match[0];
    const key = matchedWord.toLowerCase();

    // Push preceding normal text
    if (matchStart > lastIdx) {
      parts.push(text.substring(lastIdx, matchStart));
    }

    const glossaryEntry = GST_GLOSSARY_TERMS[key];
    if (glossaryEntry) {
      parts.push(
        <Tooltip
          key={`${matchStart}-${matchedWord}`}
          term={glossaryEntry.term}
          text={glossaryEntry.meaning}
          example={glossaryEntry.example}
          triggerClassName="font-medium text-slate-800 border-b border-dotted border-blue-500 hover:text-blue-700 hover:bg-blue-50 px-0.5 rounded cursor-help transition-colors"
        >
          {matchedWord}
        </Tooltip>
      );
    } else {
      parts.push(matchedWord);
    }

    lastIdx = matchEnd;
  }

  // Push remaining normal text
  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return <>{parts}</>;
}

/* ----------------------------- categories meta ----------------------------- */

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ElementType; color: string; badgeBg: string; badgeText: string; order: number }
> = {
  RATE: {
    label: "GST Rates",
    icon: Percent,
    color: "text-blue-600",
    badgeBg: "bg-blue-50 border-blue-200",
    badgeText: "text-blue-700",
    order: 1,
  },
  VALIDATION: {
    label: "Invoice & Bill Checks",
    icon: CheckCircle2,
    color: "text-indigo-600",
    badgeBg: "bg-indigo-50 border-indigo-200",
    badgeText: "text-indigo-700",
    order: 2,
  },
  BLOCK_ITC: {
    label: "Blocked Credits (No Tax Refund)",
    icon: Ban,
    color: "text-rose-600",
    badgeBg: "bg-rose-50 border-rose-200",
    badgeText: "text-rose-700",
    order: 3,
  },
  THRESHOLD: {
    label: "Sales Limits & Thresholds",
    icon: Gauge,
    color: "text-amber-600",
    badgeBg: "bg-amber-50 border-amber-200",
    badgeText: "text-amber-800",
    order: 4,
  },
  COURT_ORDER: {
    label: "Supreme Court Rulings",
    icon: Gavel,
    color: "text-purple-600",
    badgeBg: "bg-purple-50 border-purple-200",
    badgeText: "text-purple-700",
    order: 5,
  },
  AMENDMENT: {
    label: "Official Council Amendments",
    icon: RefreshCw,
    color: "text-teal-600",
    badgeBg: "bg-teal-50 border-teal-200",
    badgeText: "text-teal-700",
    order: 6,
  },
  DUE_DATE: {
    label: "Filing Deadlines",
    icon: CalendarClock,
    color: "text-emerald-600",
    badgeBg: "bg-emerald-50 border-emerald-200",
    badgeText: "text-emerald-700",
    order: 7,
  },
  CESS: {
    label: "Compensation Cess",
    icon: Receipt,
    color: "text-orange-600",
    badgeBg: "bg-orange-50 border-orange-200",
    badgeText: "text-orange-700",
    order: 8,
  },
};

const metaFor = (cat: string) =>
  CATEGORY_META[cat] ?? {
    label: cat.replace(/_/g, " "),
    icon: BookOpen,
    color: "text-slate-600",
    badgeBg: "bg-slate-50 border-slate-200",
    badgeText: "text-slate-700",
    order: 99,
  };

const toDate = (s?: string | null) => (s ? new Date(String(s).replace(" ", "T")) : null);

const fmtDate = (s?: string | null) => {
  const d = toDate(s);
  return d && !isNaN(d.getTime())
    ? d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })
    : "";
};

const parseValue = (v: any) => {
  if (typeof v !== "string") return v ?? {};
  try {
    return JSON.parse(v);
  } catch {
    return { value: v };
  }
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const humanize = (k: string) =>
  k
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

function phaseOf(rule: Rule, now: Date): Phase {
  const from = toDate(rule.effectiveFrom);
  const to = toDate(rule.effectiveTo);
  if (from && from > now) return "upcoming";
  if (to && now.getTime() >= to.getTime() + 24 * 60 * 60 * 1000) return "superseded";
  return "current";
}

function searchText(rule: Rule) {
  const v = parseValue(rule.valueJson);
  const rate = typeof v.rate === "number" ? `${v.rate}% ${v.rate} percent` : "";
  return [
    rule.ruleName,
    rule.ruleCode,
    metaFor(rule.category).label,
    rule.category,
    rule.description,
    rule.sourceQuote,
    rule.officialSource,
    rate,
    v.why,
    v.howToFix,
    v.message,
    v.caseTitle,
    v.court,
    v.ruling,
    v.aiExplanation?.simpleSummary,
    v.aiExplanation?.whyThisRuleExists,
    v.aiExplanation?.howToComply,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const sortRules = (a: Rule, b: Rule) => {
  const va = parseValue(a.valueJson);
  const vb = parseValue(b.valueJson);
  if (typeof va.rate === "number" && typeof vb.rate === "number") return va.rate - vb.rate;
  return a.ruleName.localeCompare(b.ruleName);
};

/* --------------------------- source citation link -------------------------- */

function renderOfficialSource(rule: Rule) {
  if (!rule.officialSource) return null;
  const raw = rule.officialSource.trim();
  if (!raw) return null;

  let urlObj: URL | null = null;
  try {
    if (/^https?:\/\//i.test(raw)) {
      urlObj = new URL(raw);
    } else if (/^www\./i.test(raw)) {
      urlObj = new URL(`https://${raw}`);
    }
  } catch {
    urlObj = null;
  }

  if (urlObj) {
    const displayText = rule.sourceQuote?.trim() || urlObj.hostname;
    return (
      <a
        href={urlObj.href}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-900 hover:underline max-w-[280px] truncate"
        title={urlObj.href}
      >
        <FileText className="h-3 w-3 shrink-0 text-blue-500" />
        <span className="truncate">{displayText}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
      </a>
    );
  }

  const displayText = rule.sourceQuote?.trim() || raw;
  return (
    <a
      href={`https://www.google.com/search?q=${encodeURIComponent(raw)}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 px-2.5 py-1 rounded-md text-[11px] transition-colors max-w-[320px] truncate"
      title={`Search official government source: ${raw}`}
    >
      <FileText className="h-3 w-3 shrink-0 text-slate-400" />
      <span className="truncate">{displayText}</span>
      <ExternalLink className="h-2.5 w-2.5 shrink-0 opacity-60" />
    </a>
  );
}

/* ---------------------- unified card detail extractor ---------------------- */

type NormalizedRuleDetails = {
  highlightBadge?: string;
  specs: { label: string; value: string }[];
  whyThisRuleExists: string;
  howToComply: string;
  blockedCategories?: { code: string; name: string }[];
  technicalCondition?: any;
  isAiGenerated?: boolean;
};

function normalizeRuleDetails(rule: Rule): NormalizedRuleDetails {
  const v = parseValue(rule.valueJson);

  // If rule has an AI explanation stored in the database, use it seamlessly!
  if (v.aiExplanation) {
    const ai = v.aiExplanation;
    const cats = Array.isArray(v.categories) ? v.categories : undefined;
    return {
      highlightBadge:
        rule.category === "RATE" && typeof v.rate === "number"
          ? `${v.rate}% Total GST`
          : rule.category === "BLOCK_ITC"
          ? "No Tax Credit"
          : rule.category === "DUE_DATE" && typeof v.dayOfMonth === "number"
          ? `${ordinal(v.dayOfMonth)} of Month`
          : rule.category === "COURT_ORDER"
          ? "Supreme Court"
          : undefined,
      specs: Array.isArray(ai.keySpecs) && ai.keySpecs.length > 0 ? ai.keySpecs : [],
      whyThisRuleExists: ai.whyThisRuleExists || rule.description || "",
      howToComply: ai.howToComply || "",
      blockedCategories: cats,
      technicalCondition: v.problemIf,
      isAiGenerated: !!ai.isAiGenerated,
    };
  }

  // Fallbacks for standard categories
  switch (rule.category) {
    case "RATE": {
      const isRate = typeof v.rate === "number";
      return {
        highlightBadge: isRate ? `${v.rate}% Total GST` : undefined,
        specs: [
          { label: "CGST (Central Tax)", value: isRate ? `${v.cgst}%` : "0%" },
          { label: "SGST (State Tax)", value: isRate ? `${v.sgst}%` : "0%" },
          { label: "IGST (Inter-State Tax)", value: isRate ? `${v.igst}%` : "0%" },
        ],
        whyThisRuleExists:
          rule.sourceQuote ||
          "Mandated under official CBIC rate notifications under Sections 9 and 11 of the CGST Act 2017.",
        howToComply:
          "Map your goods or services to this tax rate. For local (same-state) buyers, split the tax equally into CGST and SGST. For out-of-state buyers, apply the full rate as IGST.",
      };
    }

    case "BLOCK_ITC": {
      const cats = Array.isArray(v.categories) ? v.categories : [];
      return {
        highlightBadge: "No Tax Credit Allowed",
        specs: [
          { label: "Statutory Law", value: "Section 17(5) of CGST Act" },
          { label: "Applies To", value: "Purchase Bills & Expense Claims" },
        ],
        whyThisRuleExists:
          "The government forbids businesses from claiming tax credit on personal enjoyment Items (like cars, restaurant meals, gym memberships) to prevent tax misuse.",
        howToComply:
          "Do not claim tax credit on these expenses. When entering purchase bills for these Items, leave the 'ITC Eligible' box unchecked.",
        blockedCategories: cats,
      };
    }

    case "THRESHOLD": {
      const specs: { label: string; value: string }[] = [];
      let highlight = "Compliance Limit";

      if (typeof v.thresholdAmount === "number") {
        highlight = `₹${v.thresholdAmount.toLocaleString("en-IN")} Limit`;
        specs.push({ label: "Bill Amount Limit", value: `₹${v.thresholdAmount.toLocaleString("en-IN")}` });
        specs.push({ label: "Mandatory Document", value: "Customer 10-Digit PAN Card" });
      } else if (typeof v.consignmentValue === "number") {
        highlight = `₹${v.consignmentValue.toLocaleString("en-IN")} Goods Movement`;
        specs.push({ label: "Consignment Value", value: `₹${v.consignmentValue.toLocaleString("en-IN")}` });
        specs.push({ label: "Required Permit", value: "Government E-Way Bill" });
      } else if (typeof v.aggregateTurnoverThreshold === "number") {
        highlight = `₹${(v.aggregateTurnoverThreshold / 10000000).toFixed(0)} Cr Annual Sales`;
        specs.push({ label: "Annual Sales Limit", value: `₹${(v.aggregateTurnoverThreshold / 10000000).toFixed(0)} Crores` });
        specs.push({ label: "Required Invoice", value: "Official E-Invoice with QR Code" });
      } else if (v.below5CrMinDigits) {
        highlight = `${v.below5CrMinDigits} / ${v.above5CrMinDigits} Product Code Digits`;
        specs.push({ label: "Sales Up to ₹5 Cr", value: `${v.below5CrMinDigits} Digits HSN` });
        specs.push({ label: "Sales Above ₹5 Cr", value: `${v.above5CrMinDigits} Digits HSN` });
      }

      return {
        highlightBadge: highlight,
        specs,
        whyThisRuleExists:
          rule.description ||
          "Mandated under tax anti-evasion directives to track high-value sales and eliminate fake transactions.",
        howToComply:
          v.requirement ||
          "Check your bill total against this limit. If crossed, collect and record the required customer details or generate the official portal permit before dispatching goods.",
      };
    }

    case "COURT_ORDER": {
      return {
        highlightBadge: "Supreme Court",
        specs: [
          { label: "Court Authority", value: v.court || "Supreme Court of India" },
          { label: "Case Name", value: v.caseTitle || rule.ruleName },
          { label: "Order Date", value: v.date ? fmtDate(v.date) : "October 2024" },
        ],
        whyThisRuleExists:
          v.ruling ||
          "The Supreme Court ruled that commercial buildings constructed specifically for continuous leasing or renting qualify as revenue-generating plants, allowing tax deductions.",
        howToComply:
          v.impact ||
          "If your business builds commercial malls or warehouses to rent out, consult your tax advisor to evaluate claiming GST tax credit on construction costs under the functionality test.",
      };
    }

    case "DUE_DATE": {
      const day = typeof v.dayOfMonth === "number" ? ordinal(v.dayOfMonth) : "Due Date";
      return {
        highlightBadge: `${day} of Month`,
        specs: [
          { label: "Filing Deadline", value: `${day} of the next month` },
          { label: "Filing Frequency", value: String(v.frequency || "Monthly") },
          { label: "Late Fee", value: "₹50 per day (₹20 for Nil return)" },
        ],
        whyThisRuleExists:
          "Filing on time allows your buyers to see their purchase tax credit in their GSTR-2B so they can pay their own taxes without dispute.",
        howToComply:
          "Review your sales and purchase bills and submit your return on or before this date to prevent daily late fees and 18% yearly interest.",
      };
    }

    case "VALIDATION": {
      const isStrict = v.severity === "error";
      return {
        highlightBadge: isStrict ? "Strict Check (Blocks Save)" : "Advisory Warning",
        specs: [
          { label: "Applies To", value: humanize(v.appliesTo || "Sales Invoice") },
          { label: "Check Type", value: isStrict ? "Mandatory Validation" : "Advisory Warning" },
          ...(v.field ? [{ label: "Target Field", value: String(v.field) }] : []),
        ],
        whyThisRuleExists:
          v.why ||
          rule.description ||
          "Mandated by statutory tax compliance rules and GST portal verification checks.",
        howToComply:
          v.howToFix ||
          "Review the transaction details and enter the correct statutory values before saving.",
        technicalCondition: v.problemIf,
      };
    }

    case "AMENDMENT":
    default: {
      return {
        highlightBadge: "Council Amendment",
        specs: [
          { label: "Statutory Category", value: "Official Council Amendment" },
          { label: "Status", value: "Active Compliance Directive" },
        ],
        whyThisRuleExists:
          v.details ||
          rule.description ||
          "Official update issued by the GST Council to update tax procedures and relief schemes.",
        howToComply:
          "Apply the updated guidelines to all bills and returns issued on or after the effective date.",
      };
    }
  }
}

/* -------------------- unified, simple, professional card ------------------- */

function UnifiedRuleCard({ rule, phase }: { rule: Rule; phase: Phase }) {
  const [showLogic, setShowLogic] = useState(false);
  const to = fmtDate(rule.effectiveTo);
  const meta = metaFor(rule.category);
  const Icon = meta.icon;

  const details = normalizeRuleDetails(rule);

  return (
    <article className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-all">
      {/* 1. Header Bar: Category, Rule Code, and Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Pill */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border ${meta.badgeBg} ${meta.badgeText}`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{meta.label}</span>
          </span>

          {/* Rule Code */}
          <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
            {rule.ruleCode}
          </span>

          {/* AI Verified badge if enriched by LLM */}
          {details.isAiGenerated && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md"
              title="Explained in plain English using Gemini AI at ingestion time"
            >
              <Sparkles className="h-2.5 w-2.5 text-indigo-600" />
              <span>Plain English Verified</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Key Highlight Metric Badge */}
          {details.highlightBadge && (
            <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-2xs">
              {details.highlightBadge}
            </span>
          )}

          {/* In Force / Upcoming / Superseded Status */}
          <span
            className={
              "rounded-full px-2.5 py-0.5 text-xs font-semibold border " +
              (phase === "current"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : phase === "upcoming"
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-slate-100 text-slate-600 border-slate-200")
            }
          >
            {phase === "current" ? "In Force" : phase === "upcoming" ? "Upcoming" : "Superseded"}
          </span>
        </div>
      </div>

      {/* 2. Rule Title & Plain English Explanation (With Interactive Hover Tooltips) */}
      <div className="pt-3.5">
        <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
          <SmartText text={rule.ruleName} />
        </h3>
        {rule.description && (
          <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed max-w-prose">
            <SmartText text={rule.description} />
          </p>
        )}
      </div>

      {/* 3. Standard Key Specification Row (Uniform across every card) */}
      {details.specs.length > 0 && (
        <div className="mt-3.5 rounded-xl bg-slate-50 border border-slate-200/80 px-4 py-2.5 text-xs flex flex-wrap items-center gap-x-5 gap-y-2">
          {details.specs.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">{item.label}:</span>
              <strong className="text-slate-900 font-semibold">
                <SmartText text={item.value} />
              </strong>
            </div>
          ))}
        </div>
      )}

      {/* 4. Blocked Categories List (Clean 2-column pills for Blocked ITC) */}
      {details.blockedCategories && details.blockedCategories.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="text-xs font-semibold text-slate-700 block">Ineligible Expense Categories:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {details.blockedCategories.map((c) => (
              <div
                key={c.code}
                className="flex items-start gap-2 rounded-lg bg-rose-50/50 border border-rose-100 p-2.5 text-slate-700"
              >
                <Ban className="h-3.5 w-3.5 text-rose-600 mt-0.5 shrink-0" />
                <span className="leading-snug">
                  <SmartText text={c.name} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. The Two Core Information Boxes: (1) Why This Rule Exists, (2) What You Need to Do */}
      <div className="mt-4 grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {/* Why this rule exists */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 mb-1.5">
              <Lightbulb className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Why This Rule Exists (In Simple Words)</span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              <SmartText text={details.whyThisRuleExists} />
            </p>
          </div>
        </div>

        {/* How to comply / Action required */}
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-950 mb-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>What You Need to Do (How to Follow This Rule)</span>
            </div>
            <p className="text-xs leading-relaxed text-emerald-950">
              <SmartText text={details.howToComply} />
            </p>
          </div>
        </div>
      </div>

      {/* Optional technical condition inspector (Only for developers who want to inspect logic) */}
      {details.technicalCondition && (
        <div className="mt-3 pt-1">
          <button
            type="button"
            onClick={() => setShowLogic(!showLogic)}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <Code2 className="h-3 w-3 text-slate-400" />
            <span>{showLogic ? "Hide Technical Engine Logic" : "Inspect Technical Engine Logic"}</span>
            {showLogic ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showLogic && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-900 p-3.5 text-[11px] font-mono text-emerald-400 overflow-x-auto shadow-inner">
              <pre>{JSON.stringify(details.technicalCondition, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* 6. Footer: Effective Date on Left, Official Government Source on Right */}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 pt-3.5 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>
            {phase === "upcoming" ? "Effective From" : "Effective"}{" "}
            <strong className="text-slate-700">{fmtDate(rule.effectiveFrom)}</strong>
            {to ? ` through ${to}` : phase === "current" ? " onwards" : ""}
          </span>
        </div>

        {renderOfficialSource(rule)}
      </footer>
    </article>
  );
}

/* ---------------------------------- page ----------------------------------- */

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [phase, setPhase] = useState<Phase>("current");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [newRule, setNewRule] = useState({
    category: "RATE",
    ruleCode: "",
    ruleName: "",
    description: "",
    effectiveFrom: new Date().toISOString().substring(0, 10),
    officialSource: "",
  });

  const [formConfig, setFormConfig] = useState({
    // RATE
    rate: 18,
    // THRESHOLD
    thresholdAmount: 200000,
    thresholdAction: "MANDATORY_PAN",
    // BLOCK_ITC
    blockedCategory: "MOTOR_VEHICLES",
    allowCommercialException: true,
    // DUE_DATE
    returnType: "GSTR-3B",
    dueDay: 20,
    frequency: "MONTHLY",
    // COURT_ORDER / AMENDMENT / VALIDATION
    keyDecision: "",
    appliesTo: "ALL",
    // Dev Mode
    devMode: false,
    rawJsonOverride: "",
  });

  const getCompiledValueJson = () => {
    if (formConfig.devMode && formConfig.rawJsonOverride.trim()) {
      return formConfig.rawJsonOverride.trim();
    }
    switch (newRule.category) {
      case "RATE": {
        const r = Number(formConfig.rate) || 0;
        return JSON.stringify({
          rate: r,
          cgst: r / 2,
          sgst: r / 2,
          igst: r,
        });
      }
      case "THRESHOLD": {
        return JSON.stringify({
          thresholdAmount: Number(formConfig.thresholdAmount) || 0,
          requirement: formConfig.thresholdAction,
          description: `Mandatory compliance when invoice amount reaches or exceeds ₹${Number(formConfig.thresholdAmount).toLocaleString("en-IN")}`,
        });
      }
      case "BLOCK_ITC": {
        const catMap: Record<string, string> = {
          MOTOR_VEHICLES: "Passenger Motor Vehicles & Conveyances",
          FOOD_BEVERAGES: "Food & Beverages, Catering & Restaurants",
          CLUB_MEMBERSHIPS: "Club Memberships, Health & Fitness Centers",
          GIFTS_FREE_SAMPLES: "Personal Gifts, Free Samples & Lost Goods",
          IMMOVABLE_PROPERTY: "Construction / Works Contract for Immovable Property",
          OTHER_PERSONAL: "Other Non-Business / Personal Expenses",
        };
        return JSON.stringify({
          categories: [
            {
              code: formConfig.blockedCategory,
              name: catMap[formConfig.blockedCategory] || formConfig.blockedCategory,
              exceptionAllowed: formConfig.allowCommercialException,
            },
          ],
        });
      }
      case "DUE_DATE": {
        return JSON.stringify({
          returnType: formConfig.returnType,
          dueDayOfMonth: Number(formConfig.dueDay) || 20,
          frequency: formConfig.frequency,
        });
      }
      case "COURT_ORDER":
      case "AMENDMENT":
      case "VALIDATION":
      default: {
        return JSON.stringify({
          appliesTo: formConfig.appliesTo,
          ruling: formConfig.keyDecision || newRule.description,
          status: "ACTIVE",
        });
      }
    }
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    const res = await apiFetch<{ rules?: Rule[] }>("/rules?includeHistory=true");
    if (res.data) {
      const list = res.data.rules || [];
      setRules(list);
    } else {
      setError(res.error || "Could not load GST rules. Please verify backend connectivity.");
    }
    setLoading(false);
  };

  const handleSyncAmendments = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await apiFetch<any>("/rules/sync-amendments", { method: "POST" });
      if (res.data) {
        setSyncMsg(
          res.data.message ||
            "Rules successfully synchronized from official sources with plain-English AI explanations!"
        );
        await load();
      } else {
        setError(res.error || "Failed to synchronize amendments.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to synchronize amendments.");
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.ruleCode.trim() || !newRule.ruleName.trim()) {
      alert("Rule code and rule name are required.");
      return;
    }
    setSavingRule(true);
    try {
      const compiledJson = getCompiledValueJson();
      const res = await apiFetch<any>("/rules/ingest-amendment", {
        method: "POST",
        body: JSON.stringify({
          category: newRule.category,
          ruleCode: newRule.ruleCode.trim().toUpperCase(),
          ruleName: newRule.ruleName.trim(),
          description: newRule.description.trim(),
          effectiveFrom: newRule.effectiveFrom,
          officialSource: newRule.officialSource.trim(),
          valueJson: compiledJson,
        }),
      });
      if (res.data) {
        setShowAddModal(false);
        setSyncMsg(`Rule "${newRule.ruleName}" was successfully processed by AI and saved to the database!`);
        setNewRule({
          category: "RATE",
          ruleCode: "",
          ruleName: "",
          description: "",
          effectiveFrom: new Date().toISOString().substring(0, 10),
          officialSource: "",
        });
        setFormConfig({
          rate: 18,
          thresholdAmount: 200000,
          thresholdAction: "MANDATORY_PAN",
          blockedCategory: "MOTOR_VEHICLES",
          allowCommercialException: true,
          returnType: "GSTR-3B",
          dueDay: 20,
          frequency: "MONTHLY",
          keyDecision: "",
          appliesTo: "ALL",
          devMode: false,
          rawJsonOverride: "",
        });
        await load();
      } else {
        alert(res.error || "Failed to save rule.");
      }
    } catch (err: any) {
      alert(err.message || "Failed to save rule.");
    } finally {
      setSavingRule(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const now = useMemo(() => new Date(), []);

  const withPhase = useMemo(
    () => rules.map((r) => ({ rule: r, phase: phaseOf(r, now), text: searchText(r) })),
    [rules, now]
  );

  const counts = useMemo(() => {
    const c: Record<Phase, number> = { current: 0, upcoming: 0, superseded: 0 };
    withPhase.forEach((x) => c[x.phase]++);
    return c;
  }, [withPhase]);

  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const searching = terms.length > 0;

  const matches = useMemo(
    () =>
      withPhase.filter(
        (x) => (searching || x.phase === phase) && terms.every((t) => x.text.includes(t))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withPhase, phase, query]
  );

  const categoryCounts = useMemo(() => {
    const c: Record<string, number> = {};
    matches.forEach((x) => (c[x.rule.category] = (c[x.rule.category] || 0) + 1));
    return c;
  }, [matches]);

  const visible = matches.filter((x) => category === "ALL" || x.rule.category === category);

  const grouped = useMemo(() => {
    const g: Record<string, typeof visible> = {};
    visible.forEach((x) => (g[x.rule.category] = [...(g[x.rule.category] || []), x]));
    return Object.entries(g)
      .sort(([a], [b]) => metaFor(a).order - metaFor(b).order)
      .map(([cat, Items]) => [cat, [...Items].sort((a, b) => sortRules(a.rule, b.rule))] as const);
  }, [visible]);

  const tabs: { id: Phase; label: string; hidden?: boolean }[] = [
    { id: "current", label: "In Force" },
    { id: "upcoming", label: "Upcoming", hidden: counts.upcoming === 0 },
    { id: "superseded", label: "Superseded" },
  ];

  return (
    <div className="w-full space-y-6 pb-12">
      {/* Executive Header */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                GST Rules &amp; Statutory Compliance
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Live database of statutory rates, blocked credits, filing thresholds, and legal amendments.
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {rules.length} Statutory Rules Active
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700 border border-blue-200">
              <HelpCircle className="h-3 w-3" />
              Hover on highlighted words for instant meaning
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-slate-600 border border-slate-200">
              Zero Hardcoding • Live DB
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={handleSyncAmendments}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-blue-600 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Syncing Registry..." : "Sync Latest Amendments"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:bg-blue-800 transition whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Rule / Amendment</span>
          </button>
        </div>
      </header>

      {/* Sync Success / Error Notification */}
      {syncMsg && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Check className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{syncMsg}</span>
          </div>
          <button
            onClick={() => setSyncMsg(null)}
            className="text-emerald-500 hover:text-emerald-800 p-1"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by rule name, code, rate, section (e.g., 18%, 17(5), HSN, Safari Retreats)..."
          aria-label="Search GST rules"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 shadow-2xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter and Tab Controls */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-100">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Rule Categories
          </div>

          {/* Phase Tabs: In Force, Upcoming, Superseded */}
          {!searching && (
            <div className="inline-flex shrink-0 self-start sm:self-auto rounded-xl bg-slate-100 p-1 text-xs font-semibold border border-slate-200/60">
              {tabs
                .filter((t) => !t.hidden)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPhase(t.id)}
                    className={
                      "rounded-lg px-3 py-1.5 transition-all " +
                      (phase === t.id ? "bg-white text-slate-900 shadow-2xs font-bold" : "text-slate-500 hover:text-slate-800")
                    }
                  >
                    <span>{t.label}</span>
                    {!loading && !error && (
                      <span className="ml-1.5 text-[11px] font-normal text-slate-400">({counts[t.id]})</span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 items-center" role="tablist" aria-label="Filter by category">
          {loading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-slate-200" />
            ))
          ) : (
            ["ALL", ...Object.keys(categoryCounts).sort((a, b) => metaFor(a).order - metaFor(b).order)].map((c) => {
              const active = category === c;
              const n = c === "ALL" ? matches.length : categoryCounts[c];
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={
                    "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all shrink-0 inline-flex items-center gap-1.5 " +
                    (active
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300")
                  }
                >
                  <span>{c === "ALL" ? "All Categories" : metaFor(c).label}</span>
                  <span className={"text-[11px] tabular-nums " + (active ? "text-slate-300" : "text-slate-400")}>({n})</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {searching && (
        <p className="text-xs text-slate-500">
          Showing {visible.length} matching rule{visible.length === 1 ? "" : "s"} for query “{query.trim()}”.
        </p>
      )}

      {/* Rules Content */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-800">{error}</p>
          <button
            onClick={load}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
            <BookOpen className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {rules.length === 0 ? "No GST rules are loaded yet" : "No matching rules found"}
          </h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {rules.length === 0
              ? "Click 'Sync Latest Amendments' above to populate the statutory rules from official sources."
              : "Try adjusting your search terms or clearing the selected category filters."}
          </p>
          {(query || category !== "ALL") && (
            <button
              onClick={() => {
                setQuery("");
                setCategory("ALL");
              }}
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
            >
              <span>Reset Search and Filters</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {grouped.map(([cat, Items]) => {
            const Icon = metaFor(cat).icon;
            return (
              <section key={cat} aria-labelledby={`h-${cat}`}>
                <div className="mb-4 flex items-center justify-between border-b border-slate-200/80 pb-2.5">
                  <h2 id={`h-${cat}`} className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Icon className={`h-4 w-4 ${metaFor(cat).color}`} />
                    <span>{metaFor(cat).label}</span>
                    <span className="text-xs font-normal text-slate-400">({Items.length})</span>
                  </h2>
                </div>

                <div className="space-y-4">
                  {Items.map(({ rule, phase: p }) => (
                    <UnifiedRuleCard key={rule.id} rule={rule} phase={p} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Statutory Disclaimer Footer */}
      <footer className="pt-6 border-t border-slate-200 text-center text-xs text-slate-400 space-y-1">
        <p>
          Statutory compliance rules are dynamically synchronized with official Central Board of Indirect Taxes and Customs
          (CBIC) notifications and the GST Council repository.
        </p>
        <p>
          For specific legal interpretations or disputed tax audits, consult the official gazette notifications on{" "}
          <a
            href="https://cbic-gst.gov.in"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
          >
            <span>cbic-gst.gov.in</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
          .
        </p>
      </footer>

      {/* Add / Ingest Amendment Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between border-b pb-3.5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Add GST Rule or Amendment</h2>
                <p className="text-xs text-slate-500">
                  Store a dynamic statutory rule, threshold, or court order into the database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={newRule.category}
                    onChange={(e) => setNewRule({ ...newRule, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 font-medium text-slate-800 bg-white"
                  >
                    <option value="AMENDMENT">Council Amendment</option>
                    <option value="COURT_ORDER">Court Order / Judicial Ruling</option>
                    <option value="RATE">GST Rate Slab</option>
                    <option value="VALIDATION">Invoice &amp; Bill Validation</option>
                    <option value="BLOCK_ITC">Blocked Credit (Sec 17(5))</option>
                    <option value="THRESHOLD">Compliance Threshold</option>
                    <option value="DUE_DATE">Return Deadline</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rule Code (Unique Identifier)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. AMEND_2026_NOTIF_05"
                    value={newRule.ruleCode}
                    onChange={(e) => setNewRule({ ...newRule, ruleCode: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 font-mono uppercase text-slate-800 placeholder:normal-case"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rule Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mandatory Reverse Charge on Specified Transport Supplies"
                  value={newRule.ruleName}
                  onChange={(e) => setNewRule({ ...newRule, ruleName: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description / Summary</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain the background, statutory rationale, and business applicability clearly in English..."
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-800"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Effective Date</label>
                  <input
                    type="date"
                    required
                    value={newRule.effectiveFrom}
                    onChange={(e) => setNewRule({ ...newRule, effectiveFrom: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Official Legal Source / Citation</label>
                  <input
                    type="text"
                    placeholder="e.g. CBIC Notification No. 12/2024 or Supreme Court Order"
                    value={newRule.officialSource}
                    onChange={(e) => setNewRule({ ...newRule, officialSource: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 p-2.5 text-slate-800"
                  />
                </div>
              </div>

              {/* Dynamic Category-Specific Configuration UI (Zero JSON required) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5 text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                    Rule Configuration &amp; Specifications
                  </span>
                  <span className="text-[11px] text-slate-500">No coding or JSON needed</span>
                </div>

                {/* RATE Slab */}
                {newRule.category === "RATE" && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">GST Tax Rate Percentage (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        required
                        value={formConfig.rate}
                        onChange={(e) => setFormConfig({ ...formConfig, rate: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 p-2.5 bg-white font-semibold text-slate-900"
                      />
                    </div>
                    {/* Quick rate presets */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Standard Slabs:</span>
                      {[0, 5, 12, 18, 28, 40].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setFormConfig({ ...formConfig, rate: r })}
                          className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                            formConfig.rate === r
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                    {/* Live tax breakup preview */}
                    <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <p className="text-[10px] text-slate-500 font-medium">CGST (Center)</p>
                        <p className="text-xs font-bold text-blue-700">{formConfig.rate / 2}%</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <p className="text-[10px] text-slate-500 font-medium">SGST (State)</p>
                        <p className="text-xs font-bold text-blue-700">{formConfig.rate / 2}%</p>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-200">
                        <p className="text-[10px] text-slate-500 font-medium">IGST (Inter-State)</p>
                        <p className="text-xs font-bold text-indigo-700">{formConfig.rate}%</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* THRESHOLD Limit */}
                {newRule.category === "THRESHOLD" && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Monetary Limit / Threshold Amount (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        required
                        value={formConfig.thresholdAmount}
                        onChange={(e) => setFormConfig({ ...formConfig, thresholdAmount: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 p-2.5 bg-white font-semibold text-slate-900"
                      />
                    </div>
                    {/* Quick amount buttons */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Quick Limits:</span>
                      {[
                        { label: "₹50,000", val: 50000 },
                        { label: "₹2 Lakh", val: 200000 },
                        { label: "₹20 Lakh", val: 2000000 },
                        { label: "₹40 Lakh", val: 4000000 },
                        { label: "₹5 Crore", val: 50000000 },
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setFormConfig({ ...formConfig, thresholdAmount: item.val })}
                          className={`px-2 py-0.5 rounded text-xs font-medium border transition ${
                            formConfig.thresholdAmount === item.val
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">What action is mandatory when limit is crossed?</label>
                      <select
                        value={formConfig.thresholdAction}
                        onChange={(e) => setFormConfig({ ...formConfig, thresholdAction: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
                      >
                        <option value="MANDATORY_PAN">Quoting Customer PAN is Mandatory (Rule 114B)</option>
                        <option value="EWAY_BILL">Mandatory E-Way Bill Generation (Movement of Goods)</option>
                        <option value="MANDATORY_REGISTRATION">Mandatory GST Registration Threshold</option>
                        <option value="EINVOICING">Mandatory E-Invoicing on IRP Portal</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* BLOCK_ITC */}
                {newRule.category === "BLOCK_ITC" && (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Which purchase expense is blocked from tax credit?</label>
                      <select
                        value={formConfig.blockedCategory}
                        onChange={(e) => setFormConfig({ ...formConfig, blockedCategory: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
                      >
                        <option value="MOTOR_VEHICLES">Passenger Motor Vehicles &amp; Conveyances</option>
                        <option value="FOOD_BEVERAGES">Food &amp; Beverages, Catering &amp; Restaurants</option>
                        <option value="CLUB_MEMBERSHIPS">Club Memberships, Health &amp; Fitness</option>
                        <option value="GIFTS_FREE_SAMPLES">Personal Gifts, Free Samples &amp; Lost Goods</option>
                        <option value="IMMOVABLE_PROPERTY">Construction / Works Contract for Immovable Property</option>
                        <option value="OTHER_PERSONAL">Other Non-Business / Personal Expenses</option>
                      </select>
                    </div>
                    <label className="flex items-start gap-2 pt-1 text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formConfig.allowCommercialException}
                        onChange={(e) => setFormConfig({ ...formConfig, allowCommercialException: e.target.checked })}
                        className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <strong>Allow Statutory Commercial Exception</strong> (e.g. credit allowed if vehicles are used for a driving school or passenger transport business).
                      </span>
                    </label>
                  </div>
                )}

                {/* DUE_DATE */}
                {newRule.category === "DUE_DATE" && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Return Form</label>
                      <select
                        value={formConfig.returnType}
                        onChange={(e) => setFormConfig({ ...formConfig, returnType: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
                      >
                        <option value="GSTR-1">GSTR-1 (Sales)</option>
                        <option value="GSTR-3B">GSTR-3B (Summary)</option>
                        <option value="CMP-08">CMP-08 (Composition)</option>
                        <option value="GSTR-9">GSTR-9 (Annual)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Due Day of Month</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        required
                        value={formConfig.dueDay}
                        onChange={(e) => setFormConfig({ ...formConfig, dueDay: Number(e.target.value) })}
                        className="w-full rounded-xl border border-slate-300 p-2 bg-white font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700 mb-1">Filing Frequency</label>
                      <select
                        value={formConfig.frequency}
                        onChange={(e) => setFormConfig({ ...formConfig, frequency: e.target.value })}
                        className="w-full rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="ANNUAL">Annual</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* COURT_ORDER, AMENDMENT, VALIDATION */}
                {newRule.category !== "RATE" &&
                  newRule.category !== "THRESHOLD" &&
                  newRule.category !== "BLOCK_ITC" &&
                  newRule.category !== "DUE_DATE" && (
                    <div className="space-y-2.5">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Key Ruling / Statutory Decision (Plain English)</label>
                        <textarea
                          rows={2}
                          placeholder="e.g. Allows ITC on construction materials when the building is used for earning taxable commercial lease income."
                          value={formConfig.keyDecision}
                          onChange={(e) => setFormConfig({ ...formConfig, keyDecision: e.target.value })}
                          className="w-full rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Where does this rule apply?</label>
                        <select
                          value={formConfig.appliesTo}
                          onChange={(e) => setFormConfig({ ...formConfig, appliesTo: e.target.value })}
                          className="w-full rounded-xl border border-slate-300 p-2 bg-white text-slate-800"
                        >
                          <option value="ALL">All Commercial Transactions &amp; Returns</option>
                          <option value="SALES_INVOICE">Sales Invoices Only</option>
                          <option value="PURCHASE_BILL">Purchase Bills &amp; Vendor Expenses Only</option>
                        </select>
                      </div>
                    </div>
                  )}

                {/* Developer Mode Toggle */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setFormConfig({ ...formConfig, devMode: !formConfig.devMode })}
                    className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium transition cursor-pointer"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>{formConfig.devMode ? "Hide Advanced JSON Editor" : "Advanced: View / Edit Raw JSON"}</span>
                  </button>
                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Auto-packaged for AI
                  </span>
                </div>

                {formConfig.devMode && (
                  <div className="mt-2 space-y-1">
                    <textarea
                      rows={3}
                      value={formConfig.rawJsonOverride || getCompiledValueJson()}
                      onChange={(e) => setFormConfig({ ...formConfig, rawJsonOverride: e.target.value })}
                      className="w-full rounded-xl border border-slate-300 p-2 font-mono text-xs text-slate-800 bg-white"
                      placeholder="Custom JSON configuration..."
                    />
                    <p className="text-[10px] text-slate-400">
                      Power-user override. Leaving this as generated uses the smart form fields above.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRule}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {savingRule ? "Processing with AI..." : "Save Rule to Database"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
