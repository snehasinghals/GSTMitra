"use client";

import React, { useState, useEffect } from "react";
import { apiFetch, downloadFile } from "../../lib/api";
import HealthCheckBanner, { type HealthCheckStatus } from "../../components/HealthCheckBanner";
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  ArrowRight,
  Upload,
  Layers,
  Eye,
  X,
  Info,
} from "lucide-react";

const formatCurrency = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Gstr2bCategory = {
  key: string;
  rowName: string;
  count: number;
  taxable: number;
  totalTax: number;
  total: number;
};

type Gstr2bSummary = {
  topBoxText: string;
  itcClaimable: number;
  itcBlocked: number;
  rows: Gstr2bCategory[];
};

type Gstr2bDrilldownRecord = {
  id: string;
  type: string;
  referenceNumber: string;
  date: string;
  vendorName: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalAmount: number;
  isItcEligible: boolean | null;
};

type Gstr2bDrilldownResponse = { records: Gstr2bDrilldownRecord[] };

export default function Gstr2bSectionPage() {
  const [activeTab, setActiveTab] = useState<"TAB1_BOOKS" | "TAB2_IMPORT" | "TAB3_RECONCILE">("TAB1_BOOKS");
  const [period, setPeriod] = useState("102026");
  const [healthCheck, setHealthCheck] = useState<{
    status: HealthCheckStatus | null;
    errors: number;
    warnings: number;
  }>({ status: null, errors: 0, warnings: 0 });
  const healthCheckAllowsActions =
    healthCheck.status === "ok" || healthCheck.status === "warning";

  const healthCheckMessage =
    healthCheck.status === "empty"
      ? "Add purchase bills first."
      : healthCheck.status === "error"
        ? `Fix ${healthCheck.errors} ${healthCheck.errors === 1 ? "problem" : "problems"} above to download.`
        : healthCheck.status === "warning"
          ? `${healthCheck.warnings} ${healthCheck.warnings === 1 ? "thing" : "things"} to review.`
          : null;

  // Summary State
  const [summary, setSummary] = useState<Gstr2bSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Drill-down Modal State
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState("");
  const [drilldownRecords, setDrilldownRecords] = useState<Gstr2bDrilldownRecord[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  useEffect(() => {
    let active = true;
    const loadSummary = async () => {
      const { data } = await apiFetch<Gstr2bSummary>(`/filing/gstr2b-books/summary?period=${period}`);
      if (active && data) setSummary(data);
      if (active) setLoading(false);
    };

    void loadSummary();
    return () => {
      active = false;
    };
  }, [period]);

  const handleOpenDrilldown = async (rowName: string, categoryKey: string) => {
    setDrilldownCategory(rowName);
    setShowDrilldown(true);
    setLoadingDrilldown(true);
    const { data } = await apiFetch<Gstr2bDrilldownResponse>(
      `/filing/gstr2b-books/drilldown?period=${period}&category=${categoryKey}`
    );
    if (data) setDrilldownRecords(data.records || []);
    setLoadingDrilldown(false);
  };

  const handleDownloadBooksWorkbook = async () => {
    try {
      await downloadFile(`/filing/gstr2b-books/excel?period=${period}`, `GSTR2B_BOOKS_REVIEW_${period}.xlsx`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not download the purchase-books workbook.");
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Purchase Books &amp; GSTR-2B Reconciliation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            All GSTR-2B work lives here. Move left to right through the tabs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-700">Filing Period:</label>
          <select
            value={period}
            onChange={(e) => {
              setLoading(true);
              setHealthCheck({ status: null, errors: 0, warnings: 0 });
              setPeriod(e.target.value);
            }}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-blue-700 bg-white"
          >
            <option value="102026">October 2026</option>
            <option value="092026">September 2026</option>
            <option value="082026">August 2026</option>
          </select>
        </div>
      </div>

      {/* Mandatory Disclaimer Label (Section 1.5.1 Naming Rule) */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-center gap-2 font-medium">
        <Info className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          <strong>Important Label:</strong> Based on your own bills, not the official GSTR-2B. Final ITC depends on the portal.
        </span>
      </div>

      <HealthCheckBanner
        key={period}
        scope="purchase"
        month={`${period.slice(2)}-${period.slice(0, 2)}`}
        variant="full"
        autoRun={false}
        onResult={(status, counts) =>
          setHealthCheck({
            status,
            errors: counts?.errors ?? 0,
            warnings: counts?.warnings ?? 0,
          })
        }
      />

      {/* Three Tabs Header (Section 1.5.1) */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold bg-white px-4 pt-3 rounded-t-2xl shadow-xs">
        <button
          onClick={() => setActiveTab("TAB1_BOOKS")}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === "TAB1_BOOKS"
              ? "border-blue-600 text-blue-700 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Tab 1: Purchase records (from your books)</span>
        </button>

        <button
          onClick={() => setActiveTab("TAB2_IMPORT")}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === "TAB2_IMPORT"
              ? "border-blue-600 text-blue-700 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Tab 2: Import Official GSTR-2B</span>
        </button>

        <button
          onClick={() => setActiveTab("TAB3_RECONCILE")}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 transition-all ${
            activeTab === "TAB3_RECONCILE"
              ? "border-blue-600 text-blue-700 font-extrabold"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Tab 3: Reconcile</span>
        </button>
      </div>

      {/* TAB 1: GENERATE GSTR-2B (FROM YOUR BOOKS) */}
      {activeTab === "TAB1_BOOKS" && (
        <div className="space-y-6">
          {/* Plain-Language Top Box (Section 1.5.1) */}
          {summary && (
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider bg-blue-500/30 text-blue-200 px-3 py-1 rounded-full border border-blue-400/30">
                  Books Summary Overview
                </span>
                <button
                  onClick={() => void handleDownloadBooksWorkbook()}
                  disabled={!healthCheckAllowsActions || loading}
                  className="flex items-center gap-1.5 bg-white text-blue-900 font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm hover:bg-blue-50 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Download Books Review (.xlsx)</span>
                </button>
              </div>
              {healthCheckMessage && (
                <p aria-live="polite" className={`text-sm font-semibold ${healthCheck.status === "warning" ? "text-amber-200" : "text-amber-100"}`}>
                  {healthCheckMessage}
                </p>
              )}

              <p className="text-base font-extrabold text-white">{summary.topBoxText}</p>

              <div className="flex gap-4 pt-1 text-xs">
                <div className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-3 py-1.5 rounded-lg font-semibold">
                  Eligible ITC in books: {formatCurrency(summary.itcClaimable)}
                </div>
                <div className="bg-red-500/20 text-red-200 border border-red-400/30 px-3 py-1.5 rounded-lg font-semibold">
                  Ineligible ITC in books: {formatCurrency(summary.itcBlocked)}
                </div>
              </div>
            </div>
          )}

          {/* Report Rows Table (Section 1.5.1) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Purchase and note summary (from your books)
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-slate-500">Reading purchase bills...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4 text-right">Records</th>
                      <th className="py-3 px-4 text-right">Taxable value</th>
                      <th className="py-3 px-4 text-right">Total tax</th>
                      <th className="py-3 px-4 text-right">Total amount</th>
                      <th className="py-3 px-4 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                    {summary?.rows.length ? summary.rows.map((row) => (
                      <tr key={row.key} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{row.rowName}</td>
                        <td className="py-3 px-4 text-right font-semibold text-slate-700">{row.count}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(row.taxable)}</td>
                        <td className="py-3 px-4 text-right font-mono">{formatCurrency(row.totalTax)}</td>
                        <td className="py-3 px-4 text-right font-extrabold text-blue-900">{formatCurrency(row.total)}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleOpenDrilldown(row.rowName, row.key)}
                            className="inline-flex items-center gap-1 text-3xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-200 hover:bg-blue-100"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Drill-down</span>
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">
                          No purchase bills or purchase notes were recorded for this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Next Step Button (Section 1.5.1) */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => setActiveTab("TAB2_IMPORT")}
              disabled={!healthCheckAllowsActions || loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Compare with official GSTR-2B</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {healthCheckMessage && (
            <p aria-live="polite" className={`text-right text-sm font-semibold ${healthCheck.status === "warning" ? "text-amber-800" : "text-red-800"}`}>
              {healthCheckMessage}
            </p>
          )}
        </div>
      )}

      {/* TAB 2: IMPORT OFFICIAL GSTR-2B */}
      {activeTab === "TAB2_IMPORT" && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Upload Official GSTR-2B File</h2>
            <p className="text-xs text-slate-500">
              Download your official GSTR-2B JSON or Excel file from gst.gov.in and upload it here to reconcile with your books.
            </p>
          </div>

          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 bg-slate-50 max-w-lg mx-auto space-y-3 cursor-pointer hover:border-blue-400 transition-all">
            <p className="text-xs font-bold text-slate-700">Drag & Drop official GSTR-2B JSON/Excel file here</p>
            <p className="text-3xs text-slate-400">Supported formats: .json, .xlsx</p>
            <button className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl">Browse Files</button>
          </div>

          <div className="pt-4">
            <button
              onClick={() => setActiveTab("TAB3_RECONCILE")}
              className="inline-flex items-center gap-2 bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
            >
              <span>Proceed to Tab 3: Reconcile</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: RECONCILE */}
      {activeTab === "TAB3_RECONCILE" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Reconciliation Match Summary</h2>

            {/* Final Result Box (Section 1.5.1) */}
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-emerald-900 text-sm">Final ITC Status Box</span>
              <p className="text-emerald-800 font-extrabold">
                ITC you can claim now: ₹{(summary?.itcClaimable || 0).toFixed(2)}. Waiting on suppliers: ₹0.00.
              </p>
              <p className="text-3xs text-emerald-700">This figure feeds the ITC section of GSTR-3B.</p>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down Modal (Section 1.5.1 Drill-down feature) */}
      {showDrilldown && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl p-6 space-y-4 animate-fadeIn max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">Underlying Bills Drill-down</h3>
                <p className="text-xs text-slate-500">Category: {drilldownCategory}</p>
              </div>
              <button onClick={() => setShowDrilldown(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingDrilldown ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading underlying bills...</div>
            ) : drilldownRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No records found in this category.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b text-3xs font-bold text-slate-500 uppercase">
                      <th className="py-2.5 px-3">Document</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3 text-right">Taxable value</th>
                      <th className="py-2.5 px-3 text-right">IGST</th>
                      <th className="py-2.5 px-3 text-right">CGST</th>
                      <th className="py-2.5 px-3 text-right">SGST</th>
                      <th className="py-2.5 px-3 text-right">Cess</th>
                      <th className="py-2.5 px-3 text-right">Total amount</th>
                      <th className="py-2.5 px-3">ITC status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-800">
                    {drilldownRecords.map((b) => (
                      <tr key={b.id}>
                        <td className="whitespace-nowrap py-2.5 px-3 font-mono font-bold text-blue-700">
                          {b.type}: {b.referenceNumber}
                        </td>
                        <td className="whitespace-nowrap py-2.5 px-3">{new Date(b.date).toLocaleDateString("en-IN")}</td>
                        <td className="py-2.5 px-3 font-semibold">{b.vendorName}</td>
                        <td className="whitespace-nowrap py-2.5 px-3 text-right">{formatCurrency(b.taxableValue)}</td>
                        <td className="whitespace-nowrap py-2.5 px-3 text-right">{formatCurrency(b.igst)}</td>
                        <td className="whitespace-nowrap py-2.5 px-3 text-right">{formatCurrency(b.cgst)}</td>
                        <td className="whitespace-nowrap py-2.5 px-3 text-right">{formatCurrency(b.sgst)}</td>
                        <td className="whitespace-nowrap py-2.5 px-3 text-right">{formatCurrency(b.cess)}</td>
                        <td className="whitespace-nowrap py-2.5 px-3 text-right font-bold">
                          {formatCurrency(b.totalAmount)}
                        </td>
                        <td className="whitespace-nowrap py-2.5 px-3">
                          {b.isItcEligible === null ? "Not set" : b.isItcEligible ? "Eligible" : "Ineligible"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
