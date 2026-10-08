"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Search, ArrowRight, BookOpen } from "lucide-react";

type Category = "credit" | "filing" | "tax-type" | "codes" | "rules";

interface GlossaryItem {
  id: string;
  term: string;
  shortForm: string;
  category: Category;
  meaning: string; // plain words, no jargon
  example: string; // small real-life story with numbers
  linkHref?: string;
  linkLabel?: string;
}

const CATEGORIES: { id: "all" | Category; label: string }[] = [
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
      "When you buy things for your business, you pay GST to the seller. ITC means you can get that money back by subtracting it from the GST you owe.",
    example:
      "You buy a laptop and pay ₹18,000 GST. This month you owe ₹50,000 GST. You only pay ₹32,000.",
    linkHref: "/purchases",
    linkLabel: "Record purchases",
  },
  {
    id: "output-tax",
    term: "Output GST",
    shortForm: "GST you collect",
    category: "credit",
    meaning:
      "The GST you add to your customer's bill. This money is not yours. You collect it for the government and must pass it on.",
    example:
      "You sell goods for ₹1,00,000 and add 18% GST. The customer pays ₹1,18,000. The extra ₹18,000 goes to the government.",
    linkHref: "/sales",
    linkLabel: "View sales",
  },
  {
    id: "net-tax",
    term: "Net Tax Payable",
    shortForm: "Amount to pay",
    category: "credit",
    meaning:
      "The final amount you pay the government. It is the GST you collected from customers minus the GST you already paid on your purchases.",
    example:
      "You collected ₹20,000 and already paid ₹15,000 on purchases. You pay only ₹5,000.",
    linkHref: "/gst-filing/gstr3b",
    linkLabel: "Open GSTR-3B",
  },
  {
    id: "blocked-itc",
    term: "Blocked Credit",
    shortForm: "Section 17(5)",
    category: "credit",
    meaning:
      "Some spending is more personal than business, like restaurant meals or a personal car. The government does not let you get GST back on these.",
    example:
      "You eat a ₹3,000 dinner and pay ₹150 GST in the bill. You cannot subtract that ₹150 from your business tax.",
    linkHref: "/purchases",
    linkLabel: "Manage expenses",
  },
  {
    id: "rcm",
    term: "Reverse Charge",
    shortForm: "RCM",
    category: "rules",
    meaning:
      "Normally the seller collects GST from you. In a few special cases the rule flips, and you pay the GST directly to the government yourself.",
    example:
      "You hire a goods transport truck (GTA). You pay 5% GST on that freight directly to the government.",
    linkHref: "/rules",
    linkLabel: "See GST rules",
  },
  {
    id: "gstr1",
    term: "GSTR-1",
    shortForm: "Sales report",
    category: "filing",
    meaning:
      "A monthly list of all the bills you gave to customers. It is only a report, so you pay no money with it. Due by the 11th.",
    example:
      "You list who you sold to, how much, and the GST you charged. Then you submit it.",
    linkHref: "/gst-filing/gstr1",
    linkLabel: "Open GSTR-1",
  },
  {
    id: "gstr2b",
    term: "GSTR-2B",
    shortForm: "Purchase check",
    category: "filing",
    meaning:
      "A list the GST portal makes for you each month. It shows which of your suppliers have told the government about the bills they gave you.",
    example:
      "A bill is missing from your list because the supplier did not report it. You cannot claim credit for that bill yet.",
    linkHref: "/gst-filing/gstr2b",
    linkLabel: "Open GSTR-2B",
  },
  {
    id: "gstr3b",
    term: "GSTR-3B",
    shortForm: "Monthly summary + payment",
    category: "filing",
    meaning:
      "A monthly form where you add up your sales and purchases, subtract your credit, and pay what is left. Due by the 20th.",
    example:
      "Sales GST ₹20,000, minus credit ₹15,000. You pay ₹5,000 online right in the form.",
    linkHref: "/gst-filing/gstr3b",
    linkLabel: "Open GSTR-3B",
  },
  {
    id: "nil-return",
    term: "Nil Return",
    shortForm: "Nothing happened",
    category: "filing",
    meaning:
      "Even if you bought and sold nothing this month, you must still tell the government \"nothing happened\". It takes about a minute.",
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
      "When you and your customer are in the same state, the GST is split into two equal halves. One half goes to the central government and the other to the state.",
    example:
      "Mumbai to Pune, 18% GST. The customer pays 9% CGST (central) + 9% SGST (Maharashtra).",
    linkHref: "/sales",
    linkLabel: "Create invoice",
  },
  {
    id: "inter-state",
    term: "Different-State Sale",
    shortForm: "IGST",
    category: "tax-type",
    meaning:
      "When you and your customer are in different states, there is no split. You charge one single tax called IGST.",
    example: "Delhi to Bengaluru, 18% GST. The customer pays one 18% IGST.",
    linkHref: "/sales",
    linkLabel: "Create invoice",
  },
  {
    id: "pos",
    term: "Place of Supply",
    shortForm: "POS",
    category: "tax-type",
    meaning:
      "The state where your goods are delivered or your service is used. This decides whether you charge CGST + SGST or IGST.",
    example:
      "You are in Delhi but deliver goods to Pune. The place of supply is Maharashtra, so it is a different-state sale.",
    linkHref: "/sales",
    linkLabel: "Invoice details",
  },
  {
    id: "gstin",
    term: "GSTIN",
    shortForm: "Your GST number",
    category: "codes",
    meaning:
      "Your business's 15-character tax ID, like an Aadhaar number for your business. The first 2 digits tell which state you are in.",
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
      "Number codes for what you sell. HSN is for products, SAC is for services. The code decides how much GST you charge.",
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
      "A bill in reverse. You give it to a customer when they return goods or you give a discount after billing. It reduces the GST you owe.",
    example:
      "A customer returns damaged goods worth ₹5,000. You issue a credit note and your GST goes down by ₹900.",
    linkHref: "/sales",
    linkLabel: "Sales invoices",
  },
  {
    id: "composition",
    term: "Composition Scheme",
    shortForm: "Simple flat tax",
    category: "rules",
    meaning:
      "An easy option for small businesses. You pay a small flat percentage of your sales (like 1%) and skip most GST paperwork. In return, you cannot charge GST to customers or claim credit.",
    example:
      "A small shop with sales under ₹1.5 crore pays 1% of its sales as tax, once every quarter.",
    linkHref: "/rules",
    linkLabel: "Explore rules",
  },
  {
    id: "eway-bill",
    term: "E-Way Bill",
    shortForm: "Transport permit",
    category: "codes",
    meaning:
      "An online permit you must make before moving goods worth more than ₹50,000. The driver carries it in case someone checks the vehicle.",
    example:
      "You send ₹80,000 worth of goods by truck. Make an e-way bill first, or the vehicle can be stopped and fined.",
    linkHref: "/sales",
    linkLabel: "Sales invoices",
  },
];

export default function GlossaryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | Category>("all");

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
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
        <Link
          href="/guidance"
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          Back to Guidance Hub
        </Link>
        <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <span>GST in simple words</span>
        </h1>
        <p className="text-xs text-slate-500">
          Every GST term explained like you are hearing it for the first time.
        </p>
      </header>

      {/* Search + filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search a word, like ITC or RCM"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                category === c.id
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terms */}
      <ul className="space-y-4">
        {items.map((item) => (
          <li
            key={item.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-lg font-semibold text-slate-900">{item.term}</h2>
              <span className="text-sm text-slate-500">{item.shortForm}</span>
            </div>

            <p className="text-base text-slate-800 leading-relaxed">{item.meaning}</p>

            <div className="border-l-4 border-blue-200 pl-3">
              <p className="text-sm text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Example: </span>
                {item.example}
              </p>
            </div>

            {item.linkHref && (
              <Link
                href={item.linkHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                {item.linkLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>

      {items.length === 0 && (
        <p className="text-center text-sm text-slate-500 py-10">
          Nothing found for &quot;{search}&quot;. Try a shorter word.
        </p>
      )}
    </div>
  );
}