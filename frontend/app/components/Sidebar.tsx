"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  Home,
  Receipt,
  BookOpen,
  HelpCircle,
  LayoutDashboard,
  PlusCircle,
  FileText,
  ShoppingBag,
  Package,
  Users,
  FileSpreadsheet,
  Settings,
  ChevronDown,
  ArrowRight,
  Store,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { business } = useAuth();
  const isOnboarded = !!business?.isOnboarded;

  const [filingOpen, setFilingOpen] = useState(false);

  const isExact = (path: string) => pathname === path;
  const isUnder = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  const filingChildren = [
    { label: "GSTR-1", href: "/gst-filing/gstr1" },
    { label: "GSTR-2B", href: "/gst-filing/gstr2b" },
    { label: "GSTR-3B", href: "/gst-filing/gstr3b" },
  ];

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active
        ? "bg-blue-600 text-white shadow-sm font-semibold"
        : "hover:bg-slate-800 hover:text-white text-slate-300"
    }`;

  return (
    <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 sticky top-14 sm:top-16 h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] p-4 pb-8 flex-col justify-between shrink-0 shadow-md overflow-y-auto">
      <div className="space-y-5">
        {/* ================= PERSONAL SECTION ================= */}
        <div>
          {isOnboarded && (
            <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Personal
            </p>
          )}
          <nav className="space-y-1">
            <Link href="/home" className={itemClass(isExact("/home"))}>
              <Home className={`w-4 h-4 ${isExact("/home") ? "text-white" : "text-slate-400"}`} />
              <span>Home</span>
            </Link>

            <Link href="/my-bills" className={itemClass(isUnder("/my-bills"))}>
              <Receipt className={`w-4 h-4 ${isUnder("/my-bills") ? "text-white" : "text-slate-400"}`} />
              <span>My Shopping Bills</span>
            </Link>

            <Link href="/rules" className={itemClass(isUnder("/rules"))}>
              <BookOpen className={`w-4 h-4 ${isUnder("/rules") ? "text-white" : "text-slate-400"}`} />
              <span>GST Rates</span>
            </Link>

            <Link href="/help" className={itemClass(isUnder("/help"))}>
              <HelpCircle className={`w-4 h-4 ${isUnder("/help") ? "text-white" : "text-slate-400"}`} />
              <span>Help</span>
            </Link>
          </nav>
        </div>

        {/* ================= IF NOT ONBOARDED: START YOUR SHOP BOX ================= */}
        {!isOnboarded && (
          <div className="pt-2">
            <div className="rounded-xl p-4 bg-gradient-to-br from-blue-900/60 to-indigo-950/80 border border-blue-500/40 shadow-sm text-white">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <Store className="w-4 h-4" />
                </div>
                <h4 className="font-bold text-sm">Start your shop</h4>
              </div>
              <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                Create GST invoices, track purchases, manage stock, and file GST returns easily.
              </p>
              <Link
                href="/onboarding"
                className="flex items-center justify-between w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              >
                <span>Set up shop</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* ================= IF ONBOARDED: MY SHOP SECTION ================= */}
        {isOnboarded && (
          <div className="pt-3 border-t border-slate-800">
            <p className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              My Shop
            </p>
            <nav className="space-y-1">
              <Link href="/" className={itemClass(isExact("/"))}>
                <LayoutDashboard className={`w-4 h-4 ${isExact("/") ? "text-white" : "text-slate-400"}`} />
                <span>Shop Dashboard</span>
              </Link>

              <Link href="/new-bill" className={itemClass(isUnder("/new-bill"))}>
                <PlusCircle className={`w-4 h-4 ${isUnder("/new-bill") ? "text-white" : "text-emerald-400"}`} />
                <span className={isUnder("/new-bill") ? "text-white font-semibold" : "text-emerald-300 font-semibold"}>Make Bill</span>
              </Link>

              <Link href="/sales" className={itemClass(isExact("/sales"))}>
                <FileText className={`w-4 h-4 ${isExact("/sales") ? "text-white" : "text-slate-400"}`} />
                <span>Sales</span>
              </Link>

              <Link href="/purchases" className={itemClass(isUnder("/purchases"))}>
                <ShoppingBag className={`w-4 h-4 ${isUnder("/purchases") ? "text-white" : "text-slate-400"}`} />
                <span>Purchases</span>
              </Link>

              <Link href="/items" className={itemClass(isUnder("/items"))}>
                <Package className={`w-4 h-4 ${isUnder("/items") ? "text-white" : "text-slate-400"}`} />
                <span>My Product</span>
              </Link>

              <Link href="/settings" className={itemClass(isExact("/settings"))}>
                <Settings className={`w-4 h-4 ${isExact("/settings") ? "text-white" : "text-slate-400"}`} />
                <span>Shop Settings</span>
              </Link>

              {/* File GST (collapsible) */}
              <div>
                <div className={`${itemClass(isExact("/gst-filing"))} justify-between`}>
                  <Link
                    href="/gst-filing"
                    onClick={() => setFilingOpen(true)}
                    className="flex flex-1 items-center gap-3"
                  >
                    <FileSpreadsheet
                      className={`w-4 h-4 ${isUnder("/gst-filing") ? "text-white" : "text-slate-400"}`}
                    />
                    <span>File GST</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setFilingOpen(!filingOpen)}
                    aria-label="Toggle File GST menu"
                    className="p-1 -mr-1"
                  >
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${filingOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>

                {filingOpen && (
                  <div className="mt-1 ml-4 pl-3 border-l border-slate-700 space-y-1">
                    {filingChildren.map((child) => {
                      const active = isUnder(child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
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
            </nav>
          </div>
        )}
      </div>

      {/* ---------- Footer ---------- */}
      <div className="text-center pt-4 border-t border-slate-800 text-3xs text-slate-500">
        <p>GSTMitra · Plain & Simple GST</p>
      </div>
    </aside>
  );
}