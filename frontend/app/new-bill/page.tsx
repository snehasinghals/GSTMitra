"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, API_BASE_URL } from "../lib/api";
import { useApi } from "../lib/useApi";
import { TableSkeleton, TableError } from "../components/TableSkeleton";
import AddPaymentModal from "../sales/components/AddPaymentModal";
import { Download, FileText, IndianRupee, Plus, Search, X } from "lucide-react";

const RECENT_LIMIT = 15; // change to 10 or 20 if you prefer

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const formatINR = (n: number) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const paymentInfo = (inv: any) => {
  const total = Number(inv.totalAmount) || 0;
  const paid = Number(inv.paidAmount) || 0;
  const pending = Math.max(0, r2(total - paid));
  const status: "PAID" | "PARTIAL" | "UNPAID" =
    inv.paymentStatus || (pending <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID");
  return { total, pending, status };
};

export default function NewBillHomePage() {
  const invoicesQ = useApi<any[]>("/sales/invoices?view=list");

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);
  const [toast, setToast] = useState("");

  // Search
  const [query, setQuery] = useState("");
  const [matchedCustomerIds, setMatchedCustomerIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  // Find customers by Mitra ID / name / phone, so their bills show up even when
  // the invoice list itself does not carry the Mitra ID.
  useEffect(() => {
    if (query.trim().length < 2) {
      setMatchedCustomerIds([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      const term = encodeURIComponent(query.trim());
      const ids = new Set<string>();
      try {
        const [mitra, found] = await Promise.all([
          apiFetch<any>(`/customers/lookup-mitra?id=${term}`),
          apiFetch<any[]>(`/customers/search?q=${term}`),
        ]);
        if (mitra.data && mitra.data.found && mitra.data.customerId) ids.add(mitra.data.customerId);
        if (Array.isArray(found.data)) found.data.forEach((c) => c && c.id && ids.add(c.id));
      } catch {
        // fall back to the text match below
      }
      if (!active) return;
      setMatchedCustomerIds([...ids]);
      setSearching(false);
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query]);

  // Newest first. No search: only the most recent few. Search: every matching bill.
  const recent = useMemo(() => {
    const list = (invoicesQ.data ?? []).filter((inv) => inv.status !== "CANCELLED");
    const stamp = (inv: any) => new Date(inv.createdAt || inv.invoiceDate).getTime() || 0;
    const sorted = [...list].sort((a, b) => stamp(b) - stamp(a));
    if (!q) return sorted.slice(0, RECENT_LIMIT);

    const ids = new Set(matchedCustomerIds);
    return sorted.filter((inv) => {
      const cid = inv.customerId || inv.customer?.id;
      const text = [inv.invoiceNumber, inv.customer?.name, inv.customer?.mitraId, inv.customer?.phone, inv.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q) || (cid && ids.has(cid));
    });
  }, [invoicesQ.data, q, matchedCustomerIds]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleDownloadPdf = async (invId: string, invNum: string) => {
    if (downloadingId) return;
    setDownloadingId(invId);
    try {
      const token = localStorage.getItem("gstmitra_token");
      const res = await fetch(`${API_BASE_URL}/sales/invoices/${invId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        alert("Could not download the invoice PDF. Please try again.");
        return;
      }
      const url = window.URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invNum}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Could not download the invoice PDF. Please check your connection.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="w-full space-y-5 pb-10">
      {/* Header + main action */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">New Invoice</h1>
          <p className="mt-0.5 text-sm text-slate-500">Create a GST invoice in a few taps.</p>
        </div>
        <Link
          href="/new-bill/create"
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Generate invoice
        </Link>
      </div>

      {/* Recent invoices */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            {isSearching ? `Search results (${recent.length})` : "Recent invoices"}
          </h2>

          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by Mitra ID, name or invoice number"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Link href="/sales" className="shrink-0 text-xs font-medium text-blue-600 hover:underline">
            View all in Sales
          </Link>
        </div>

        {invoicesQ.loading ? (
          <TableSkeleton />
        ) : invoicesQ.error && recent.length === 0 ? (
          <TableError message={invoicesQ.error.message} onRetry={() => invoicesQ.mutate()} />
        ) : isSearching && recent.length === 0 ? (
          <div className="space-y-2 p-10 text-center">
            <Search className="mx-auto h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              {searching ? "Searching…" : `No bills found for “${query.trim()}”`}
            </p>
            {!searching && (
              <p className="text-xs text-slate-500">
                Try the full Mitra ID (for example rahul@4821), an invoice number or the customer name.
              </p>
            )}
          </div>
        ) : recent.length === 0 ? (
          <div className="space-y-3 p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">No invoices yet</p>
            <p className="text-xs text-slate-500">Your latest invoices will show up here.</p>
            <Link
              href="/new-bill/create"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Generate your first invoice
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((inv) => {
              const { total, pending, status } = paymentInfo(inv);
              return (
                <li key={inv.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-blue-700">{inv.invoiceNumber}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(inv.invoiceDate).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm font-medium text-slate-900">
                      {inv.customer?.name || "Customer"}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-900">{formatINR(total)}</p>
                      {pending > 0 ? (
                        <p className="text-xs text-amber-700">Pending {formatINR(pending)}</p>
                      ) : (
                        <p className="text-xs text-emerald-700">Paid</p>
                      )}
                    </div>

                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        status === "PAID"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : status === "PARTIAL"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {status === "PAID" ? "Paid" : status === "PARTIAL" ? "Part paid" : "Unpaid"}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {pending > 0 && (
                        <button
                          type="button"
                          onClick={() => setPaymentInvoice(inv)}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          <IndianRupee className="h-3.5 w-3.5" />
                          Add payment
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                        disabled={downloadingId === inv.id}
                        title="Download invoice PDF"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {downloadingId === inv.id ? "…" : "PDF"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {paymentInvoice && (
        <AddPaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => {
            invoicesQ.mutate();
            showToast("Payment recorded successfully");
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-lg">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}