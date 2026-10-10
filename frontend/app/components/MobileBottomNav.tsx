"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ShoppingBag,
  FileSpreadsheet,
  MoreHorizontal,
  Package,
  BookOpen,
  HelpCircle,
  X,
} from "lucide-react";

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isExact = (path: string) => pathname === path;
  const isUnder = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  // Primary tabs for the bottom bar (max 5, like LinkedIn)
  const primaryTabs = [
    { label: "Home", href: "/", icon: LayoutDashboard, active: isExact("/") },
    { label: "Sales", href: "/sales", icon: FileText, active: isUnder("/sales") },
    { label: "Purchases", href: "/purchases", icon: ShoppingBag, active: isUnder("/purchases") },
    { label: "Filing", href: "/gst-filing", icon: FileSpreadsheet, active: isUnder("/gst-filing") },
    { label: "More", href: "#more", icon: MoreHorizontal, active: false },
  ];

  // Overflow items shown in the "More" sheet
  const moreItems = [
    { label: "Items & Services", href: "/items", icon: Package, active: isUnder("/items") },
    { label: "GST Rules & Rates", href: "/rules", icon: BookOpen, active: isUnder("/rules") },
    { label: "Beginner Guidance", href: "/guidance", icon: HelpCircle, active: isUnder("/guidance") },
    { label: "GST Dictionary", href: "/glossary", icon: BookOpen, active: isUnder("/glossary") },
  ];

  return (
    <>
      {/* Overlay + "More" bottom sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          {/* Sheet */}
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-sm font-bold text-slate-800">More Options</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="px-3 pb-4 space-y-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                      item.active
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                        item.active
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around h-16 px-1 pb-safe">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isMoreTab = tab.href === "#more";
            const isActive = isMoreTab ? moreOpen : tab.active;

            if (isMoreTab) {
              return (
                <button
                  key="more"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors"
                >
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? "text-blue-600" : "text-slate-400"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-medium transition-colors ${
                      isActive ? "text-blue-600" : "text-slate-500"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors"
              >
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? "text-blue-600" : "text-slate-400"
                    }`}
                  />
                  {/* Active dot indicator */}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600" />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium transition-colors ${
                    isActive ? "text-blue-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

