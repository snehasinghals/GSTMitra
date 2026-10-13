"use client";

import React from "react";
import Link from "next/link";
import { Receipt, QrCode } from "lucide-react";

export default function MyBillsPage() {
  return (
    <div className="w-full space-y-6 animate-fadeIn py-4">
      {/* Page Header (card with border, like Home) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs px-6 py-5">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">My Bills</h1>
        <p className="text-xs text-slate-500">Bills received on your Mitra ID</p>
      </div>

      {/* Friendly Empty State */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-8 sm:p-12 text-center space-y-4 min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto text-blue-600">
          <Receipt className="w-8 h-8" />
        </div>

        <div className="space-y-1.5 max-w-sm mx-auto">
          <h2 className="text-lg font-bold text-slate-900">No bills yet</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            When you buy from a shop using your Mitra ID, your bills will show here.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/home"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-sm transition-all"
          >
            <QrCode className="w-4 h-4" />
            <span>Show My QR at Shop</span>
          </Link>
          <Link
            href="/home"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs px-5 py-3 rounded-xl transition-all"
          >
            <span>Back to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}