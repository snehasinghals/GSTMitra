"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  FileText,
  ShoppingBag,
  FileSpreadsheet,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const isExact = (path: string) => pathname === path;
  const isUnder = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const filingOpen = isUnder("/gst-filing");
  const guidanceActive = isUnder("/guidance");

  const filingChildren = [
    { label: "GSTR-1", href: "/gst-filing/gstr1" },
    { label: "GSTR-2B", href: "/gst-filing/gstr2b" },
    { label: "GSTR-3B", href: "/gst-filing/gstr3b" },
  ];

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Items & Services", href: "/items", icon: Package },
    { label: "Sales & Invoices", href: "/sales", icon: FileText },
    { label: "Purchases & Bills", href: "/purchases", icon: ShoppingBag },
    { label: "GST Rules & Rates", href: "/rules", icon: BookOpen },
  ];

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
      active
        ? "bg-blue-600 text-white shadow-sm font-semibold"
        : "hover:bg-slate-800 hover:text-white text-slate-300"
    }`;

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between shrink-0 shadow-md">
      <div className="space-y-6">
        {/* ---------- Core Modules ---------- */}
        <div>
          <p className="px-3 text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Core Modules
          </p>
          <nav className="space-y-1">
            {navItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const active = item.href === "/" ? isExact("/") : isUnder(item.href);
              return (
                <Link key={item.href} href={item.href} className={itemClass(active)}>
                  <Icon className={`w-4 h-4 ${active ? "text-white" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div>
              <Link
                href="/gst-filing"
                className={`${itemClass(isExact("/gst-filing"))} justify-between`}
              >
                <span className="flex items-center gap-3">
                  <FileSpreadsheet
                    className={`w-4 h-4 ${isExact("/gst-filing") ? "text-white" : "text-slate-400"}`}
                  />
                  GST Filing Hub
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${filingOpen ? "rotate-180" : ""}`}
                />
              </Link>
              {filingOpen && (
                <div className="mt-1 ml-4 pl-3 border-l border-slate-700 space-y-1">
                  {filingChildren.map((child) => {
                    const active = isUnder(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          active
                            ? "bg-blue-600/80 text-white font-semibold"
                            : "hover:bg-slate-800 hover:text-white text-slate-400"
                        }`}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {navItems.slice(4).map((item) => {
              const Icon = item.icon;
              const active = isUnder(item.href);
              return (
                <Link key={item.href} href={item.href} className={itemClass(active)}>
                  <Icon className={`w-4 h-4 ${active ? "text-white" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ---------- Help / Beginner Guidance ---------- */}
        <div className="pt-4 border-t border-slate-800">
          <p className="px-3 text-2xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Help
          </p>

          <Link
            href="/guidance"
            className={`group flex items-center gap-3 rounded-xl p-3 border transition-all ${
              guidanceActive
                ? "bg-blue-600/30 border-blue-500 ring-1 ring-blue-500 shadow-sm"
                : "bg-slate-800/80 border-slate-700/60 hover:bg-slate-800 hover:border-blue-400"
            }`}
          >
            {/* icon box */}
            <div
              className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                guidanceActive
                  ? "bg-blue-600 text-white"
                  : "bg-blue-500/15 text-blue-400 group-hover:bg-blue-500/25"
              }`}
            >
              <HelpCircle className="w-5 h-5" />
            </div>

            {/* text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white leading-tight">
                Beginner Guidance
              </p>
              
            </div>

            {/* arrow */}
            <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
          </Link>

          <Link
            href="/glossary"
            className={`group flex items-center gap-3 rounded-xl p-3 border transition-all mt-2 ${
              isUnder("/glossary")
                ? "bg-emerald-600/30 border-emerald-500 ring-1 ring-emerald-500 shadow-sm"
                : "bg-slate-800/80 border-slate-700/60 hover:bg-slate-800 hover:border-emerald-400"
            }`}
          >
            {/* icon box */}
            <div
              className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                isUnder("/glossary")
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-500/15 text-emerald-400 group-hover:bg-emerald-500/25"
              }`}
            >
              <BookOpen className="w-5 h-5" />
            </div>

            {/* text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white leading-tight">
                GST Dictionary
              </p>
            </div>

            {/* arrow */}
            <ChevronRight className="w-4 h-4 shrink-0 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
          </Link>
        </div>
      </div>

      {/* ---------- Footer ---------- */}
      <div className="text-center pt-4 border-t border-slate-800 text-3xs text-slate-500">
        <p>GSTMitra v1.0 · Phase 1 MVP</p>
      </div>
    </aside>
  );
}