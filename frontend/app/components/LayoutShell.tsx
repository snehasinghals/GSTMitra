"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useAuth } from "../context/AuthContext";

const PREFETCH_ROUTES = [
  "/",
  "/home",
  "/my-bills",
  "/profile",
  "/help",
  "/items",
  "/sales",
  "/purchases",
  "/gst-filing",
  "/gst-filing/gstr1",
  "/gst-filing/gstr2b",
  "/gst-filing/gstr3b",
  "/rules",
];

function RoutePrefetcher({ enabled }: { enabled: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const idle = (cb: () => void) => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        return (window as any).requestIdleCallback(cb, { timeout: 1500 });
      }
      return setTimeout(cb, 200);
    };

    const id = idle(() => {
      if (cancelled) return;
      PREFETCH_ROUTES.forEach((href) => router.prefetch(href));
    });

    return () => {
      cancelled = true;
      if (typeof id === "number") clearTimeout(id);
    };
  }, [enabled, router]);

  return null;
}

// Paths that are allowed for users who have NOT yet started their shop.
// Everything NOT on this list (and not an auth page) is a shop-only page.
const ALLOWED_PATHS_FOR_CUSTOMERS = [
  "/home",
  "/my-bills",
  "/profile",
  "/help",
  "/rules",
  "/onboarding",
  "/login",
  "/signup",
  "/forgot-password",
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, business, loading } = useAuth();
  const [shopRequiredMessage, setShopRequiredMessage] = useState(false);

  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/onboarding" ||
    pathname === "/forgot-password";

  const isAllowedPath = ALLOWED_PATHS_FOR_CUSTOMERS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  const isShopPath = !isAllowedPath && !isAuthPage;

  // Listen for ?shopRequired query param on /home
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("shopRequired")) {
        if (!business?.isOnboarded) {
          setShopRequiredMessage(true);
        } else {
          // If already onboarded, clean up the stale URL param
          window.history.replaceState({}, "", window.location.pathname);
          setShopRequiredMessage(false);
        }
      }
    }
  }, [pathname, business?.isOnboarded]);

  // If business is onboarded, always clear any lingering shopRequired banner
  useEffect(() => {
    if (business?.isOnboarded) {
      setShopRequiredMessage(false);
    }
  }, [business?.isOnboarded]);

  // Redirect non-onboarded users away from shop pages.
  // Wait for loading=false to avoid false redirects during hydration.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (business && !business.isOnboarded && isShopPath) {
      setShopRequiredMessage(true);
      router.replace("/home?shopRequired=1");
    }
  }, [loading, user, business, isShopPath, pathname, router]);

  if (isAuthPage || (!loading && !user)) {
    return <main className="flex-1">{children}</main>;
  }

  // Show a blocking message while the redirect is in flight
  // (covers the brief moment before router.replace executes)
  const blockedByShopGuard =
    !loading && user && business && !business.isOnboarded && isShopPath;

  return (
    <div className="flex flex-1 min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)]">
      <Sidebar />
      <RoutePrefetcher enabled={!loading && !!user} />
      {/* pb-20 on mobile to account for the fixed bottom nav bar height */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full pb-20 md:pb-6">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm font-medium text-slate-600">Loading GSTMitra...</p>
            </div>
          </div>
        ) : blockedByShopGuard ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center px-4 animate-fadeIn">
            <p className="text-base font-medium text-slate-700">
              Start your shop to use this page.
            </p>
            <a
              href="/onboarding"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Start your shop
            </a>
          </div>
        ) : (
          <>
            {shopRequiredMessage && !business?.isOnboarded && (
              <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs animate-fadeIn">
                <span className="font-semibold text-sm">
                  Start your shop to use this page.
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href="/onboarding"
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors"
                  >
                    Start your shop
                  </a>
                  <button
                    onClick={() => {
                      setShopRequiredMessage(false);
                      if (
                        typeof window !== "undefined" &&
                        window.location.search.includes("shopRequired")
                      ) {
                        window.history.replaceState({}, "", window.location.pathname);
                      }
                    }}
                    className="px-2.5 py-1.5 text-xs text-amber-700 hover:text-amber-900 font-semibold rounded"
                    aria-label="Dismiss message"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {children}
          </>
        )}
      </main>
      {/* Mobile bottom navigation — hidden on md+ */}
      <MobileBottomNav />
    </div>
  );
}
