"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../context/AuthContext";

const PREFETCH_ROUTES = [
  "/",
  "/items",
  "/sales",
  "/purchases",
  "/gst-filing",
  "/gst-filing/gstr1",
  "/gst-filing/gstr2b",
  "/gst-filing/gstr3b",
  "/rules",
  "/guidance",
  "/glossary",
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

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();

  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/onboarding";

  if (isAuthPage || (!loading && !user)) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="flex flex-1 min-h-[calc(100vh-4rem)]">
      <Sidebar />
      <RoutePrefetcher enabled={!loading && !!user} />
      <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-3">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-sm font-medium text-slate-600">Loading GSTMitra...</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}

