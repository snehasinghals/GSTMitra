"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import QRCode from "qrcode";
import {
  QrCode,
  Receipt,
  Store,
  Building2,
  Copy,
  Check,
  X,
  ArrowRight,
  TrendingUp,
  Clock,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export default function HomePage() {
  const { user, business, loading } = useAuth();

  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const mitraId = user?.mitraId || "";

  // Generate QR code containing ONLY the mitraId string

  useEffect(() => {
    if (mitraId) {
      QRCode.toDataURL(mitraId, {
        width: 640,
        margin: 4,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR Code generation error:", err));
    } else {
      setQrDataUrl("");
    }
  }, [mitraId]);

  // Close QR modal with Esc and lock background scroll while it is open
  useEffect(() => {
    if (!showQrModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowQrModal(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showQrModal]);

  const handleCopyMitraId = async () => {
    if (!mitraId) return;
    try {
      await navigator.clipboard.writeText(mitraId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isOnboarded = Boolean(business?.isOnboarded);

  return (
    <div className="w-full space-y-6 animate-fadeIn">
      {/* ================= USER GREETING & MITRA ID CHIP ================= */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Hello, {user?.name || "Friend"} 👋
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Welcome back to your GSTMitra account</p>
        </div>

        {/* Small Chip: Mitra ID with copy button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {mitraId ? (
            <button
              onClick={handleCopyMitraId}
              className="group flex items-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 shadow-2xs"
              title="Click to copy Mitra ID"
            >
              <span className="text-slate-500 font-normal">Mitra ID:</span>
              <span className="font-mono font-bold text-blue-700 tracking-wide">{mitraId}</span>
              {copied ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-bold ml-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied</span>
                </span>
              ) : (
                <Copy className="w-3.5 h-3.5 text-blue-500 group-hover:text-blue-700 ml-0.5" />
              )}
            </button>
          ) : (
            <div className="bg-slate-50 border border-slate-200 text-slate-500 px-3.5 py-2 rounded-xl text-xs font-medium">
              {loading ? "Loading..." : "Mitra ID not created yet"}
            </div>
          )}
        </div>
      </div>

      {/* ================= THREE BIG ROUNDED TILES ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Tile 1: Show my QR */}
        <button
          onClick={() => setShowQrModal(true)}
          disabled={!mitraId}
          className="group text-left p-5 sm:p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-2xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 flex flex-col justify-between min-h-[140px] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white mb-3">
            <QrCode className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-1.5">
              <span>Show my QR</span>
              <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
            </h2>
            <p className="text-xs text-blue-100 mt-0.5 leading-snug">
              Show at the counter to get bills
            </p>
          </div>
        </button>

        {/* Tile 2: My Bills */}
        <Link
          href="/my-bills"
          className="group text-left p-5 sm:p-6 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition-all transform hover:-translate-y-0.5 flex flex-col justify-between min-h-[140px]"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
              <span>My Bills</span>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-1 transition-all" />
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              View purchases & bills you received
            </p>
          </div>
        </Link>

        {/* Tile 3: Start your shop (if !isOnboarded) OR My Shop (if isOnboarded) */}
        {!isOnboarded ? (
          <Link
            href="/onboarding"
            className="group text-left p-5 sm:p-6 bg-amber-50 hover:bg-amber-100/80 border-2 border-amber-300 rounded-2xl shadow-xs hover:shadow-md transition-all transform hover:-translate-y-0.5 flex flex-col justify-between min-h-[140px]"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center mb-3 shadow-xs">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-amber-950 flex items-center gap-1.5">
                  <span>Start your shop</span>
                  <ArrowRight className="w-4 h-4 text-amber-700 group-hover:translate-x-1 transition-transform" />
                </h2>
                <span className="text-3xs font-extrabold uppercase tracking-wide bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                  Free
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5 leading-snug">
                Create invoices & file GST easily
              </p>
            </div>
          </Link>
        ) : (
          <Link
            href="/"
            className="group text-left p-5 sm:p-6 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl shadow-xs hover:shadow-md transition-all transform hover:-translate-y-0.5 flex flex-col justify-between min-h-[140px]"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mb-3">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>My Shop</span>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 group-hover:translate-x-1 transition-all" />
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                Open your Shop Dashboard
              </p>
            </div>
          </Link>
        )}
      </div>

      {/* ================= SPENDING SUMMARY ================= */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            This month you spent
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900">₹0</p>
        </div>
        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
          <TrendingUp className="w-6 h-6" />
        </div>
      </div>

      {/* ================= RECENT BILLS SECTION ================= */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Recent bills</span>
          </h2>
          <Link
            href="/my-bills"
            className="text-xs font-bold text-blue-600 hover:text-blue-800"
          >
            View all
          </Link>
        </div>

        {/* Empty message */}
        <div className="py-8 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No bills yet</p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            When you purchase from any GSTMitra shop using your Mitra ID, your bills will appear here automatically.
          </p>
        </div>
      </div>

      {/* ================= QR MODAL ================= */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowQrModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="My Mitra QR"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm max-h-[95vh] overflow-y-auto bg-white rounded-3xl border border-slate-200 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-blue-600 text-white font-extrabold text-sm flex items-center justify-center shadow-xs">
                  GM
                </span>
                <span className="text-sm font-bold text-slate-800">GSTMitra QR</span>
              </div>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all"
                aria-label="Close QR view"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 pt-6 pb-4 text-center bg-gradient-to-b from-blue-50/70 to-white">
              {/* QR with corner brackets */}
              <div className="relative inline-block p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <span className="absolute top-2 left-2 w-5 h-5 border-t-[3px] border-l-[3px] border-blue-600 rounded-tl-lg" />
                <span className="absolute top-2 right-2 w-5 h-5 border-t-[3px] border-r-[3px] border-blue-600 rounded-tr-lg" />
                <span className="absolute bottom-2 left-2 w-5 h-5 border-b-[3px] border-l-[3px] border-blue-600 rounded-bl-lg" />
                <span className="absolute bottom-2 right-2 w-5 h-5 border-b-[3px] border-r-[3px] border-blue-600 rounded-br-lg" />
                {!mitraId ? (
                  <div className="w-56 h-56 sm:w-64 sm:h-64 flex flex-col items-center justify-center bg-slate-50 text-slate-500 text-xs rounded-lg p-6 text-center">
                    <p className="font-bold text-sm text-slate-700 mb-1">
                      {loading ? "Loading..." : "Mitra ID not created yet"}
                    </p>
                    <p className="text-3xs text-slate-400">
                      Your personal QR code will appear here once your Mitra ID is ready.
                    </p>
                  </div>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR code for ${mitraId}`}
                    className="w-56 h-56 sm:w-64 sm:h-64 mx-auto rounded-lg"
                  />
                ) : (
                  <div className="w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center bg-slate-50 text-slate-400 text-xs rounded-lg">
                    Generating QR...
                  </div>
                )}
              </div>

              {/* Identity */}
              <h2 className="mt-5 text-xl font-extrabold text-slate-900">
                {user?.name || "Customer"}
              </h2>
              <p className="text-3xs uppercase tracking-wider font-bold text-slate-400 mt-1">
                Your Mitra ID
              </p>
              {mitraId ? (
                <button
                  onClick={handleCopyMitraId}
                  className="mt-1.5 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors active:scale-95"
                  title="Tap to copy Mitra ID"
                >
                  <span className="font-mono font-bold text-blue-700 text-sm tracking-wide">
                    {mitraId}
                  </span>
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-blue-500" />
                  )}
                </button>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500 font-medium">
                  {loading ? "Loading..." : "Mitra ID not created yet"}
                </p>
              )}
              <p className="h-4 mt-1 text-3xs font-semibold text-emerald-600">
                {copied ? "ID copied" : ""}
              </p>
            </div>

            {/* Privacy note */}
            <div className="mx-6 mb-4 flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-900">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Show this only to the shopkeeper</span>
            </div>

            {/* Close */}
            <div className="px-6 pb-6">
              <button
                onClick={() => setShowQrModal(false)}
                className="w-full py-3.5 bg-slate-900 hover:bg-black text-white font-bold text-sm rounded-2xl shadow-md transition-all active:scale-[0.99]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}