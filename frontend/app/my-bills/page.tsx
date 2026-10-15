"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE_URL } from "../lib/api";
import {
  Receipt,
  QrCode,
  Search,
  Download,
  Calendar,
  Store,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  Check,
  Phone,
  ArrowRight,
  AlertCircle,
  Clock,
  Sparkles,
  IndianRupee,
  Bell,
  ExternalLink,
} from "lucide-react";

type BillItem = {
  id: string;
  description: string;
  hsnSacCode?: string | null;
  quantity: number;
  unit: string;
  rate: number;
  gstRate: number;
  totalAmount: number;
};

type MyBill = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  subtotal: number;
  totalTax: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: string;
  paymentMode: string;
  lastReminderSentAt?: string | null;
  reminderCount?: number;
  seller: {
    name: string;
    phone?: string | null;
    address?: string | null;
    gstin?: string | null;
    upiId?: string | null;
  };
  items: BillItem[];
};

type Summary = {
  totalBills: number;
  totalSpent: number;
  paidAmount: number;
  unpaidAmount: number;
  unpaidCount: number;
};

export default function MyBillsPage() {
  const { user } = useAuth();
  const [bills, setBills] = useState<MyBill[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalBills: 0,
    totalSpent: 0,
    paidAmount: 0,
    unpaidAmount: 0,
    unpaidCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PAID" | "UNPAID">("ALL");
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [payBill, setPayBill] = useState<MyBill | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (filterStatus !== "ALL") params.set("status", filterStatus);

    const qs = params.toString() ? `?${params.toString()}` : "";
    const { data, error: err } = await apiFetch<{ bills: MyBill[]; summary: Summary }>(`/my-bills${qs}`);
    setLoading(false);

    if (err) {
      setError(err);
      return;
    }
    if (data) {
      setBills(data.bills || []);
      setSummary(
        data.summary || {
          totalBills: 0,
          totalSpent: 0,
          paidAmount: 0,
          unpaidAmount: 0,
          unpaidCount: 0,
        }
      );
    }
  }, [searchQuery, filterStatus]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchBills();
    }, 200);
    return () => clearTimeout(t);
  }, [fetchBills]);

  const handleDownloadPdf = async (billId: string, invoiceNumber: string) => {
    setDownloadingId(billId);
    try {
      const token = localStorage.getItem("gstmitra_token");
      const res = await fetch(`${API_BASE_URL}/my-bills/${billId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        alert("Failed to download bill PDF. Please try again.");
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bill_${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Error downloading bill PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="w-full space-y-5 pb-12 pt-2 sm:pt-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">My Bills</h1>
            <p className="text-xs text-slate-500">
              Personal purchase receipts received on your Mitra ID or phone
            </p>
          </div>
        </div>

        {user?.mitraId && (
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <QrCode className="h-4 w-4" />
            <span>Show My Mitra QR</span>
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-3xs font-bold uppercase tracking-wider text-slate-400">Total Spent</span>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-slate-900">
            ₹{summary.totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-3xs font-bold uppercase tracking-wider text-slate-400">Total Bills</span>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-slate-900">
            {summary.totalBills} {summary.totalBills === 1 ? "Bill" : "Bills"}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-3xs font-bold uppercase tracking-wider text-emerald-600">Paid Amount</span>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-emerald-600">
            ₹{summary.paidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-3xs font-bold uppercase tracking-wider text-amber-600">To Pay / Pending</span>
          <p className="mt-1 text-lg sm:text-2xl font-extrabold text-amber-600">
            ₹{summary.unpaidAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Search and Tabs */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFilterStatus("ALL")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                filterStatus === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              All Bills
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("PAID")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                filterStatus === "PAID"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus("UNPAID")}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                filterStatus === "UNPAID"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              Pending / Unpaid {summary.unpaidCount > 0 ? `(${summary.unpaidCount})` : ""}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] sm:w-72">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by shop or bill #..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bill List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-5" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
          <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />
          <p>{error}</p>
          <button
            type="button"
            onClick={fetchBills}
            className="mt-3 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      ) : bills.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
            <Receipt className="h-8 w-8" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">
            {searchQuery || filterStatus !== "ALL" ? "No matching bills found" : "No retail bills yet"}
          </h2>
          <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed">
            {searchQuery || filterStatus !== "ALL"
              ? "Try adjusting your search terms or filter."
              : "When you shop at any GSTMitra store and share your Mitra ID or phone number, your digital bills will appear right here."}
          </p>
          {user?.mitraId && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <QrCode className="h-4 w-4" />
              <span>Show My Mitra ID QR</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill) => {
            const isExpanded = expandedBillId === bill.id;
            const isPaid = bill.paymentStatus === "PAID";
            const isPartial = bill.paymentStatus === "PARTIAL";

            return (
              <div
                key={bill.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:border-slate-300"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Bill Header Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600">
                          #{bill.invoiceNumber}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase tracking-wide ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : isPartial
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {isPaid ? "Paid" : isPartial ? "Partially Paid" : "Unpaid"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Store className="h-4 w-4 text-slate-400" />
                        <span>{bill.seller.name}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {formatDate(bill.invoiceDate)}
                        </span>
                        {bill.seller.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-slate-400" />
                            {bill.seller.phone}
                          </span>
                        )}
                        <span>{bill.items.length} {bill.items.length === 1 ? "item" : "items"}</span>
                      </div>

                      {bill.lastReminderSentAt && bill.pendingAmount > 0 && !isPaid && (
                        <div className="mt-2 flex items-center gap-1.5 text-2xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 w-fit">
                          <Bell className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          <span>Payment reminder from seller ({formatDate(bill.lastReminderSentAt)})</span>
                        </div>
                      )}
                    </div>

                    {/* Amount & Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 gap-2">
                      <div className="text-left sm:text-right">
                        <div className="text-xs text-slate-400 font-medium">Total Amount</div>
                        <div className="text-xl font-extrabold text-slate-900">
                          ₹{bill.totalAmount.toFixed(2)}
                        </div>
                        {bill.pendingAmount > 0 && !isPaid && (
                          <div className="text-2xs font-semibold text-amber-600">
                            Due: ₹{bill.pendingAmount.toFixed(2)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {bill.pendingAmount > 0 && !isPaid && bill.seller.upiId && (
                          <button
                            type="button"
                            onClick={() => setPayBill(bill)}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
                          >
                            <IndianRupee className="h-3.5 w-3.5" />
                            <span>Pay via UPI</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(bill.id, bill.invoiceNumber)}
                          disabled={downloadingId === bill.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>{downloadingId === bill.id ? "Downloading..." : "PDF"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setExpandedBillId(isExpanded ? null : bill.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                        >
                          <span>{isExpanded ? "Hide items" : "View items"}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Items Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Purchased Items ({bill.items.length})
                    </h4>
                    <div className="space-y-2">
                      {bill.items.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-xs"
                        >
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-900">{item.description}</span>
                            <div className="text-2xs text-slate-500">
                              Qty: {item.quantity} {item.unit || "PCS"} × ₹{item.rate.toFixed(2)}
                              {item.gstRate > 0 ? ` (GST ${item.gstRate}%)` : " (Nil GST)"}
                            </div>
                          </div>
                          <span className="font-bold text-slate-900">₹{item.totalAmount.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap justify-between border-t border-slate-200/80 pt-3 text-xs text-slate-600">
                      <div>
                        <span>Subtotal: ₹{bill.subtotal.toFixed(2)}</span>
                        <span className="mx-2">·</span>
                        <span>Total Tax: ₹{bill.totalTax.toFixed(2)}</span>
                      </div>
                      <div className="font-bold text-slate-900">
                        Total: ₹{bill.totalAmount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Customer QR Modal */}
      {showQrModal && user && (
        <CustomerQrModal
          user={user}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Pay via UPI Modal */}
      {payBill && (
        <CustomerPayUpiModal
          bill={payBill}
          onClose={() => setPayBill(null)}
        />
      )}
    </div>
  );
}

function CustomerQrModal({
  user,
  onClose,
}: {
  user: { name: string; mitraId?: string; phone?: string };
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user.mitraId) return;
    QRCode.toDataURL(user.mitraId, { width: 260, margin: 2 }, (err, url) => {
      if (!err && url) setQrDataUrl(url);
    });
  }, [user.mitraId]);

  const handleCopy = () => {
    if (!user.mitraId) return;
    navigator.clipboard.writeText(user.mitraId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl text-center">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">My Mitra ID QR</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <p className="text-xs text-slate-500">
          Show this QR code at any shop checkout so your bill automatically saves to &ldquo;My Bills&rdquo;.
        </p>

        {qrDataUrl ? (
          <div className="mx-auto w-fit rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-inner">
            <img src={qrDataUrl} alt="Mitra ID QR" className="h-52 w-52" />
          </div>
        ) : (
          <div className="h-52 w-52 mx-auto flex items-center justify-center bg-slate-100 rounded-2xl text-xs text-slate-400">
            Generating QR...
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
          <span className="block text-3xs font-bold uppercase tracking-wider text-slate-400">Mitra ID</span>
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-extrabold text-blue-700">{user.mitraId}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 rounded-lg bg-white border border-slate-200 px-2 py-1 text-2xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-semibold text-white hover:bg-black transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CustomerPayUpiModal({
  bill,
  onClose,
}: {
  bill: MyBill;
  onClose: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const upiId = bill.seller.upiId?.trim() || "";
  const shopName = bill.seller.name;
  const amount = bill.pendingAmount;

  const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${amount.toFixed(2)}&tn=${encodeURIComponent(`Bill ${bill.invoiceNumber}`)}`;

  useEffect(() => {
    if (!upiId) return;
    QRCode.toDataURL(upiUri, { width: 260, margin: 2 }, (err, url) => {
      if (!err && url) setQrUrl(url);
    });
  }, [upiId, upiUri]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl text-center">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Pay via UPI</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-left space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Pay to:</span>
            <span className="font-semibold text-slate-900">{shopName}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Bill:</span>
            <span className="font-mono font-medium text-slate-900">#{bill.invoiceNumber}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 border-t border-slate-200 pt-1 mt-1">
            <span className="font-semibold text-slate-700">Amount Due:</span>
            <span className="font-extrabold text-blue-700">₹{amount.toFixed(2)}</span>
          </div>
        </div>

        {qrUrl ? (
          <div className="mx-auto w-fit rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-inner">
            <img src={qrUrl} alt="UPI Payment QR" className="h-48 w-48" />
            <p className="mt-1 text-2xs text-slate-400">Scan with GPay, PhonePe, Paytm, BHIM</p>
          </div>
        ) : (
          <div className="h-48 w-48 mx-auto flex items-center justify-center bg-slate-100 rounded-2xl text-xs text-slate-400">
            Generating Payment QR...
          </div>
        )}

        <div className="space-y-2 pt-1">
          <a
            href={upiUri}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open UPI App to Pay</span>
          </a>

          <p className="text-3xs text-slate-400 leading-tight">
            After completing payment, the shopkeeper confirms receipt and your bill will mark as Paid.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
}