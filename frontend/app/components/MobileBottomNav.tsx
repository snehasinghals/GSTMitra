"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  Home,
  Receipt,
  Store,
  User,
  PlusCircle,
  FileText,
  MoreHorizontal,
  LayoutDashboard,
  ShoppingBag,
  Package,
  FileSpreadsheet,
  BookOpen,
  HelpCircle,
  Settings,
  Plus,
  X,
} from "lucide-react";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { business } = useAuth();
  const isOnboarded = !!business?.isOnboarded;
  const [moreOpen, setMoreOpen] = useState(false);

  const isExact = (path: string) => pathname === path;
  const isUnder = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  // ---------------------------------------------------------------
  // Customer navigation (isOnboarded = false)
  // Home | My Shopping Bills | Start your shop | More
  // ---------------------------------------------------------------
  const customerTabs = [
    { label: "Home", href: "/home", icon: Home, active: isExact("/home") },
    { label: "My Shopping Bills", href: "/my-bills", icon: Receipt, active: isUnder("/my-bills") },
    { label: "Start your shop", href: "/onboarding", icon: Store, active: isUnder("/onboarding") },
    { label: "More", href: "#more", icon: MoreHorizontal, active: false },
  ];

  // "More" bottom sheet for customers (no shop)
  const customerMoreGroups = [
    {
      title: "More",
      items: [
        { label: "Profile", href: "/profile", icon: User, active: isUnder("/profile") },
        { label: "GST Rates", href: "/rules", icon: BookOpen, active: isUnder("/rules") },
        { label: "Help", href: "/help", icon: HelpCircle, active: isUnder("/help") },
      ],
    },
  ];

  // ---------------------------------------------------------------
  // Shop owner navigation (isOnboarded = true)
  // Dashboard | Sales | (Make Bill - center) | Products | More
  // ---------------------------------------------------------------
  const shopTabs = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard, active: isExact("/") },
    { label: "Sales", href: "/sales", icon: FileText, active: isUnder("/sales") },
    { label: "Make Bill", href: "/new-bill/create", icon: Plus, active: isUnder("/new-bill"), center: true },
    { label: "Products", href: "/items", icon: Package, active: isUnder("/items") },
    { label: "More", href: "#more", icon: MoreHorizontal, active: false },
  ];

  // "More" bottom sheet for shop owners, grouped
  const shopMoreGroups = [
    {
      title: "Shop",
      items: [
        { label: "Purchases", href: "/purchases", icon: ShoppingBag, active: isUnder("/purchases") },
        { label: "File GST", href: "/gst-filing", icon: FileSpreadsheet, active: isUnder("/gst-filing") },
        { label: "GST Rates", href: "/rules", icon: BookOpen, active: isUnder("/rules") },
      ],
    },
    {
      title: "Personal",
      items: [
        { label: "My Home", href: "/home", icon: Home, active: isExact("/home") },
        { label: "My Shopping Bills", href: "/my-bills", icon: Receipt, active: isUnder("/my-bills") },
        { label: "Profile", href: "/profile", icon: User, active: isUnder("/profile") },
      ],
    },
    {
      title: "Account",
      items: [
        { label: "Shop Settings", href: "/settings", icon: Settings, active: isExact("/settings") },
        { label: "Help", href: "/help", icon: HelpCircle, active: isUnder("/help") },
      ],
    },
  ];

  const currentTabs = isOnboarded ? shopTabs : customerTabs;
  const moreGroups = isOnboarded ? shopMoreGroups : customerMoreGroups;

  // Highlight "More" if the current page lives inside the More sheet
  const moreHasActive = moreGroups.some((g) => g.items.some((i) => i.active));

  return (
    <>
      {/* Overlay + grouped "More" bottom sheet (shop owners and customers) */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          {/* Sheet */}
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 animate-slide-up max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 pt-4 pb-2 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">More Options</h3>
                <p className="text-xs text-slate-500">
                  {isOnboarded
                    ? "Shop tools, personal pages and settings"
                    : "Profile, GST rates and help"}
                </p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-4">
              {moreGroups.map((group) => (
                <section key={group.title}>
                  {/* Hide the group heading for customers, since there is only one group */}
                  {isOnboarded && (
                    <h4 className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {group.title}
                    </h4>
                  )}
                  <nav className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                            item.active
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "text-slate-700 hover:bg-slate-50 active:bg-slate-100"
                          }`}
                        >
                          <div
                            className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center ${
                              item.active
                                ? "bg-blue-100 text-blue-600"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around h-16 px-1 pb-safe">
          {currentTabs.map((tab: any) => {
            const Icon = tab.icon;
            const isMoreTab = tab.href === "#more";
            const isActive = isMoreTab ? moreOpen || moreHasActive : tab.active;

            // "More" button
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
                      isActive ? "text-blue-600 font-semibold" : "text-slate-500"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            }

            // Big round center "Make Bill" button (shop owners only)
            if (tab.center) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMoreOpen(false)}
                  aria-label="Make Bill"
                  className="flex-1 self-stretch flex flex-col items-center justify-end gap-0.5 pb-1.5"
                >
                  <div
                    style={{ backgroundColor: isActive ? "#1d4ed8" : "#2563eb" }}
                    className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-white shadow-lg ring-4 -translate-y-3 transition-all active:scale-95 ${
                      isActive ? "ring-blue-200" : "ring-white"
                    }`}
                  >
                    <Icon
                      className={`w-6 h-6 transition-transform ${isActive ? "rotate-45" : ""}`}
                      strokeWidth={2.5}
                    />
                  </div>
                  <span
                    className={`text-[10px] leading-none whitespace-nowrap ${
                      isActive ? "text-blue-600 font-bold" : "text-slate-500 font-semibold"
                    }`}
                  >
                    {tab.label}
                  </span>
                </Link>
              );
            }

            // Normal tabs
            return (
              <Link
                key={tab.href}
                href={tab.href}
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 transition-colors"
              >
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? "text-blue-600" : "text-slate-400"
                    }`}
                  />
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-600" />
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium whitespace-nowrap transition-colors ${
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