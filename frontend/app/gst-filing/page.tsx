"use client";

import React, { useState, useEffect } from "react";
import { apiFetch } from "../lib/api";
import HealthCheckBanner from "../components/HealthCheckBanner";
import Link from "next/link";
import {
  FileSpreadsheet,
  ArrowRight,
} from "lucide-react";

export default function GstFilingHubPage() {
  const [period, setPeriod] = useState("102026"); // October 2026

  const [gstr1Summary, setGstr1Summary] = useState<any>(null);
  const [gstr3bSummary, setGstr3bSummary] = useState<any>(null);

  const loadFilingData = async () => {
    const [g1Res, g3Res] = await Promise.all([
      apiFetch<any>(`/filing/gstr1/summary?period=${period}`),
      apiFetch<any>(`/filing/gstr3b/summary?period=${period}`),
    ]);
    if (g1Res.data) setGstr1Summary(g1Res.data);
    if (g3Res.data) setGstr3bSummary(g3Res.data);
    if (g3Res.data) setGstr3bSummary(g3Res.data);
  };

  useEffect(() => {
    loadFilingData();
  }, [period]);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            GST Return Preparation Hub
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review return summaries and data checks. These are working figures, not GST portal upload files.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700">Filing Period:</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-blue-700 bg-white"
          >
            <option value="102026">October 2026</option>
            <option value="092026">September 2026</option>
            <option value="082026">August 2026</option>
          </select>
        </div>
      </div>

      <HealthCheckBanner
        key={period}
        scope="all"
        month={`${period.slice(2)}-${period.slice(0, 2)}`}
        variant="full"
        autoRun={false}
      />

      {/* Return Generation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GSTR-1 Return Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">GSTR-1 Sales Return</h2>
              <p className="text-xs text-slate-500">Review outward supplies and customer invoice figures</p>
            </div>
            <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-lg">
              Due 11th Oct
            </span>
          </div>

          {gstr1Summary && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-3xs text-slate-400 font-bold">Total Invoices</span>
                  <p className="font-extrabold text-sm text-slate-900">{gstr1Summary.totalInvoices}</p>
                </div>
                <div>
                  <span className="text-3xs text-slate-400 font-bold">Total Sales</span>
                  <p className="font-extrabold text-sm text-slate-900">₹{gstr1Summary.totals.totalSales.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-3xs text-slate-400 font-bold">B2B Registered</span>
                  <p className="font-bold text-slate-800">{gstr1Summary.b2bCount}</p>
                </div>
                <div>
                  <span className="text-3xs text-slate-400 font-bold">Total Output Tax</span>
                  <p className="font-bold text-blue-700">₹{gstr1Summary.totals.totalTax.toFixed(2)}</p>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <Link
                  href="/gst-filing/gstr1"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all"
                >
                  Open GSTR-1 Section
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Review these figures against your records. This summary is not an upload file; complete and verify your
                return on the GST portal.
              </p>
            </div>
          )}
        </div>

        {/* GSTR-3B Return Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">GSTR-3B Tax Summary</h2>
              <p className="text-xs text-slate-500">Review output tax and purchase ITC figures from your books</p>
            </div>
            <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-lg">
              Due 20th Oct
            </span>
          </div>

          {gstr3bSummary && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-3xs text-slate-400 font-bold">Output tax in sales records</span>
                  <p className="font-extrabold text-sm text-slate-900">₹{gstr3bSummary.taxEstimator.totalOutwardTax.toFixed(2)}</p>
                </div>
                <div>
                  <span className="text-3xs text-emerald-600 font-bold">Potential ITC in purchase books</span>
                  <p className="font-extrabold text-sm text-emerald-600">₹{gstr3bSummary.taxEstimator.totalAvailableItc.toFixed(2)}</p>
                </div>
              </div>

              {/* Plain Language Summary Box (Section 1.5) */}
              <div className="p-3 bg-blue-900 text-white rounded-xl text-xs space-y-1">
                <span className="text-3xs text-blue-200 font-bold uppercase">Plain Summary</span>
                <p className="font-bold">{gstr3bSummary.taxEstimator.plainSummary}</p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <Link
                  href="/gst-filing/gstr3b"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all"
                >
                  Open GSTR-3B Section
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                ITC shown here is based on purchase records in your books and is not a confirmed claim. Reconcile it
                with GSTR-2B and verify the final return on the GST portal. This summary is not an upload file.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Link to GSTR-2B Books Section */}
      <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white p-6 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-extrabold text-lg text-white">Looking for GSTR-2B Inward Purchase Reconciliation?</h3>
          <p className="text-xs text-blue-200">
            Generate the "GSTR-2B (From Your Books)" report with 10 row categories and drill-down functionality.
          </p>
        </div>

        <Link
          href="/gst-filing/gstr2b"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-3 rounded-xl shadow-md shrink-0"
        >
          <span>Open GSTR-2B Section</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
