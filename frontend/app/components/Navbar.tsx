"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  Building2,
  LogOut,
  CheckCircle2,
  AlertCircle,
  User,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";

export function Navbar() {
  const { user, business, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  const copyMitraId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (user?.mitraId) {
      navigator.clipboard.writeText(user.mitraId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const homeHref = business?.isOnboarded ? "/" : "/home";

  return (
    <header className="h-14 sm:h-16 bg-white border-b border-gray-200 sticky top-0 z-30 flex items-center justify-between px-3 sm:px-6 shadow-xs">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Link href={homeHref} className="flex items-center gap-2 font-bold text-lg sm:text-xl text-blue-700">
          <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-extrabold text-base sm:text-lg shadow-sm">
            GM
          </span>
          <span>GSTMitra</span>
          <span className="hidden sm:inline text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium ml-1">
            Plain & Simple GST
          </span>
        </Link>
      </div>

      {/* Business info — only for onboarded businesses on md+ */}
      {business && business.isOnboarded && (
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

          <span className="text-gray-600">
            State: <strong className="text-gray-800">{business.stateName} ({business.stateCode})</strong>
          </span>
        </div>
      )}

      {/* User Avatar Menu */}
      {user && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="User menu"
            aria-expanded={dropdownOpen}
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-sm flex items-center justify-center shadow-xs">
              {user.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <span className="hidden sm:inline text-xs font-semibold text-gray-700 max-w-[120px] truncate">
              {user.name}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-500 hidden sm:block" />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 animate-in fade-in-50 zoom-in-95 duration-100">
              {/* User details */}
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>

                {/* Mitra ID chip */}
                {user.mitraId ? (
                  <div className="mt-2 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1.5">
                    <div className="min-w-0">
                      <span className="text-[10px] text-blue-600 uppercase font-bold tracking-wider block">
                        Mitra ID
                      </span>
                      <span className="text-xs font-mono font-bold text-blue-900 truncate block">
                        {user.mitraId}
                      </span>
                    </div>
                    <button
                      onClick={copyMitraId}
                      title="Copy Mitra ID"
                      className="p-1 rounded hover:bg-blue-100 text-blue-700 transition-colors ml-2 shrink-0"
                    >
                      {copied ? (
                        <span className="text-[10px] font-medium text-emerald-700 flex items-center gap-0.5">
                          <Check className="w-3.5 h-3.5" /> Copied
                        </span>
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-500">
                    Mitra ID not created yet
                  </div>
                )}
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <User className="w-4 h-4 text-gray-500" />
                  <span>Profile</span>
                </Link>
              </div>

              {/* Logout */}
              <div className="border-t border-gray-100 pt-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-medium text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
