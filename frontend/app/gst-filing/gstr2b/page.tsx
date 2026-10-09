"use client";

import React, { useState, useEffect, useRef } from "react";
import { apiFetch, downloadFile, downloadFilePost } from "../../lib/api";
import HealthCheckBanner, { type HealthCheckStatus } from "../../components/HealthCheckBanner";
import HealthCheckGateDialog from "../../components/HealthCheckGateDialog";
import { useHealthCheckGate } from "../../lib/useHealthCheckGate";
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
  AlertCircle,
  ListChecks,
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

type ReconRow = {
  supplierGstin: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  booksTax: number | null;
  portalTax: number | null;
  claimable: number | null;
  problem: string;
  fix: string;
};

type ReconResult = {
  period: string;
  periodLabel: string;
  summary: {
    claimNow: number;
    needsChecking: number;
    waitingOnSuppliers: number;
    notClaimable: number;
    notInBooks: number;
  };
  matched: ReconRow[];
  mismatch: ReconRow[];
  waiting: ReconRow[];
  notInBooks: ReconRow[];
  notClaimable: ReconRow[];
  duplicates: ReconRow[];
  skippedBooksBills: number;
};

const money = (n: number | null) => (n === null ? "—" : formatCurrency(n));

function ResultTable({
  title,
  hint,
  rows,
  tone,
  defaultOpen = true,
}: {
  title: string;
  hint: string;
  rows: ReconRow[];
  tone: string;
  defaultOpen?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <details open={defaultOpen} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      <summary className={`cursor-pointer p-4 border-b border-slate-200 ${tone}`}>
        <span className="text-xs font-bold uppercase tracking-wider">
          {title} ({rows.length})
        </span>
        <p className="text-xs mt-1 font-normal normal-case opacity-90">{hint}</p>
      </summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b text-3xs font-bold text-slate-500 uppercase">
              <th className="py-2.5 px-3">Supplier</th>
              <th className="py-2.5 px-3">Invoice</th>
              <th className="py-2.5 px-3 text-right">Your books (tax)</th>
              <th className="py-2.5 px-3 text-right">Government file (tax)</th>
              <th className="py-2.5 px-3">What is the problem?</th>
              <th className="py-2.5 px-3">How to fix it</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-800">
            {rows.map((r, i) => (
              <tr key={`${r.supplierGstin}-${r.invoiceNumber}-${i}`} className="align-top">
                <td className="py-2.5 px-3">
                  <div className="font-semibold">{r.supplierName || "—"}</div>
                  <div className="font-mono text-3xs text-slate-400">{r.supplierGstin}</div>
                </td>
                <td className="py-2.5 px-3">
                  <div className="font-mono font-bold text-blue-700">{r.invoiceNumber}</div>
                  <div className="text-3xs text-slate-400">{r.invoiceDate}</div>
                </td>
                <td className="whitespace-nowrap py-2.5 px-3 text-right">{money(r.booksTax)}</td>
                <td className="whitespace-nowrap py-2.5 px-3 text-right">{money(r.portalTax)}</td>
                <td className="py-2.5 px-3 text-slate-800 leading-relaxed">{r.problem}</td>
                <td className="py-2.5 px-3 text-slate-600 leading-relaxed">{r.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function Gstr2bSectionPage() {
  const [activeTab, setActiveTab] = useState<"TAB1_BOOKS" | "TAB2_IMPORT" | "TAB3_RECONCILE">("TAB1_BOOKS");
  const [period, setPeriod] = useState("102026");
  const [healthCheck, setHealthCheck] = useState<{
    status: HealthCheckStatus | null;
    errors: number;
    warnings: number;
  }>({ status: null, errors: 0, warnings: 0 });
  const gate = useHealthCheckGate(healthCheck);

  // Summary State
  const [summary, setSummary] = useState<Gstr2bSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Drill-down Modal State
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [drilldownCategory, setDrilldownCategory] = useState("");
  const [drilldownRecords, setDrilldownRecords] = useState<Gstr2bDrilldownRecord[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  // Import / reconcile State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedData = useRef<unknown>(null); // the uploaded file, kept so the Excel report can reuse it
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ReconResult | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

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

  const handleDownloadReport = async () => {
    if (!uploadedData.current) return;
    setDownloadingReport(true);
    try {
      await downloadFilePost(
        "/filing/gstr2b/report",
        { period, data: uploadedData.current },
        `GSTR2B_RECONCILIATION_${period}.xlsx`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not download the report.");
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleFile = async (file: File) => {
    setImportError(null);
    setResult(null);
    uploadedData.current = null;
    setFileName(file.name);

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls") || lowerName.endsWith(".csv")) {
      setImportError(
        "This is an Excel file. Please download the JSON file from the GST portal instead (on the GSTR-2B page, choose the JSON download, not Excel). JSON is the one we can read without mistakes."
      );
      return;
    }
    if (lowerName.endsWith(".zip")) {
      setImportError("This is a zip file. Please unzip it first, then upload the .json file from inside it.");
      return;
    }
    if (!lowerName.endsWith(".json")) {
      setImportError("Please upload the GSTR-2B JSON file. The file name should end with .json.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setImportError("This file is too big (more than 10 MB). Please check that you picked the right file.");
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportError("We could not read this file. Please download the GSTR-2B JSON file again from gst.gov.in and upload it here.");
        return;
      }

      const res = await apiFetch<ReconResult>("/filing/gstr2b/import", {
        method: "POST",
        body: JSON.stringify({ period, data: parsed }),
      });

      if (res.data) {
        uploadedData.current = parsed;
        setResult(res.data);
        setActiveTab("TAB3_RECONCILE");
      } else {
        setImportError(res.error || "Could not read the file. Please try again.");
      }
    } finally {
      setImporting(false);
    }
  };

  // Simple "what to do now" list for Tab 3
  const todo: string[] = [];
  if (result) {
    if (result.duplicates.length)
      todo.push(`Delete the extra copy of ${result.duplicates.length} bill(s) that you entered twice. Otherwise your tax credit is counted twice.`);
    if (result.mismatch.length)
      todo.push(`Check ${result.mismatch.length} bill(s) where the amount is different from the government file.`);
    if (result.notInBooks.length)
      todo.push(`Look at ${result.notInBooks.length} bill(s) your supplier reported but you have not entered. Add them if they are yours.`);
    if (result.waiting.length)
      todo.push(`Ask your suppliers to file their return for ${result.waiting.length} bill(s). Do not claim the tax on these yet.`);
    if (result.notClaimable.length)
      todo.push(`Do not claim tax on ${result.notClaimable.length} bill(s) where credit is not allowed.`);
  }

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
              gate.reset();
              setHealthCheck({ status: null, errors: 0, warnings: 0 });
              setResult(null);
              uploadedData.current = null;
              setImportError(null);
              setFileName("");
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

      <div id="health-check-section">
        <HealthCheckBanner
          key={period}
          scope="purchase"
          month={`${period.slice(2)}-${period.slice(0, 2)}`}
          variant="full"
          autoRun={false}
          runToken={gate.runToken}
          onResult={(status, counts) =>
            setHealthCheck({
              status,
              errors: counts?.errors ?? 0,
              warnings: counts?.warnings ?? 0,
            })
          }
        />
      </div>

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
                  onClick={() => gate.guard(() => void handleDownloadBooksWorkbook())}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-white text-blue-900 font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm hover:bg-blue-50 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Download Books Review (.xlsx)</span>
                </button>
              </div>

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
              onClick={() => gate.guard(() => setActiveTab("TAB2_IMPORT"))}
              disabled={loading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>Compare with official GSTR-2B</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: IMPORT OFFICIAL GSTR-2B */}
      {activeTab === "TAB2_IMPORT" && (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Upload Official GSTR-2B File</h2>
            <p className="text-xs text-slate-500">
              Download your GSTR-2B JSON file for the selected month from gst.gov.in and upload it here. We will compare it with your purchase bills.
            </p>
          </div>

          <details className="group max-w-lg mx-auto rounded-xl border border-blue-200 bg-blue-50 text-left text-xs text-blue-900">
            <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 font-bold [&::-webkit-details-marker]:hidden">
              <span>Before you upload: which file to use?</span>
              <span className="text-blue-600 transition-transform group-open:rotate-180">▾</span>
            </summary>

            <div className="space-y-2 px-3 pb-3">
              <p>
                Download the <strong>JSON</strong> file of your GSTR-2B from the GST portal (gst.gov.in) and upload it here. Do not use the Excel file.
              </p>
              <p>
                Make sure the file is for the same month you selected at the top.
              </p>
              <p>
                GSTMitra only helps you compare. Before you file your return, check the final amounts once on the GST portal.
              </p>
            </div>
          </details>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={`border-2 border-dashed rounded-2xl p-8 max-w-lg mx-auto space-y-3 transition-all ${
              dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <p className="text-xs font-bold text-slate-700">Drag &amp; drop the GSTR-2B JSON file here</p>
            <p className="text-3xs text-slate-400">Supported format: .json only (not Excel)</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl disabled:opacity-50"
            >
              {importing ? "Checking file..." : "Browse Files"}
            </button>
            {fileName && <p className="text-3xs text-slate-500">Selected: {fileName}</p>}
          </div>

          {importError && (
            <div className="max-w-lg mx-auto flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-xs font-medium text-red-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => setActiveTab("TAB3_RECONCILE")}
              disabled={!result}
              className="inline-flex items-center gap-2 bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span>View results in Tab 3: Reconcile</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: RECONCILE */}
      {activeTab === "TAB3_RECONCILE" && (
        <div className="space-y-6">
          {!result ? (
            <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-300 text-center space-y-3">
              <p className="text-sm font-bold text-slate-800">No official GSTR-2B file uploaded yet</p>
              <p className="text-xs text-slate-500">Upload the file in Tab 2 to see the comparison here.</p>
              <button
                onClick={() => setActiveTab("TAB2_IMPORT")}
                className="inline-flex items-center gap-2 bg-blue-600 text-white font-bold text-xs px-5 py-2.5 rounded-xl"
              >
                <Upload className="w-4 h-4" />
                <span>Go to Tab 2</span>
              </button>
            </div>
          ) : (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Your bills vs the government file</h2>
                    <p className="text-xs text-slate-500">Month: {result.periodLabel}</p>
                  </div>
                  <button
                    onClick={() => void handleDownloadReport()}
                    disabled={downloadingReport}
                    className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{downloadingReport ? "Preparing..." : "Download Excel report"}</span>
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-3xs font-bold uppercase text-emerald-700">You can claim now</p>
                    <p className="mt-1 text-lg font-extrabold text-emerald-900">{formatCurrency(result.summary.claimNow)}</p>
                    <p className="text-3xs text-emerald-700">{result.matched.length} bills are the same in both lists</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-3xs font-bold uppercase text-amber-700">Check these first</p>
                    <p className="mt-1 text-lg font-extrabold text-amber-900">{formatCurrency(result.summary.needsChecking)}</p>
                    <p className="text-3xs text-amber-700">{result.mismatch.length} bills have a different amount</p>
                  </div>
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-3xs font-bold uppercase text-blue-700">Waiting on your suppliers</p>
                    <p className="mt-1 text-lg font-extrabold text-blue-900">{formatCurrency(result.summary.waitingOnSuppliers)}</p>
                    <p className="text-3xs text-blue-700">{result.waiting.length} bills are not in the government file yet</p>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-3xs font-bold uppercase text-red-700">You cannot claim</p>
                    <p className="mt-1 text-lg font-extrabold text-red-900">{formatCurrency(result.summary.notClaimable)}</p>
                    <p className="text-3xs text-red-700">Credit is not allowed on these bills</p>
                  </div>
                </div>

                {todo.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <ListChecks className="w-4 h-4 text-blue-600" />
                      What you need to do now
                    </p>
                    <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-700">
                      {todo.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                    <p className="text-3xs text-slate-500">Details and exact steps for each bill are in the tables below.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-900">
                    All good. Every bill matches the government file. Nothing to fix.
                  </div>
                )}

                {result.skippedBooksBills > 0 && (
                  <p className="text-3xs text-slate-500">
                    {result.skippedBooksBills} bill(s) in your books were not compared. Imports, reverse-charge bills and bills from unregistered suppliers do not appear in this part of GSTR-2B.
                  </p>
                )}
              </div>

              <ResultTable
                title="Bills entered twice"
                hint="You entered the same bill more than once. Delete the extra copy, or your tax credit will be counted twice."
                rows={result.duplicates}
                tone="bg-red-50 text-red-900"
              />
              <ResultTable
                title="Check these bills"
                hint="Both lists have this bill, but the amount is different. Find out which one is correct."
                rows={result.mismatch}
                tone="bg-amber-50 text-amber-900"
              />
              <ResultTable
                title="Your supplier reported it, but it is not in your books"
                hint="The government file shows a purchase from this supplier that you have not entered."
                rows={result.notInBooks}
                tone="bg-slate-100 text-slate-800"
              />
              <ResultTable
                title="Waiting on your suppliers"
                hint="You entered these bills, but the supplier has not reported them yet. Do not claim the tax until they show up."
                rows={result.waiting}
                tone="bg-blue-50 text-blue-900"
              />
              <ResultTable
                title="Credit not allowed"
                hint="The bill matches, but you cannot claim the tax on it."
                rows={result.notClaimable}
                tone="bg-red-50 text-red-900"
              />
              <ResultTable
                title="All good (matched)"
                hint="Same bill and same amount in both lists."
                rows={result.matched}
                tone="bg-emerald-50 text-emerald-900"
                defaultOpen={false}
              />
            </>
          )}
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
      <HealthCheckGateDialog {...gate.dialogProps} />
    </div>
  );
}