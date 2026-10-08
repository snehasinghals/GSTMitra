"use client";

import React from "react";
import { useAuth } from "../context/AuthContext";
import { Building2, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import Link from "next/link";

export function Navbar() {
  const { user, business, logout } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-gray-200 sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 shadow-xs">
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-blue-700">
          <span className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
            GM
          </span>
          <span>GSTMitra</span>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium ml-1">
            Plain & Simple GST
          </span>
        </Link>
      </div>

      {business && (
        <div className="hidden md:flex items-center gap-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-gray-800">
            <Building2 className="w-4 h-4 text-blue-600" />
            <span>{business.name}</span>
          </div>

          <div className="h-4 w-px bg-gray-300"></div>

          {business.gstin ? (
            <div className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>GSTIN: {business.gstin}</span>
            </div>
          ) : (
            <Link
              href="/onboarding"
              className="flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 hover:bg-amber-100"
            >
              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
              <span>Unregistered / Setup GSTIN</span>
            </Link>
          )}

          <div className="h-4 w-px bg-gray-300"></div>

          <span className="text-gray-600">State: <strong className="text-gray-800">{business.stateName} ({business.stateCode})</strong></span>
        </div>
      )}

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 font-medium hidden sm:inline">
            Hello, <strong className="text-gray-900">{user.name}</strong>
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 font-medium px-2.5 py-1.5 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      )}
    </header>
  );
}
