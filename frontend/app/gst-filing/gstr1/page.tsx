"use client";

import React, { useState, useEffect } from "react";
import { apiFetch, downloadFile } from "../../lib/api";
import HealthCheckBanner, { type HealthCheckStatus } from "../../components/HealthCheckBanner";
import { Download, FileSpreadsheet } from "lucide-react";

const formatCurrency = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type HsnSummaryRow = {
  hsn: string;
  desc: string;
  rate: number;
  qty: number;
  unit: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
};

type Gstr1Summary = {
  gstin: string;
  totalInvoices: number;
  b2bCount: number;
  totals: { totalSales: number; totalTax: number };
  hsnSummary: HsnSummaryRow[];
};

export default function Gstr1SectionPage() {
  const [period, setPeriod] = useState("102026");
  const [gstr1Summary, setGstr1Summary] = useState<Gstr1Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthCheck, setHealthCheck] = useState<{
    status: HealthCheckStatus | null;
    errors: number;
    warnings: number;
  }>({ status: null, errors: 0, warnings: 0 });
  const healthCheckAllowsDownload =
    healthCheck.status === "ok" || healthCheck.status === "warning";

  const healthCheckMessage =
    healthCheck.status === "empty"
      ? "Add sales invoices first."
      : healthCheck.status === "error"
        ? `Fix ${healthCheck.errors} ${healthCheck.errors === 1 ? "problem" : "problems"} above to download.`
        : healthCheck.status === "warning"
          ? `${healthCheck.warnings} ${healthCheck.warnings === 1 ? "thing" : "things"} to review.`
          : null;

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const g1Res = await apiFetch<Gstr1Summary>(`/filing/gstr1/summary?period=${period}`);
      if (active && g1Res.data) setGstr1Summary(g1Res.data);
      if (active) setLoading(false);
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [period]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            GST Filing &gt; GSTR-1 Sales Return
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review outward supplies and invoice figures for the selected period.
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

      <HealthCheckBanner
        key={period}
        scope="sales"
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

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">GSTR-1 Sales Return</h2>
            <p className="text-xs text-slate-500">Outward supplies & customer invoice data</p>
          </div>
          <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-lg">Due 11th Oct</span>
        </div>

        {loading && <p className="text-xs text-slate-500">Loading GSTR-1 summary...</p>}

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

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-900">HSN/SAC tax summary</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Sales grouped by HSN/SAC code and GST rate for this filing period.
                </p>
              </div>
              {gstr1Summary.hsnSummary.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">No sales items to summarize for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-xs">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-3 font-bold">HSN/SAC</th>
                        <th className="px-3 py-3 font-bold">Description</th>
                        <th className="px-3 py-3 text-right font-bold">GST rate</th>
                        <th className="px-3 py-3 text-right font-bold">Quantity</th>
                        <th className="px-3 py-3 text-right font-bold">Taxable value</th>
                        <th className="px-3 py-3 text-right font-bold">IGST</th>
                        <th className="px-3 py-3 text-right font-bold">CGST</th>
                        <th className="px-3 py-3 text-right font-bold">SGST</th>
                        <th className="px-3 py-3 text-right font-bold">Cess</th>
                        <th className="px-3 py-3 text-right font-bold">Total amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {gstr1Summary.hsnSummary.map((row, index) => (
                        <tr key={`${row.hsn}-${row.rate}-${index}`} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-slate-900">
                            {row.hsn || "—"}
                          </td>
                          <td className="px-3 py-3">{row.desc}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">{row.rate}%</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">
                            {row.qty.toLocaleString("en-IN")} {row.unit}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.taxable)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.igst)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.cgst)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.sgst)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.cess)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-900">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">Review summary only — not a GST portal upload file.</p>
              <p className="mt-1">
                Compare these figures with your records, review the health check, and complete your return on the
                GST portal. These checks are decision support, not a guarantee that a return is error-free.
              </p>
            </div>
            <button
              disabled={!healthCheckAllowsDownload || loading}
              onClick={() =>
                void downloadFile(
                  `/filing/gstr1/excel?period=${period}`,
                  `GSTR1_REVIEW_${gstr1Summary.gstin}_${period}.xlsx`
                ).catch((error: unknown) => alert(error instanceof Error ? error.message : "Could not download the review workbook."))
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 font-bold text-white shadow-md transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Download GSTR-1 review workbook (.xlsx)
            </button>
            {healthCheckMessage && (
              <p aria-live="polite" className={`text-sm font-semibold ${healthCheck.status === "warning" ? "text-amber-800" : "text-red-800"}`}>
                {healthCheckMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
