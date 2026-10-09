"use client";

import React, { useState, useEffect } from "react";
import { apiFetch, downloadFile } from "../../lib/api";
import HealthCheckBanner, { type HealthCheckStatus } from "../../components/HealthCheckBanner";
import { Download, FileSpreadsheet } from "lucide-react";

const formatCurrency = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Gstr3bSummary = {
  gstin: string;
  outwardSupplies: {
    invoiceCount: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    totalTax: number;
  };
  eligibleItc: {
    billCount: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    totalItc: number;
  };
  ineligibleItc: {
    billCount: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
  };
  taxEstimator: {
    totalOutwardTax: number;
    totalAvailableItc: number;
    netCashPayable: number;
    plainSummary: string;
  };
};

type SupplementField = { key: string; label: string; group: string };
const SUPPLEMENT_FIELDS: SupplementField[] = [
  { key: "outwardZeroRatedTaxable", label: "Classified from app's 0% sales — zero-rated", group: "3.1 Outward supply classification" },
  { key: "outwardZeroRatedIgst", label: "IGST on these recorded zero-rated sales", group: "3.1 Outward supply classification" },
  { key: "outwardZeroRatedCess", label: "Cess on these recorded zero-rated sales", group: "3.1 Outward supply classification" },
  { key: "outwardZeroRatedAdditionalTaxable", label: "Additional zero-rated value not recorded in app", group: "3.1 Outward supply classification" },
  { key: "outwardZeroRatedAdditionalIgst", label: "IGST on additional zero-rated supplies", group: "3.1 Outward supply classification" },
  { key: "outwardZeroRatedAdditionalCess", label: "Cess on additional zero-rated supplies", group: "3.1 Outward supply classification" },
  { key: "outwardNilExemptTaxable", label: "Classified from app's 0% sales — nil-rated / exempt", group: "3.1 Outward supply classification" },
  { key: "outwardNilExemptAdditionalTaxable", label: "Additional nil-rated / exempt value not recorded in app", group: "3.1 Outward supply classification" },
  { key: "outwardNonGstTaxable", label: "Classified from app's 0% sales — non-GST", group: "3.1 Outward supply classification" },
  { key: "outwardNonGstAdditionalTaxable", label: "Additional non-GST value not recorded in app", group: "3.1 Outward supply classification" },
  { key: "inwardNonGstInter", label: "Non-GST inward supplies — inter-state", group: "5 Inward supplies" },
  { key: "inwardNonGstIntra", label: "Non-GST inward supplies — intra-state", group: "5 Inward supplies" },
  { key: "itcIsdIgst", label: "ISD ITC — IGST", group: "4 ITC Available from ISD" },
  { key: "itcIsdCgst", label: "ISD ITC — CGST", group: "4 ITC Available from ISD" },
  { key: "itcIsdSgst", label: "ISD ITC — SGST/UTGST", group: "4 ITC Available from ISD" },
  { key: "itcIsdCess", label: "ISD ITC — cess", group: "4 ITC Available from ISD" },
  { key: "itcReversedRulesIgst", label: "Rule 38/42/43 and section 17(5) reversal — IGST", group: "4 ITC Reversed" },
  { key: "itcReversedRulesCgst", label: "Rule 38/42/43 and section 17(5) reversal — CGST", group: "4 ITC Reversed" },
  { key: "itcReversedRulesSgst", label: "Rule 38/42/43 and section 17(5) reversal — SGST/UTGST", group: "4 ITC Reversed" },
  { key: "itcReversedRulesCess", label: "Rule 38/42/43 and section 17(5) reversal — cess", group: "4 ITC Reversed" },
  { key: "itcReversedOtherIgst", label: "Other ITC reversal — IGST", group: "4 ITC Reversed" },
  { key: "itcReversedOtherCgst", label: "Other ITC reversal — CGST", group: "4 ITC Reversed" },
  { key: "itcReversedOtherSgst", label: "Other ITC reversal — SGST/UTGST", group: "4 ITC Reversed" },
  { key: "itcReversedOtherCess", label: "Other ITC reversal — cess", group: "4 ITC Reversed" },
  { key: "itcIneligible17Igst", label: "Section 17(5) blocked ITC — IGST", group: "4 Ineligible ITC" },
  { key: "itcIneligible17Cgst", label: "Section 17(5) blocked ITC — CGST", group: "4 Ineligible ITC" },
  { key: "itcIneligible17Sgst", label: "Section 17(5) blocked ITC — SGST/UTGST", group: "4 Ineligible ITC" },
  { key: "itcIneligible17Cess", label: "Section 17(5) blocked ITC — cess", group: "4 Ineligible ITC" },
  { key: "itcIneligibleOtherIgst", label: "Other ineligible ITC not already captured in books — IGST", group: "4 Ineligible ITC" },
  { key: "itcIneligibleOtherCgst", label: "Other ineligible ITC not already captured in books — CGST", group: "4 Ineligible ITC" },
  { key: "itcIneligibleOtherSgst", label: "Other ineligible ITC not already captured in books — SGST/UTGST", group: "4 Ineligible ITC" },
  { key: "itcIneligibleOtherCess", label: "Other ineligible ITC not already captured in books — cess", group: "4 Ineligible ITC" },
  { key: "interestIgst", label: "Interest — IGST", group: "5.1 Interest and late fee" },
  { key: "interestCgst", label: "Interest — CGST", group: "5.1 Interest and late fee" },
  { key: "interestSgst", label: "Interest — SGST/UTGST", group: "5.1 Interest and late fee" },
  { key: "interestCess", label: "Interest — cess", group: "5.1 Interest and late fee" },
  { key: "lateFeeIgst", label: "Late fee — IGST", group: "5.1 Interest and late fee" },
  { key: "lateFeeCgst", label: "Late fee — CGST", group: "5.1 Interest and late fee" },
  { key: "lateFeeSgst", label: "Late fee — SGST/UTGST", group: "5.1 Interest and late fee" },
  { key: "lateFeeCess", label: "Late fee — cess", group: "5.1 Interest and late fee" },
];

type SupplementResponse = {
  values: Record<string, number>;
  confirmed: boolean;
  zeroRateSalesTaxable: number;
};

export default function Gstr3bSectionPage() {
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
      ? "Add invoices or bills first."
      : healthCheck.status === "error"
        ? `Fix ${healthCheck.errors} ${healthCheck.errors === 1 ? "problem" : "problems"} above to download.`
        : healthCheck.status === "warning"
          ? `${healthCheck.warnings} ${healthCheck.warnings === 1 ? "thing" : "things"} to review.`
          : null;
  const [gstr3bSummary, setGstr3bSummary] = useState<Gstr3bSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [supplementValues, setSupplementValues] = useState<Record<string, string>>({});
  const [supplementConfirmed, setSupplementConfirmed] = useState(false);
  const [supplementSaved, setSupplementSaved] = useState(false);
  const [supplementLoading, setSupplementLoading] = useState(true);
  const [savingSupplement, setSavingSupplement] = useState(false);
  const [supplementError, setSupplementError] = useState("");
  const [zeroRateSalesTaxable, setZeroRateSalesTaxable] = useState(0);
  const [editDetailsOpen, setEditDetailsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setSupplementLoading(true);
      setSupplementSaved(false);
      setSupplementConfirmed(false);
      setSupplementError("");
      const [g3Res, supplementRes] = await Promise.all([
        apiFetch<Gstr3bSummary>(`/filing/gstr3b/summary?period=${period}`),
        apiFetch<SupplementResponse>(`/filing/gstr3b/adjustments?period=${period}`),
      ]);
      if (active && g3Res.data) setGstr3bSummary(g3Res.data);
      if (active && supplementRes.data) {
        setZeroRateSalesTaxable(supplementRes.data.zeroRateSalesTaxable);
        setSupplementValues(
          Object.fromEntries(
            SUPPLEMENT_FIELDS.map((field) => [
              field.key,
              String(supplementRes.data!.values[field.key] ?? 0),
            ])
          )
        );
        setSupplementSaved(supplementRes.data.confirmed);
        setSupplementConfirmed(supplementRes.data.confirmed);
      } else if (active && supplementRes.error) {
        setSupplementError(supplementRes.error);
      }
      if (active) setSupplementLoading(false);
      if (active) setLoading(false);

    };

    void loadData();
    return () => {
      active = false;
    };
  }, [period]);

  const saveSupplement = async () => {
    setSupplementError("");
    setSavingSupplement(true);
    const values = Object.fromEntries(
      SUPPLEMENT_FIELDS.map((field) => [field.key, Number(supplementValues[field.key] || 0)])
    );
    const { data, error } = await apiFetch<{ confirmed: boolean }>(`/filing/gstr3b/adjustments`, {
      method: "PUT",
      body: JSON.stringify({ period, values, confirmed: supplementConfirmed }),
    });
    setSavingSupplement(false);
    if (error) {
      setSupplementSaved(false);
      setSupplementError(error);
      if (error.includes("Classify all 0% sales")) setEditDetailsOpen(true);
      return;
    }
    setSupplementSaved(data?.confirmed === true);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            GST Filing &gt; GSTR-3B Tax Summary
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review output tax and purchase ITC estimates for the selected period.
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
        scope="all"
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
            <h2 className="text-lg font-bold text-slate-900">GSTR-3B Tax Summary</h2>
            <p className="text-xs text-slate-500">Sales tax vs Available ITC breakdown</p>
          </div>
          <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-lg">Due 20th Oct</span>
        </div>

        {loading && <p className="text-xs text-slate-500">Loading GSTR-3B summary...</p>}

        {gstr3bSummary && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-3xs text-slate-400 font-bold">Output tax on sales</span>
                <p className="font-extrabold text-sm text-slate-900">
                  {formatCurrency(gstr3bSummary.taxEstimator.totalOutwardTax)}
                </p>
              </div>
              <div>
                <span className="text-3xs text-emerald-600 font-bold">Potential ITC in purchase books</span>
                <p className="font-extrabold text-sm text-emerald-600">
                  {formatCurrency(gstr3bSummary.taxEstimator.totalAvailableItc)}
                </p>
              </div>
              <div className="col-span-2 border-t border-slate-200 pt-3">
                <span className="text-3xs text-indigo-600 font-bold">Estimated cash payable</span>
                <p className="font-extrabold text-sm text-indigo-700">
                  {formatCurrency(gstr3bSummary.taxEstimator.netCashPayable)}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-900">Tax breakdown</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Outward tax and purchase ITC recorded for this period.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3 font-bold">Return category</th>
                      <th className="px-3 py-3 text-right font-bold">Records</th>
                      <th className="px-3 py-3 text-right font-bold">Taxable value</th>
                      <th className="px-3 py-3 text-right font-bold">CGST</th>
                      <th className="px-3 py-3 text-right font-bold">SGST</th>
                      <th className="px-3 py-3 text-right font-bold">IGST</th>
                      <th className="px-3 py-3 text-right font-bold">Cess</th>
                      <th className="px-3 py-3 text-right font-bold">Total tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {([
                      {
                        category: "Outward supplies (sales)",
                        count: gstr3bSummary.outwardSupplies.invoiceCount,
                        taxable: gstr3bSummary.outwardSupplies.taxableValue,
                        cgst: gstr3bSummary.outwardSupplies.cgst,
                        sgst: gstr3bSummary.outwardSupplies.sgst,
                        igst: gstr3bSummary.outwardSupplies.igst,
                        cess: gstr3bSummary.outwardSupplies.cess,
                        totalTax: gstr3bSummary.outwardSupplies.totalTax,
                      },
                      {
                        category: "Eligible ITC",
                        count: gstr3bSummary.eligibleItc.billCount,
                        taxable: gstr3bSummary.eligibleItc.taxableValue,
                        cgst: gstr3bSummary.eligibleItc.cgst,
                        sgst: gstr3bSummary.eligibleItc.sgst,
                        igst: gstr3bSummary.eligibleItc.igst,
                        cess: gstr3bSummary.eligibleItc.cess,
                        totalTax: gstr3bSummary.eligibleItc.totalItc,
                      },
                      {
                        category: "Ineligible ITC",
                        count: gstr3bSummary.ineligibleItc.billCount,
                        taxable: gstr3bSummary.ineligibleItc.taxableValue,
                        cgst: gstr3bSummary.ineligibleItc.cgst,
                        sgst: gstr3bSummary.ineligibleItc.sgst,
                        igst: gstr3bSummary.ineligibleItc.igst,
                        cess: gstr3bSummary.ineligibleItc.cess,
                        totalTax:
                          gstr3bSummary.ineligibleItc.cgst +
                          gstr3bSummary.ineligibleItc.sgst +
                          gstr3bSummary.ineligibleItc.igst +
                          gstr3bSummary.ineligibleItc.cess,
                      },
                    ]).map((row) => (
                      <tr key={row.category} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-900">{row.category}</td>
                        <td className="px-3 py-3 text-right">{row.count}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.taxable)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.cgst)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.sgst)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.igst)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">{formatCurrency(row.cess)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-900">
                          {formatCurrency(row.totalTax)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                This is an estimate from your books, not your final tax liability. Verify eligible ITC and liability on
                the GST portal before filing.
              </p>
            </div>

            <div className="p-3 bg-blue-900 text-white rounded-xl text-xs space-y-1">
              <span className="text-3xs text-blue-200 font-bold uppercase">Plain Summary</span>
              <p className="font-bold">{gstr3bSummary.taxEstimator.plainSummary}</p>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold">Review summary only — not a GST portal upload file.</p>
              <p className="mt-1">
                Purchase-book ITC can differ from eligible ITC after GSTR-2B reconciliation and other legal checks.
                Verify the figures and complete your return on the GST portal.
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-slate-200 p-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Calculated from your GSTMitra records</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Sales tax and purchase ITC above are calculated from the invoices and bills you entered. Other
                  return details start at ₹0 because GSTMitra cannot infer them from those records. You can use the
                  calculated values or open the editor below to add or correct details.
                </p>
                <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-900">
                  This workbook is a review aid, not a GST portal filing file. If you have no relevant adjustments,
                  keep the additional values at zero.
                </p>
              </div>
              {supplementLoading ? (
                <p className="text-xs text-slate-500">Loading period-specific values…</p>
              ) : (
                <>
                  <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                    <input
                      type="checkbox"
                      checked={supplementConfirmed}
                      onChange={(event) => {
                        setSupplementConfirmed(event.target.checked);
                        setSupplementSaved(false);
                      }}
                      className="mt-0.5"
                    />
                    <span>
                      I understand this is a review workbook; information not available in my GSTMitra records will
                      appear as zero unless I edit it.
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveSupplement()}
                    disabled={!supplementConfirmed || savingSupplement || !healthCheckAllowsActions}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingSupplement ? "Applying values…" : "Use calculated values"}
                  </button>
                  {healthCheckMessage && (
                    <p aria-live="polite" className={`text-sm font-semibold ${healthCheck.status === "warning" ? "text-amber-800" : "text-red-800"}`}>
                      {healthCheckMessage}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditDetailsOpen((open) => !open)}
                    className="block text-xs font-bold text-blue-700 underline underline-offset-2"
                  >
                    {editDetailsOpen ? "Hide edit details" : "Review / edit details"}
                  </button>
                  {editDetailsOpen && (
                    <>
                  {zeroRateSalesTaxable > 0 && (
                    <p className="rounded-lg bg-blue-50 p-2 text-xs text-blue-900">
                      GSTMitra has {formatCurrency(zeroRateSalesTaxable)} of sales with a 0% rate. Split this amount
                      between zero-rated, nil/exempt, or non-GST below. A 0% rate alone does not tell the app which
                      classification is correct.
                    </p>
                  )}
                  {Array.from(new Set(SUPPLEMENT_FIELDS.map((field) => field.group))).map((group) => (
                    <fieldset key={group} className="space-y-2">
                      <legend className="text-xs font-bold text-slate-800">{group}</legend>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {SUPPLEMENT_FIELDS.filter((field) => field.group === group).map((field) => (
                          <label key={field.key} className="text-xs text-slate-700">
                            {field.label}
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={supplementValues[field.key] ?? "0"}
                              onChange={(event) => {
                                setSupplementValues((previous) => ({ ...previous, [field.key]: event.target.value }));
                                setSupplementSaved(false);
                                setSupplementConfirmed(false);
                              }}
                              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right"
                            />
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  </>
                  )}
                  {supplementError && <p className="text-xs font-semibold text-red-700">{supplementError}</p>}
                  {supplementSaved && (
                    <p className="text-xs font-semibold text-emerald-700">Reviewed values saved for this period.</p>
                  )}
                  {editDetailsOpen && (
                    <button
                      type="button"
                      onClick={() => void saveSupplement()}
                      disabled={!supplementConfirmed || savingSupplement}
                      className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingSupplement ? "Applying values…" : "Apply edited values"}
                    </button>
                  )}
                </>
              )}
            </div>

            <button
              disabled={!supplementSaved || supplementLoading || !healthCheckAllowsActions}
              onClick={() =>
                void downloadFile(
                  `/filing/gstr3b/excel?period=${period}`,
                  `GSTR3B_REVIEW_${gstr3bSummary.gstin}_${period}.xlsx`
                ).catch((error: unknown) => alert(error instanceof Error ? error.message : "Could not download the review workbook."))
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 font-bold text-white shadow-md transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {supplementSaved ? "Download GSTR-3B review workbook (.xlsx)" : "Confirm values above to enable download"}
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
