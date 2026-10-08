"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "./context/AuthContext";
import { apiFetch } from "./lib/api";
import { Tooltip } from "./components/Tooltip";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingBag,
  CreditCard,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  PlusCircle,
  HelpCircle,
  FileText,
  GraduationCap,
} from "lucide-react";

export default function DashboardPage() {
  const { user, business } = useAuth();

  const [salesSummary, setSalesSummary] = useState<any>(null);
  const [expenseSummary, setExpenseSummary] = useState<any>(null);
  const [healthCheck, setHealthCheck] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    setLoading(true);
    const hcPromise = apiFetch<any>("/healthcheck/run?period=102026");
    const [salesRes, expRes] = await Promise.all([
      apiFetch<any>("/sales/summary"),
      apiFetch<any>("/purchases/expenses-summary"),
    ]);

    if (salesRes.data) setSalesSummary(salesRes.data);
    if (expRes.data) setExpenseSummary(expRes.data);
    setLoading(false);

    const hcRes = await hcPromise;
    if (hcRes.data) setHealthCheck(hcRes.data);
  };

  useEffect(() => {
    if (user && business) {
      loadDashboardData();
    }
  }, [user, business]);

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-100">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white font-extrabold text-3xl flex items-center justify-center mx-auto shadow-md">
            GM
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Welcome to GSTMitra</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            Prepare and file GST returns step-by-step in plain words without a CA and without fear.
          </p>

          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/signup"
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm"
            >
              <span>Create Free Account</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-2.5 rounded-xl transition-all text-sm"
            >
              <span>Sign In to Existing Account</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!business?.isOnboarded) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-3 max-w-xl mx-auto my-8">
        <h2 className="text-lg font-bold text-amber-900">Finish your 1-minute Onboarding</h2>
        <p className="text-xs text-amber-800">
          Setup your business state and GSTIN to enable automated tax calculations and return generation.
        </p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md"
        >
          <span>Complete Onboarding Now</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const salesTax = salesSummary?.totalTaxCollected || 0;
  const itcAvailable = expenseSummary?.totalEligibleItc || 0;
  const netPayable = Math.max(0, salesTax - itcAvailable);

  
  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {business.name} Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            GST Filing Period: <strong className="text-blue-700">October 2026</strong> • State:{" "}
            <strong className="text-slate-800">{business.stateName} ({business.stateCode})</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/sales"
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Invoice</span>
          </Link>
          <Link
            href="/purchases"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add Purchase Bill</span>
          </Link>
        </div>
      </div>

      {/* Plain Language Net Tax Box (Section 1.5) */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-6 sm:p-8 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/30 text-blue-200 px-3 py-1 rounded-full border border-blue-400/30">
              Plain Language Tax Summary
            </span>
            <span className="text-xs text-blue-200 font-medium">Auto-calculated from your books</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
            <div>
              <p className="text-xs text-blue-200">Total Sales (Taxable)</p>
              <p className="text-2xl font-extrabold mt-1">₹{(salesSummary?.totalTaxable || 0).toLocaleString("en-IN")}</p>
              <p className="text-3xs text-blue-300 mt-0.5">Collected Tax: ₹{salesTax.toLocaleString("en-IN")}</p>
            </div>

            <div>
              <p className="text-xs text-blue-200">
                <Tooltip
                  term="Eligible ITC"
                  text="Input Tax Credit is the tax you paid on your business purchases. You can reduce this amount from your total tax payable."
                  example="Paid ₹60k tax on laptop stock -> reduce ₹60k from tax bill!"
                />
              </p>
              <p className="text-2xl font-extrabold text-emerald-400 mt-1">₹{itcAvailable.toLocaleString("en-IN")}</p>
              <p className="text-3xs text-emerald-300 mt-0.5">
                Blocked ITC: ₹{(expenseSummary?.totalBlockedItc || 0).toLocaleString("en-IN")}
              </p>
            </div>

            <div className="md:col-span-2 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15">
              <p className="text-xs text-blue-100 font-medium">Estimated Net Tax to Pay (GSTR-3B)</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-3xl font-black text-yellow-300">₹{netPayable.toLocaleString("en-IN")}</span>
                <span className="text-xs text-blue-200 font-medium">Estimated cash liability</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Health Check & Return Filing Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Pre-filing Health Check Card (Section 2.1) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              Pre-filing Health Check
            </h2>
            <span className="text-3xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
              Automatic Rules
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Checks your sales & purchases against official GST law rules before generating files.
          </p>

          {healthCheck ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="font-semibold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  Must Fix (Errors)
                </span>
                <span className="font-extrabold text-red-700 text-sm">{healthCheck.summary.mustFixCount}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="font-semibold text-amber-700 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-amber-600" />
                  Should Check (Warnings)
                </span>
                <span className="font-extrabold text-amber-700 text-sm">{healthCheck.summary.shouldCheckCount}</span>
              </div>

              <Link
                href="/gst-filing"
                className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs py-2.5 rounded-xl border border-blue-200 transition-all"
              >
                <span>Run Full Health Audit</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="text-xs text-slate-400 py-4 text-center">Loading health status...</div>
          )}
        </div>

        {/* GST Filing Return Launchpad */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              October 2026 Return Filings
            </h2>
            <Link href="/gst-filing" className="text-xs font-bold text-blue-600 hover:underline">
              View All Filings →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* GSTR-1 */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">GSTR-1</span>
                <span className="text-3xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-md">Due 11th Oct</span>
              </div>
              <p className="text-3xs text-slate-500">Sales Invoices & Tax Output</p>
              <div className="pt-2">
                <Link
                  href="/gst-filing/gstr1"
                  className="block text-center text-xs font-bold bg-white text-slate-800 py-1.5 rounded-lg border border-slate-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                >
                  Generate Files
                </Link>
              </div>
            </div>

            {/* GSTR-3B */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">GSTR-3B</span>
                <span className="text-3xs bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">Due 20th Oct</span>
              </div>
              <p className="text-3xs text-slate-500">Sales, Purchase & ITC Summary</p>
              <div className="pt-2">
                <Link
                  href="/gst-filing/gstr3b"
                  className="block text-center text-xs font-bold bg-white text-slate-800 py-1.5 rounded-lg border border-slate-300 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                >
                  Generate Files
                </Link>
              </div>
            </div>

            {/* GSTR-2B Books */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 hover:border-blue-400 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-blue-900">GSTR-2B (Books)</span>
                <span className="text-3xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md">Books Version</span>
              </div>
              <p className="text-3xs text-blue-800">Inward Purchase ITC Report</p>
              <div className="pt-2">
                <Link
                  href="/gst-filing/gstr2b"
                  className="block text-center text-xs font-bold bg-blue-600 text-white py-1.5 rounded-lg shadow-sm hover:bg-blue-700 transition-all"
                >
                  View 2B Section
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Beginner Guidance & Help Hub Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">New to GST or Filing on Your Own?</h3>
              <span className="text-3xs bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
                Beginner Guide
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Read our step-by-step plain words roadmap, simulate your monthly tax & ITC, and avoid common traps without a CA.
            </p>
          </div>
        </div>

        <Link
          href="/guidance"
          className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs transition-all"
        >
          <span>Open Beginner Guidance</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
