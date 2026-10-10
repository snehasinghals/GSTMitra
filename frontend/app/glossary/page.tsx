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
          Common GST terms explained in simple words, like you are hearing them for the first time.
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