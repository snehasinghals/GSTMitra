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
  Users,
  FileSpreadsheet,
  BookOpen,
  HelpCircle,
  Settings,
  X,
} from "lucide-react";


export function MobileBottomNav() {
  const pathname = usePathname();
  const { business } = useAuth();
  const isOnboarded = !!business?.isOnboarded;
  const [moreOpen, setMoreOpen] = useState(false);

  const isExact = (path: string) => pathname === path;
  const isUnder = (path: string) => pathname === path || pathname.startsWith(`${path}/`);

  // Customer navigation (isOnboarded = false)
  const customerTabs = [
    { label: "Home", href: "/home", icon: Home, active: isExact("/home") },
    { label: "My Shopping Bills", href: "/my-bills", icon: Receipt, active: isUnder("/my-bills") },
    { label: "Start your shop", href: "/onboarding", icon: Store, active: isUnder("/onboarding") },
    { label: "Profile", href: "/profile", icon: User, active: isUnder("/profile") },
  ];

  // Shop owner navigation (isOnboarded = true)
  const shopTabs = [
    { label: "Home", href: "/home", icon: Home, active: isExact("/home") },
    { label: "Make Bill", href: "/new-bill/create", icon: PlusCircle, active: isUnder("/new-bill") },
    { label: "Sales", href: "/sales", icon: FileText, active: isExact("/sales") },
    { label: "My Shopping Bills", href: "/my-bills", icon: Receipt, active: isUnder("/my-bills") },
    { label: "More", href: "#more", icon: MoreHorizontal, active: false },
  ];

  // Items inside "More" bottom sheet for shop owners
  // Items inside "More" bottom sheet for shop owners
  const moreItems = [
    { label: "Shop Dashboard", href: "/", icon: LayoutDashboard, active: isExact("/") },
    { label: "Purchases", href: "/purchases", icon: ShoppingBag, active: isUnder("/purchases") },
    { label: "My Product", href: "/items", icon: Package, active: isUnder("/items") },
    { label: "Shop Settings", href: "/settings", icon: Settings, active: isExact("/settings") },
    { label: "File GST", href: "/gst-filing", icon: FileSpreadsheet, active: isUnder("/gst-filing") },
    { label: "GST Rates", href: "/rules", icon: BookOpen, active: isUnder("/rules") },
    { label: "Help", href: "/help", icon: HelpCircle, active: isUnder("/help") },
  ];

  const currentTabs = isOnboarded ? shopTabs : customerTabs;

  return (
    <>
      {/* Overlay + "More" bottom sheet for shop owners */}
      {isOnboarded && moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          {/* Sheet */}
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-2xl border-t border-gray-200 animate-slide-up max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">More Shop Options</h3>
                <p className="text-xs text-slate-500">Quick access to all shop tools</p>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {moreItems.map((item) => {
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
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-around h-16 px-1 pb-safe">
          {currentTabs.map((tab) => {
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
                      isActive ? "text-blue-600 font-semibold" : "text-slate-500"
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

