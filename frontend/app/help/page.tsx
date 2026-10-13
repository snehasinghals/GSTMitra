"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  HelpCircle,
  BookOpen,
  Search,
  ArrowLeft,
  ArrowRight,
  Calculator,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
  Rocket,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { Tooltip } from "../components/Tooltip";

/* =========================================================================
   1. GLOSSARY DATA
   ========================================================================= */

type GlossaryCategory = "credit" | "filing" | "tax-type" | "codes" | "rules";

interface GlossaryItem {
  id: string;
  term: string;
  shortForm: string;
  category: GlossaryCategory;
  meaning: string;
  example: string;
  linkHref?: string;
  linkLabel?: string;
}

const GLOSSARY_CATEGORIES: { id: "all" | GlossaryCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "credit", label: "Tax & Credit" },
  { id: "filing", label: "Returns" },
  { id: "tax-type", label: "Tax Types" },
  { id: "codes", label: "Codes & Bills" },
  { id: "rules", label: "Rules" },
];

const GLOSSARY_DATA: GlossaryItem[] = [
  {
    id: "itc",
    term: "Input Tax Credit",
    shortForm: "ITC",
    category: "credit",
    meaning:
      "When you buy things for your business, you pay GST to the seller. ITC lets you subtract that GST from the GST you have to pay the government. It is not a refund. It just reduces your bill.",
    example:
      "You buy a laptop for your business and pay ₹18,000 GST. This month you have to pay ₹50,000 GST to the government. With ITC, you pay only ₹32,000.",
    linkHref: "/purchases",
    linkLabel: "Record purchases",
  },
  {
    id: "output-tax",
    term: "Output GST",
    shortForm: "GST you collect",
    category: "credit",
    meaning:
      "The GST you add to your customer's bill. This money is not yours. You collect it for the government and pass it on, after subtracting your ITC.",
    example:
      "You sell goods for ₹1,00,000 and add 18% GST. The customer pays ₹1,18,000. The extra ₹18,000 is the GST you collected for the government.",
    linkHref: "/sales",
    linkLabel: "View sales",
  },
  {
    id: "net-tax",
    term: "Net Tax Payable",
    shortForm: "Amount to pay",
    category: "credit",
    meaning:
      "The final GST amount you pay the government. It is the GST you collected from customers minus the ITC (the GST you already paid on your purchases).",
    example:
      "You collected ₹20,000 GST from customers and already paid ₹15,000 GST on purchases. You pay only ₹5,000.",
    linkHref: "/gst-filing/gstr3b",
    linkLabel: "Open GSTR-3B",
  },
  {
    id: "blocked-itc",
    term: "Blocked Credit",
    shortForm: "Section 17(5)",
    category: "credit",
    meaning:
      "For some purchases, the government does not allow ITC, even though you paid GST. These are mostly things that look personal, like restaurant food, club memberships or personal items.",
    example:
      "You pay a restaurant bill of ₹3,000 and ₹150 of it is GST. You cannot subtract this ₹150 from the GST you pay. It stays as your cost.",
    linkHref: "/purchases",
    linkLabel: "Manage expenses",
  },
  {
    id: "rcm",
    term: "Reverse Charge",
    shortForm: "RCM",
    category: "rules",
    meaning:
      "Normally the seller collects GST from you and pays it to the government. In some special cases the rule is reversed: you pay the GST to the government yourself.",
    example:
      "You hire a lawyer for your business and pay ₹10,000. The lawyer does not charge GST. You have to pay 18% GST (₹1,800) to the government yourself.",
    linkHref: "/rules",
    linkLabel: "See GST rules",
  },
  {
    id: "gstr1",
    term: "GSTR-1",
    shortForm: "Sales report",
    category: "filing",
    meaning:
      "A monthly list of all the bills you gave to your customers. It is only a report, so you pay no money with it. Due by the 11th of the next month.",
    example:
      "In August you sold to 3 customers. You list those 3 bills and the GST on them in GSTR-1, and submit it by 11 September.",
    linkHref: "/gst-filing/gstr1",
    linkLabel: "Open GSTR-1",
  },
  {
    id: "gstr2b",
    term: "GSTR-2B",
    shortForm: "Purchase check",
    category: "filing",
    meaning:
      "A list the GST portal makes for you every month. It shows which of your purchase bills your suppliers have reported to the government. You can usually claim ITC only on the bills shown here.",
    example:
      "A supplier gave you a bill with ₹1,800 GST, but did not report it. It is missing from your GSTR-2B, so you cannot claim that ₹1,800 ITC yet.",
    linkHref: "/gst-filing/gstr2b",
    linkLabel: "Open GSTR-2B",
  },
  {
    id: "gstr3b",
    term: "GSTR-3B",
    shortForm: "Monthly summary + payment",
    category: "filing",
    meaning:
      "A monthly form where you add up your GST on sales, subtract your ITC, and pay what is left. Due by the 20th of the next month.",
    example:
      "GST on sales is ₹20,000 and your ITC is ₹15,000. You pay the remaining ₹5,000 and submit the form.",
    linkHref: "/gst-filing/gstr3b",
    linkLabel: "Open GSTR-3B",
  },
  {
    id: "nil-return",
    term: "Nil Return",
    shortForm: "Nothing happened",
    category: "filing",
    meaning:
      "Even if you did no business this month (no sales, no purchases), you must still tell the government \"nothing happened\". It is quick and easy.",
    example:
      "You had no business in August. You still file a Nil return. If you skip it, a late fee is added every day.",
    linkHref: "/gst-filing",
    linkLabel: "Go to filing",
  },
  {
    id: "intra-state",
    term: "Same-State Sale",
    shortForm: "CGST + SGST",
    category: "tax-type",
    meaning:
      "When you sell to a customer in the same state as you, the GST is split into two equal halves. One half (CGST) goes to the central government and the other half (SGST) goes to the state government.",
    example:
      "A shop in Mumbai sells to a customer in Pune for ₹1,000 with 18% GST. The customer pays ₹90 CGST + ₹90 SGST, so ₹180 GST in total.",
    linkHref: "/sales",
    linkLabel: "Create invoice",
  },
  {
    id: "inter-state",
    term: "Different-State Sale",
    shortForm: "IGST",
    category: "tax-type",
    meaning:
      "When you sell to a customer in a different state, there is no split. You charge one single tax called IGST.",
    example:
      "A shop in Delhi sells to a customer in Bengaluru for ₹1,000 with 18% GST. The customer pays one tax of ₹180 as IGST.",
    linkHref: "/sales",
    linkLabel: "Create invoice",
  },
  {
    id: "pos",
    term: "Place of Supply",
    shortForm: "POS",
    category: "tax-type",
    meaning:
      "The state where the sale is treated as happening. For goods, it is usually the state where the goods are delivered. It decides whether you charge CGST + SGST or IGST.",
    example:
      "You are in Delhi but deliver goods to Pune. The place of supply is Maharashtra, so you charge IGST.",
    linkHref: "/sales",
    linkLabel: "Invoice details",
  },
  {
    id: "gstin",
    term: "GSTIN",
    shortForm: "Your GST number",
    category: "codes",
    meaning:
      "Your business's 15-character GST number, a bit like an Aadhaar number for your business. You must show it on your bills. The first 2 digits tell which state you are in.",
    example: "27AAAAA0000A1Z5 starts with 27, which means Maharashtra.",
    linkHref: "/onboarding",
    linkLabel: "Check profile",
  },
  {
    id: "hsn-sac",
    term: "HSN & SAC Codes",
    shortForm: "Item codes",
    category: "codes",
    meaning:
      "Number codes that tell what you sell. HSN is for products, SAC is for services. The code decides which GST rate you charge.",
    example:
      "Laptops have HSN 8471 (18% GST). IT consulting has SAC 9983 (18% GST).",
    linkHref: "/items",
    linkLabel: "Item catalog",
  },
  {
    id: "credit-note",
    term: "Credit Note",
    shortForm: "Reverse bill",
    category: "codes",
    meaning:
      "A bill in reverse. You give it to a customer when they return goods or when you reduce the price after billing. It reduces the GST you have to pay.",
    example:
      "A customer returns damaged goods worth ₹5,000 plus ₹900 GST. You issue a credit note and the GST you have to pay goes down by ₹900.",
    linkHref: "/sales",
    linkLabel: "Sales invoices",
  },
  {
    id: "composition",
    term: "Composition Scheme",
    shortForm: "Simple flat tax",
    category: "rules",
    meaning:
      "An easy option for small businesses (yearly sales up to ₹1.5 crore for goods). You pay a small flat percentage of your sales (like 1% for shops) and file fewer returns. In return, you cannot charge GST on your bills, cannot claim ITC, and cannot sell to other states.",
    example:
      "A small shop sells goods worth ₹10,00,000 in 3 months. At 1%, it pays ₹10,000 tax for that quarter. It does not add GST to its bills.",
    linkHref: "/rules",
    linkLabel: "Explore rules",
  },
  {
    id: "eway-bill",
    term: "E-Way Bill",
    shortForm: "Transport permit",
    category: "codes",
    meaning:
      "An online permit you must make before moving goods worth more than ₹50,000. The driver must carry it in case someone checks the vehicle.",
    example:
      "You send ₹80,000 worth of goods by truck. Make an e-way bill first, or the vehicle can be stopped and you can be fined.",
    linkHref: "/sales",
    linkLabel: "Sales invoices",
  },
];

/* =========================================================================
   2. GUIDANCE DATA & HELPERS
   ========================================================================= */

const GUIDANCE_TABS = [
  { id: "basics", label: "GST Basics", icon: BookOpen },
  { id: "need", label: "Do I Need GST?", icon: UserCheck },
  { id: "register", label: "Get GST Number", icon: Rocket },
  { id: "file", label: "Bill & File", icon: CalendarDays },
  { id: "safe", label: "Avoid Trouble", icon: ShieldAlert },
  { id: "practice", label: "Calculator & FAQs", icon: Calculator },
] as const;

type GuidanceTabId = (typeof GUIDANCE_TABS)[number]["id"];
type EntityId = "proprietor" | "partnership" | "company";
type BizType = "goods" | "services" | "both";

/*
 * Registration limits (Section 22 CGST Act, Notification 10/2017-CT and 10/2019-CT).
 *  - Only a person supplying EXCLUSIVELY goods gets the "goods" limit.
 *  - Services, or goods + services, use the "services" limit.
 *  - States not listed below: goods 40 lakh, services 20 lakh.
 *  - Re-verify on cbic-gst.gov.in / gst.gov.in whenever the GST Council changes these.
 */
type LimitGroup = { goods: number; services: number };
const DEFAULT_LIMITS: LimitGroup = { goods: 40, services: 20 };
const SPECIAL_STATES: Record<string, LimitGroup> = {
  "Arunachal Pradesh": { goods: 20, services: 20 },
  Manipur: { goods: 20, services: 10 },
  Meghalaya: { goods: 20, services: 20 },
  Mizoram: { goods: 20, services: 10 },
  Nagaland: { goods: 20, services: 10 },
  Puducherry: { goods: 20, services: 20 },
  Sikkim: { goods: 20, services: 20 },
  Telangana: { goods: 20, services: 20 },
  Tripura: { goods: 20, services: 10 },
  Uttarakhand: { goods: 20, services: 20 },
};
const OTHER_STATE = "Any other state or UT";

const DOCS: Record<EntityId, { label: string; items: string[] }> = {
  proprietor: {
    label: "Individual / Proprietor",
    items: [
      "PAN and Aadhaar (mobile linked)",
      "Your photo",
      "Business address proof (electricity bill, or rent agreement + owner NOC)",
      "Bank proof (cancelled cheque or passbook first page)",
    ],
  },
  partnership: {
    label: "Partnership",
    items: [
      "Firm PAN and partnership deed",
      "PAN, Aadhaar and photo of all partners",
      "Address proof (electricity bill, or rent agreement + NOC)",
      "Bank proof of the firm",
    ],
  },
  company: {
    label: "LLP / Company",
    items: [
      "PAN and incorporation certificate",
      "PAN, Aadhaar and photo of directors or partners",
      "Authorised signatory proof (board resolution or authorisation letter)",
      "Address proof and bank proof",
      "Digital Signature Certificate (DSC)",
    ],
  },
};

const REGISTER_STEPS = [
  { t: "Open gst.gov.in", d: "Services > Registration > New Registration. There is no government fee. Use only this site." },
  { t: "Fill Part A", d: "Enter PAN, mobile and email, then the 2 OTPs. You get a TRN." },
  { t: "Fill Part B", d: "Enter your TRN, fill the sections and upload documents." },
  { t: "Verify and submit", d: "Verify with Aadhaar e-Sign or EVC (OTP). Companies and LLPs must use DSC. You get an ARN." },
  { t: "Track status", d: "Use your ARN. Approval is usually within 7 working days, or 3 working days under the simplified scheme. The officer may ask for more details." },
  { t: "Download certificate", d: "Your GSTIN is ready. Add bank details on the portal within 30 days of registration, or before you file your first GSTR-1, whichever is earlier." },
];

const FAQS = [
  { q: "Do I need a CA to file GST?", a: "For a small business with simple sales, not necessarily. You can do it yourself with GSTMitra and the portal. Ask a CA if you get a notice or your case is complex." },
  { q: "What does registration cost?", a: "The government charges nothing on gst.gov.in. Beware of agents who charge a fee." },
  { q: "No sales this month. Must I file?", a: "Yes. Once registered, file a Nil return before the due date." },
  { q: "Can I charge GST before I get my GSTIN?", a: "No. Only a registered person can collect GST from customers." },
  { q: "What are the GST rates now?", a: "The GST Council's September 2025 FAQ describes the revised rate structure effective 22 September 2025. Broad rate slabs do not determine an item's rate: check its HSN/SAC entry and the applicable CBIC notification. See GST Rules & Rates for source-linked references." },
];

const RATES = [0, 5, 18, 40];
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      {children}
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// Hides extra details so the page stays short
function More({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-3 text-left flex items-center justify-between gap-4 bg-slate-50/80 hover:bg-slate-100/80 transition-colors"
      >
        <span className="text-xs font-bold text-slate-800">{title}</span>
        <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="p-3 bg-white border-t border-slate-200 text-xs text-slate-600 space-y-1.5">{children}</div>}
    </div>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-xl transition-all"
    >
      <span>{label}</span>
      <ArrowRight className="w-3 h-3" />
    </Link>
  );
}

/* =========================================================================
   3. TAB 1: BEGINNER GUIDE COMPONENT (new UI)
   ========================================================================= */

function BeginnerGuideView() {
  const [tab, setTab] = useState<GuidanceTabId>("basics");
  const tabIndex = GUIDANCE_TABS.findIndex((t) => t.id === tab);
  const goTo = (i: number) => {
    setTab(GUIDANCE_TABS[i].id);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Do I need GST?
  const [bizType, setBizType] = useState<BizType>("goods");
  const [stateName, setStateName] = useState<string>(OTHER_STATE);
  const [turnover, setTurnover] = useState<number>(10); // in lakh, per financial year
  const [interState, setInterState] = useState(false);
  const [ecom, setEcom] = useState(false);

  const sellsGoods = bizType !== "services";
  const limits = SPECIAL_STATES[stateName] ?? DEFAULT_LIMITS;
  // Only a pure goods seller gets the goods limit. Services or mixed use the services limit.
  const limit = bizType === "goods" ? limits.goods : limits.services;

  const reasons: string[] = [];
  if (turnover > limit) {
    reasons.push(`Your yearly sales of ${turnover} lakh are above the ${limit} lakh limit for you.`);
  }
  if (sellsGoods && interState) {
    reasons.push("You sell goods to other states. This needs GST registration from your first sale, whatever your sales.");
  }
  const mustRegister = reasons.length > 0;
  const nearLimit = !mustRegister && turnover >= limit * 0.75;
  const ecomNote = !mustRegister && sellsGoods && ecom;

  // Documents
  const [entity, setEntity] = useState<EntityId>("proprietor");
  const [docChecked, setDocChecked] = useState<Record<string, boolean>>({});
  const toggleDoc = (k: string) => setDocChecked((p) => ({ ...p, [k]: !p[k] }));

  // Calculator
  const [sales, setSales] = useState(100000);
  const [salesRate, setSalesRate] = useState(18);
  const [purchases, setPurchases] = useState(60000);
  const [purchaseRate, setPurchaseRate] = useState(18);
  const outputTax = Math.round((sales * salesRate) / 100);
  const itc = Math.round((purchases * purchaseRate) / 100);
  const netPayable = Math.max(0, outputTax - itc);
  const excessItc = Math.max(0, itc - outputTax);

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      {/* Step nav */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {GUIDANCE_TABS.map((t, i) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => goTo(i)}
              className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-bold transition-all ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span className={`w-5 h-5 rounded-full text-3xs flex items-center justify-center ${active ? "bg-white/25" : "bg-slate-200 text-slate-700"}`}>
                {i + 1}
              </span>
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. BASICS */}
      {tab === "basics" && (
        <div className="space-y-4 animate-fadeIn">
          <Card>
            <Heading
              title="GST in 30 seconds"
              sub="You collect GST from customers, subtract the GST you paid on purchases, and pay only the rest."
            />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <p className="text-3xs font-extrabold uppercase text-amber-800">You buy</p>
                <p className="text-xs font-bold text-slate-900 mt-1">Rs 100 + 18 GST</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <p className="text-3xs font-extrabold uppercase text-blue-800">You sell</p>
                <p className="text-xs font-bold text-slate-900 mt-1">Rs 200 + 36 GST</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-3xs font-extrabold uppercase text-emerald-800">You pay</p>
                <p className="text-xs font-bold text-slate-900 mt-1">36 - 18 = Rs 18</p>
              </div>
            </div>
            <p className="text-2xs text-slate-500">
              That Rs 18 you subtract is your{" "}
              <Tooltip
                term="Input Tax Credit (ITC)"
                text="The tax discount you get for the GST you already paid to your suppliers on business purchases."
              />
              .
            </p>
          </Card>

          <Card>
            <Heading title="Which tax do I charge?" />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/60">
                <p className="font-bold text-blue-900">Same state</p>
                <p className="text-slate-700 mt-0.5">CGST + SGST (UTGST in a Union Territory without legislature)</p>
              </div>
              <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/60">
                <p className="font-bold text-purple-900">Different state</p>
                <p className="text-slate-700 mt-0.5">IGST only</p>
              </div>
            </div>
            <Heading title="GST rates today" sub="The old 12% and 28% slabs were removed from 22 September 2025. A few items have special rates (for example gold at 3%)." />
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { r: "0%", d: "Nil-rated items", c: "bg-slate-50 border-slate-200 text-slate-800" },
                { r: "5%", d: "Everyday items", c: "bg-blue-50 border-blue-200 text-blue-800" },
                { r: "18%", d: "Most things", c: "bg-purple-50 border-purple-200 text-purple-800" },
                { r: "40%", d: "Luxury / sin goods", c: "bg-red-50 border-red-200 text-red-800" },
              ].map((x) => (
                <div key={x.r} className={`p-3 rounded-xl border ${x.c}`}>
                  <p className="text-lg font-black">{x.r}</p>
                  <p className="text-3xs text-slate-600">{x.d}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <QuickLink href="/rules" label="Check rate for my item" />
              <Link href="/glossary" className="text-xs font-bold text-blue-700 hover:underline">
                Hard word? Open Dictionary
              </Link>
            </div>
          </Card>
        </div>
      )}

      {/* 2. DO I NEED GST */}
      {tab === "need" && (
        <div className="space-y-4 animate-fadeIn">
          <Card>
            <Heading title="Check if you must register" sub="Answer a few quick things. The result follows the current GST registration limits." />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-2xs font-bold text-slate-600">What do you sell?</span>
                <select
                  value={bizType}
                  onChange={(e) => {
                    const v = e.target.value as BizType;
                    setBizType(v);
                    if (v === "services") {
                      setInterState(false);
                      setEcom(false);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  <option value="goods">Only goods</option>
                  <option value="services">Only services</option>
                  <option value="both">Both goods and services</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-2xs font-bold text-slate-600">Which state do you operate from?</span>
                <select
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  <option value={OTHER_STATE}>{OTHER_STATE}</option>
                  {Object.keys(SPECIAL_STATES).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-2xs font-bold text-slate-600">Total sales in one financial year (April to March)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={turnover}
                    onChange={(e) => setTurnover(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-2xs text-slate-500 shrink-0">lakh / year</span>
                </div>
                <span className="block text-3xs text-slate-500">
                  Count all your business sales across India under one PAN, including exempt sales and exports. Do not count GST, salary or profit.
                </span>
              </label>
            </div>

            {sellsGoods && (
              <div className="space-y-2">
                {[
                  { v: interState, set: setInterState, label: "I sell goods to customers in other states" },
                  { v: ecom, set: setEcom, label: "I sell goods on Amazon, Flipkart, Meesho or similar" },
                ].map((o) => (
                  <label
                    key={o.label}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60 cursor-pointer text-xs text-slate-700"
                  >
                    <input type="checkbox" checked={o.v} onChange={(e) => o.set(e.target.checked)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}

            <p className="text-3xs text-slate-500">
              Your limit: <strong>{limit} lakh per year</strong> ({bizType === "goods" ? "only goods" : bizType === "services" ? "services" : "goods and services together, so the services limit applies"}, {stateName === OTHER_STATE ? "most states" : stateName}).
            </p>

            {mustRegister ? (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-xs text-red-900 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p><strong>You must register for GST.</strong></p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {reasons.map((r) => (<li key={r}>{r}</li>))}
                  </ul>
                  <p>Apply within 30 days of becoming liable. Go to the next step.</p>
                </div>
              </div>
            ) : nearLimit ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong>Close to the {limit} lakh limit.</strong> Registration becomes compulsory once your yearly sales go above it. Get your documents ready.</span>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900 flex gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong>Not compulsory based on your answers</strong> (limit is {limit} lakh). You can still register by choice.</span>
              </div>
            )}

            {ecomNote && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
                <strong>Selling on e-commerce platforms:</strong> you can skip registration only if every sale stays inside your own state, you sell through the platform in that one state only, and you are below your limit. If any order goes to another state, you must register.
              </div>
            )}
          </Card>

          <More title="How is the limit counted?">
            <p>It is called aggregate turnover. It covers taxable sales, exempt sales, exports and inter-state sales of all your businesses under the same PAN in India.</p>
            <p>It does not include GST itself, salary income, or purchases on which you pay tax under reverse charge.</p>
            <p>Registration is needed when you go above the limit. Apply within 30 days of crossing it.</p>
          </More>
          <More title="Other cases where you must register">
            <p>Even with low sales, GST registration is compulsory for:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>Selling goods to other states (a few notified handicraft goods are the exception).</li>
              <li>Casual traders selling at fairs or stalls in another state, and non-resident taxable persons.</li>
              <li>People who must pay tax under reverse charge.</li>
              <li>Agents of registered suppliers, Input Service Distributors, and TDS or TCS deductors.</li>
              <li>E-commerce operators and online information service providers from outside India.</li>
            </ul>
            <p>You need not register if you supply only fully exempt goods or services.</p>
          </More>
          <More title="Why register even if not compulsory?">
            <p>You can claim ITC, sell goods to other states, sell on online platforms, and business customers often prefer GST-registered sellers.</p>
            <p>But once registered you must file returns every period, even with no sales. A voluntary registration cannot be cancelled in the first year.</p>
          </More>
          <More title="Composition scheme (for small traders)">
            <p>You pay a small flat tax on turnover and file fewer returns. Traders and manufacturers pay about 1%, restaurants 5%, and small service providers 6%.</p>
            <p>Limits: up to Rs 1.5 crore for goods (Rs 75 lakh in some North-East and hill states) and up to Rs 50 lakh for services.</p>
            <p>Conditions: no ITC, no GST shown on your invoices, no sales to other states, and no selling through e-commerce platforms.</p>
          </More>
        </div>
      )}

      {/* 3. REGISTER */}
      {tab === "register" && (
        <div className="space-y-4 animate-fadeIn">
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            <strong>No government fee. You can apply yourself.</strong> Use only gst.gov.in.
          </div>

          <Card>
            <Heading title="Step A: Keep these ready" sub="Tap to tick." />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(DOCS) as EntityId[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setEntity(k)}
                  className={`px-3.5 py-1.5 rounded-full text-2xs font-bold transition-all ${
                    entity === k ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {DOCS[k].label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {DOCS[entity].items.map((item, i) => {
                const key = `${entity}-${i}`;
                const done = !!docChecked[key];
                return (
                  <button
                    key={key}
                    onClick={() => toggleDoc(key)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border text-xs transition-all ${
                      done ? "bg-emerald-50/60 border-emerald-300 text-emerald-900" : "bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${done ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-400"}`}>
                      {done && <Check className="w-3 h-3" />}
                    </span>
                    <span className={done ? "line-through opacity-80" : ""}>{item}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <Heading title="Step B: Apply online" />
            <div className="space-y-2">
              {REGISTER_STEPS.map((s, i) => (
                <div key={s.t} className="flex gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60">
                  <div className="w-6 h-6 shrink-0 rounded-full bg-blue-600 text-white text-2xs font-bold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{s.t}</p>
                    <p className="text-xs text-slate-600">{s.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-2xs text-slate-500">
              Words:{" "}
              <Tooltip term="TRN" text="Temporary Reference Number. It lets you continue your form." />,{" "}
              <Tooltip term="ARN" text="Application Reference Number. Use it to track your application." />,{" "}
              <Tooltip term="GSTIN" text="Your unique 15-character GST number." />
            </p>
          </Card>

          <More title="Faster 3-day registration (simplified scheme)">
            <p>Since 1 November 2025 (Rule 14A), you can choose the simplified scheme while applying. It is meant for small businesses whose GST on sales to other registered businesses (B2B) will not exceed Rs 2.5 lakh per month.</p>
            <p>Registration is granted electronically within 3 working days after successful Aadhaar authentication. You can hold only one such registration per PAN in a state.</p>
            <p>If your B2B tax goes above the limit, you must move to regular registration.</p>
          </More>
          <More title="Why applications get rejected">
            <p>Name does not match PAN. Blurry or mismatched address proof. Mobile not linked to Aadhaar. Wrong file size or format. Business details that do not match the documents.</p>
          </More>
        </div>
      )}

      {/* 4. BILL & FILE */}
      {tab === "file" && (
        <div className="space-y-4 animate-fadeIn">
          <Card>
            <Heading title="After you get your GSTIN" sub="Do these in GSTMitra." />
            <div className="flex flex-wrap gap-2">
              <QuickLink href="/items" label="1. Add items" />
              <QuickLink href="/sales" label="2. Create invoices" />
              <QuickLink href="/purchases" label="3. Record purchases" />
              <QuickLink href="/gst-filing" label="4. Health check" />
            </div>
          </Card>

          <Card>
            <Heading title="Your 3 monthly jobs" sub="Always in this order. Dates are for monthly filers." />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { s: "GSTR-1", due: "By 11th", d: "Declare your sales.", href: "/gst-filing/gstr1", box: "border-blue-200 bg-blue-50/60", badge: "bg-blue-600" },
                { s: "GSTR-2B", due: "Ready by 14th", d: "Check your ITC. The portal creates it for you. Just view it.", href: "/gst-filing/gstr2b", box: "border-emerald-200 bg-emerald-50/60", badge: "bg-emerald-600" },
                { s: "GSTR-3B", due: "By 20th", d: "Pay your net tax.", href: "/gst-filing/gstr3b", box: "border-indigo-200 bg-indigo-50/60", badge: "bg-indigo-600" },
              ].map((x, i) => (
                <div key={x.s} className={`p-4 rounded-2xl border space-y-1.5 ${x.box}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-900">{i + 1}. {x.s}</span>
                    <span className={`text-3xs text-white font-bold px-2 py-0.5 rounded-md ${x.badge}`}>{x.due}</span>
                  </div>
                  <p className="text-xs text-slate-600">{x.d}</p>
                  <Link href={x.href} className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
                    <span>Open</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          </Card>

          <More title="How to file on the portal (5 steps)">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Download your GSTR-1 file from GSTMitra.</li>
              <li>Log in to gst.gov.in, open Returns Dashboard and pick the month.</li>
              <li>Upload the file, check the summary, then file with OTP (EVC) or DSC.</li>
              <li>Open GSTR-3B, check the numbers, and pay the tax online.</li>
              <li>File GSTR-3B.</li>
            </ol>
          </More>
          <More title="What must a GST invoice show?">
            <p>Your name, address and GSTIN, a unique invoice number and date, customer details, description of goods or services with HSN or SAC code, quantity, value, tax rate and amount (CGST/SGST or IGST), place of supply, and your signature. GSTMitra fills most of this.</p>
            <p>The number of HSN digits required depends on your yearly turnover. Check the current rule on the portal.</p>
          </More>
          <More title="No sales? Quarterly? Annual return?">
            <p><strong>No sales:</strong> still file a Nil return.</p>
            <p><strong>Quarterly (QRMP):</strong> if your turnover in the last financial year was up to Rs 5 crore you can file returns every 3 months, but you still pay tax every month. Due dates are different from the monthly ones.</p>
            <p><strong>Annual return (GSTR-9):</strong> once a year. It is optional for small businesses in some years, so check the current rule on the portal.</p>
          </More>
        </div>
      )}

      {/* 5. AVOID TROUBLE */}
      {tab === "safe" && (
        <div className="space-y-4 animate-fadeIn">
          <Card>
            <Heading title="Late filing costs money" />
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl border border-red-200 bg-red-50/60">
                <p className="text-sm font-black text-red-800">Rs 50</p>
                <p className="text-3xs text-slate-600">late fee per day, per late return</p>
              </div>
              <div className="p-3 rounded-xl border border-red-200 bg-red-50/60">
                <p className="text-sm font-black text-red-800">Rs 20</p>
                <p className="text-3xs text-slate-600">per day for a Nil return</p>
              </div>
              <div className="p-3 rounded-xl border border-red-200 bg-red-50/60">
                <p className="text-sm font-black text-red-800">18%</p>
                <p className="text-3xs text-slate-600">yearly interest on late tax</p>
              </div>
            </div>
            <p className="text-3xs text-slate-400">Late fees have a maximum per return that depends on your turnover. Confirm the current amounts on the GST portal.</p>
          </Card>

          <Card>
            <Heading title="4 mistakes to avoid" />
            <ul className="space-y-2 text-xs text-slate-700">
              {[
                "Claiming ITC on blocked items such as food and beverages, or personal use.",
                "Charging the wrong tax (same state vs other state).",
                "Claiming ITC that is not showing in GSTR-2B.",
                "Using an old GST rate. Check the rate for each item.",
              ].map((x) => (
                <li key={x} className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <Heading title="Do I need a CA?" sub="For many small businesses, not always." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 space-y-1">
                <p className="font-bold text-emerald-900">Do it yourself if</p>
                <p className="text-slate-700">You sell inside India, have simple invoices, and file on time.</p>
              </div>
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-1">
                <p className="font-bold text-amber-900">Ask a CA if</p>
                <p className="text-slate-700">You get a notice, export, want a refund, or have branches in many states.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 6. CALCULATOR & FAQS */}
      {tab === "practice" && (
        <div className="space-y-4 animate-fadeIn">
          <Card>
            <Heading title="Simple Tax Calculator" sub="See how ITC lowers the cash you pay. This is a simple estimate." />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-900">Sales (Rs, before GST)</p>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={sales}
                  onChange={(e) => setSales(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={salesRate}
                  onChange={(e) => setSalesRate(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  {RATES.map((r) => (<option key={r} value={r}>{r}% GST</option>))}
                </select>
                <p className="text-xs text-slate-600">Tax collected: <span className="font-extrabold text-blue-700">{inr(outputTax)}</span></p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <p className="text-xs font-bold text-slate-900">Purchases (Rs, before GST)</p>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={purchases}
                  onChange={(e) => setPurchases(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={purchaseRate}
                  onChange={(e) => setPurchaseRate(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                >
                  {RATES.map((r) => (<option key={r} value={r}>{r}% GST</option>))}
                </select>
                <p className="text-xs text-slate-600">ITC you get: <span className="font-extrabold text-emerald-700">{inr(itc)}</span></p>
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-1">
              <p className="text-3xs uppercase tracking-wider font-bold text-blue-300">Cash you pay in GSTR-3B</p>
              <p className="text-3xl font-black text-yellow-300">{inr(netPayable)}</p>
              <p className="text-xs text-blue-100/90">
                {inr(outputTax)} - {inr(Math.min(outputTax, itc))} ITC = {inr(netPayable)}
                {excessItc > 0 && `. Extra ITC of ${inr(excessItc)} carries forward to next month.`}
              </p>
            </div>
            <p className="text-3xs text-slate-400">Assumes all purchases are eligible for ITC and shown in GSTR-2B. Blocked items give no ITC.</p>
          </Card>

          <Card>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600" />
              Quick Questions
            </h2>
            <div className="space-y-2">
              {FAQS.map((f, idx) => {
                const open = openFaq === idx;
                return (
                  <div key={f.q} className="rounded-xl border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setOpenFaq(open ? null : idx)}
                      className="w-full p-3 text-left flex items-center justify-between gap-4 bg-slate-50/80 hover:bg-slate-100/80 transition-colors"
                    >
                      <span className="text-xs font-bold text-slate-900">{f.q}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>
                    {open && <div className="p-3 bg-white text-xs text-slate-600 border-t border-slate-200">{f.a}</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Prev / Next */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => goTo(tabIndex - 1)}
          disabled={tabIndex === 0}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Previous</span>
        </button>
        <span className="text-2xs text-slate-500 font-semibold">
          Step {tabIndex + 1} of {GUIDANCE_TABS.length}
        </span>
        <button
          onClick={() => goTo(tabIndex + 1)}
          disabled={tabIndex === GUIDANCE_TABS.length - 1}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="text-3xs text-slate-400 text-center">
        General help, not legal or tax advice. Rules and dates can change, so confirm on gst.gov.in or with a tax professional.
      </p>
    </div>
  );
}

/* =========================================================================
   4. TAB 2: GST WORDS (GLOSSARY) COMPONENT  (unchanged)
   ========================================================================= */

function GstWordsView() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | GlossaryCategory>("all");

  const q = search.trim().toLowerCase();
  const items = GLOSSARY_DATA.filter((item) => {
    const inCategory = category === "all" || item.category === category;
    const inSearch =
      !q ||
      item.term.toLowerCase().includes(q) ||
      item.shortForm.toLowerCase().includes(q) ||
      item.meaning.toLowerCase().includes(q);
    return inCategory && inSearch;
  });

  return (
    <div className="space-y-5 animate-fadeIn w-full pb-12">
      {/* Search + categories */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search a word, like ITC, RCM, or GSTR-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {GLOSSARY_CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                category === c.id
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Words List */}
      <ul className="space-y-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-base font-bold text-slate-900">{item.term}</h2>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                {item.shortForm}
              </span>
            </div>

            <p className="text-sm text-slate-800 leading-relaxed">{item.meaning}</p>

            <div className="border-l-3 border-blue-400 pl-3.5 py-0.5 bg-blue-50/40 rounded-r-xl">
              <p className="text-xs text-slate-700 leading-relaxed">
                <span className="font-bold text-slate-900">Example: </span>
                {item.example}
              </p>
            </div>

            {item.linkHref && (
              <div className="pt-1">
                <Link
                  href={item.linkHref}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  <span>{item.linkLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
          Nothing found for &quot;{search}&quot;. Try a simpler word.
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   5. MAIN HELP PAGE WITH 2 TABS  (unchanged)
   ========================================================================= */

function HelpPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "words" ? "words" : "guide";
  const [activeTab, setActiveTab] = useState<"guide" | "words">(initialTab);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "words") {
      setActiveTab("words");
    } else if (tabParam === "guide") {
      setActiveTab("guide");
    }
  }, [searchParams]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12 w-full">
      {/* Top Header */}
      <header className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2.5">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            <span>Help & Learning Hub</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Plain words assistance for small businesses and beginners.
          </p>
        </div>

        {/* 2 Main Tabs: Beginner Guide vs GST Words */}
        <div className="flex bg-slate-100 p-1 rounded-xl gap-1 shrink-0">
          <button
            onClick={() => setActiveTab("guide")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "guide"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Beginner Guide</span>
          </button>
          <button
            onClick={() => setActiveTab("words")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "words"
                ? "bg-white text-blue-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>GST Words</span>
          </button>
        </div>
      </header>

      {/* Render active tab */}
      {activeTab === "guide" ? <BeginnerGuideView /> : <GstWordsView />}
    </div>
  );
}

export default function HelpPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading help...</div>}>
      <HelpPageInner />
    </Suspense>
  );
}