"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE_URL } from "../lib/api";
import { BillCameraScanner } from "../components/BillCameraScanner";
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
  Trash2,
  Plus,
  Upload,
  Camera,
  Loader2,
  Paperclip,
  Eye,
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
  source?: "SELLER" | "PERSONAL";
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
  receiptUrl?: string | null;
  notes?: string | null;
  seller: {
    name: string;
    phone?: string | null;
    address?: string | null;
    gstin?: string | null;
    upiId?: string | null;
  };
  Items: BillItem[];
};

type Summary = {
  totalBills: number;
  totalSpent: number;
  paidAmount: number;
  unpaidAmount: number;
  unpaidCount: number;
};

const GST_RATES = [0, 5, 12, 18, 28];

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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Add Bill Modals & Camera states
  const [showManualModal, setShowManualModal] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractingMsg, setExtractingMsg] = useState("");
  const [prefilledData, setPrefilledData] = useState<any>(null);
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

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

  // Extract receipt via API
  const handleExtractFiles = async (files: Array<{ name: string; type: string; data: string }>) => {
    if (!files || files.length === 0) return;
    setIsExtracting(true);
    setExtractingMsg("Reading receipt details with AI scanner...");

    try {
      const res = await apiFetch<{
        success: boolean;
        extractedCount: number;
        bills: Array<{
          shopName: string;
          billNumber: string;
          billDate: string;
          totalAmount: number;
          subtotal: number;
          totalTax: number;
          fileUrl?: string;
          Items: Array<{
            description: string;
            quantity: number;
            unit: string;
            rate: number;
            gstRate: number;
            totalAmount: number;
          }>;
        }>;
      }>("/my-bills/extract-bill", {
        method: "POST",
        body: JSON.stringify({ files }),
      });

      if (res.error || !res.data || !res.data.bills?.length) {
        throw new Error(res.error || "Could not read bill details from image.");
      }

      const extracted = res.data.bills[0];
      setPrefilledData({
        shopName: extracted.shopName || "",
        billNumber: extracted.billNumber || "",
        billDate: extracted.billDate || new Date().toISOString().substring(0, 10),
        receiptUrl: extracted.fileUrl || null,
        items: extracted.Items?.length
          ? extracted.Items.map((it) => ({
              description: it.description || "Item",
              quantity: it.quantity || 1,
              rate: it.rate || 0,
              gstRate: it.gstRate || 0,
            }))
          : [{ description: "Grocery / Shopping item", quantity: 1, rate: extracted.totalAmount || 0, gstRate: 0 }],
      });

      setShowManualModal(true);
      showToast("Receipt details extracted! Please review and save.");
    } catch (err: any) {
      alert(err.message || "Failed to extract details from receipt. Please enter manually.");
      setPrefilledData(null);
      setShowManualModal(true);
    } finally {
      setIsExtracting(false);
      setExtractingMsg("");
    }
  };

  // Handle direct file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result as string;
      handleExtractFiles([{ name: file.name, type: file.type, data: base64Data }]);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

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

  const handleDeleteMyBill = async (billId: string, invoiceNumber: string) => {
    if (!window.confirm(`Delete bill #${invoiceNumber} from your shopping bills?`)) return;
    setDeletingId(billId);
    try {
      const { error: err } = await apiFetch(`/my-bills/${billId}`, { method: "DELETE" });
      if (err) {
        alert(err);
        return;
      }
      setBills((prev) => prev.filter((b) => b.id !== billId));
      fetchBills();
      showToast("Bill deleted successfully.");
    } catch {
      alert("Failed to delete bill.");
    } finally {
      setDeletingId(null);
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
      {/* Hidden file input for Upload Bill */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,application/pdf"
        className="hidden"
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">My Shopping Bills</h1>
            <p className="text-xs text-slate-500">
              Personal purchase receipts received from shops or added by you
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPrefilledData(null);
              setShowManualModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Manual Entry</span>
          </button>

          {/* <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Bill</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCameraScanner(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-800 shadow-2xs hover:bg-slate-50 hover:border-slate-400 transition"
          >
            <Camera className="h-4 w-4 text-emerald-600" />
            <span>Scan / Take Photo</span>
          </button> */}

          {user?.mitraId && (
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition"
            >
              <QrCode className="h-4 w-4" />
              <span>My Mitra QR</span>
            </button>
          )}
        </div>
      </div>

      {/* Smart Add Bill Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50/40 to-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-emerald-500/15 text-emerald-700 rounded-xl mt-0.5 shrink-0">
              <Sparkles className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Add Shopping Bill</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Instant AI OCR
                </span>
              </h3>
              <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                Keep all your retail and shopping bills in one place! Add bills by typing details manually, uploading photos/PDFs, or snapping receipts directly with your camera.
              </p>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2.5 shrink-0 self-start sm:self-center">
            {/* <button
              type="button"
              onClick={() => {
                setPrefilledData(null);
                setShowManualModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Manual Entry</span>
            </button> */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition shrink-0"
            >
              <Upload className="w-4 h-4" />
              <span>Upload Bill</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCameraScanner(true)}
              className="inline-flex items-center gap-2 bg-white hover:bg-emerald-50/80 active:bg-emerald-100 text-slate-800 border border-slate-300 hover:border-emerald-300 font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-2xs transition shrink-0"
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>Scan / Take Photo</span>
            </button>
          </div>
        </div>
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
              : "Keep all your retail and shopping bills organized here. Add a bill manually, upload receipt photos, or scan with your camera."}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setPrefilledData(null);
                setShowManualModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              <span>Add Bill Manually</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
            >
              <Upload className="h-4 w-4" />
              <span>Upload Bill</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {bills.map((bill) => {
            const isExpanded = expandedBillId === bill.id;
            const isPaid = bill.paymentStatus === "PAID";
            const isPartial = bill.paymentStatus === "PARTIAL";
            const isPersonal = bill.source === "PERSONAL";

            return (
              <div
                key={bill.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:border-slate-300"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Bill Header Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-600">
                          #{bill.invoiceNumber}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 border ${
                            isPaid
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : isPartial
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {isPaid ? "Paid" : isPartial ? "Partially Paid" : "Unpaid"}
                        </span>
                        {isPersonal ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                            Personal Entry
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            From Store
                          </span>
                        )}
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
                        <span>{bill.Items.length} {bill.Items.length === 1 ? "item" : "Items"}</span>
                        {bill.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => setViewingReceiptUrl(bill.receiptUrl || null)}
                            className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold"
                          >
                            <Paperclip className="h-3 w-3" />
                            <span>View Receipt</span>
                          </button>
                        )}
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
                        {bill.pendingAmount > 0 && !isPaid && !!bill.seller?.upiId?.trim() && (
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
                          <span>{isExpanded ? "Hide Items" : "View Items"}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteMyBill(bill.id, bill.invoiceNumber)}
                          disabled={deletingId === bill.id}
                          title="Delete this bill from your shopping bills"
                          className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{deletingId === bill.id ? "..." : "Delete"}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Items Drawer */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Purchased Items ({bill.Items.length})
                    </h4>
                    <div className="space-y-2">
                      {bill.Items.map((item, idx) => (
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
                        <span>Estimated Tax: ₹{bill.totalTax.toFixed(2)}</span>
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

      {/* Manual Bill Entry Modal (Without More Options) */}
      {showManualModal && (
        <AddManualShoppingBillModal
          isOpen={showManualModal}
          onClose={() => {
            setShowManualModal(false);
            setPrefilledData(null);
          }}
          onSaved={() => {
            setShowManualModal(false);
            setPrefilledData(null);
            fetchBills();
            showToast("Shopping bill saved successfully!");
          }}
          initialData={prefilledData}
        />
      )}

      {/* Camera Scanner Modal */}
      <BillCameraScanner
        isOpen={showCameraScanner}
        onClose={() => setShowCameraScanner(false)}
        onCapture={(captured) => {
          setShowCameraScanner(false);
          handleExtractFiles(captured);
        }}
      />

      {/* Extraction Loading Overlay */}
      {isExtracting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Scanning Shopping Receipt</h3>
              <p className="mt-1 text-xs text-slate-500">
                {extractingMsg || "Extracting shop name, date, items, and totals..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* View Uploaded Receipt Attachment Modal */}
      {viewingReceiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900">Shopping Receipt Preview</h3>
              <button
                type="button"
                onClick={() => setViewingReceiptUrl(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[75vh] overflow-auto bg-slate-100">
              {viewingReceiptUrl.endsWith(".pdf") ? (
                <iframe
                  src={`${API_BASE_URL}${viewingReceiptUrl}`}
                  className="w-full h-[500px] rounded-xl border border-slate-200"
                  title="Receipt PDF"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`${API_BASE_URL}${viewingReceiptUrl}`}
                  alt="Receipt Preview"
                  className="max-h-[65vh] w-auto rounded-xl object-contain shadow-sm"
                />
              )}
            </div>
          </div>
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

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-lg animate-fadeIn flex items-center gap-2">
          <Check className="h-4 w-4" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Manual Bill Entry Modal
// Completely clean: No "More options" dropdown, No ITC, No vendor GSTIN toggles
// -------------------------------------------------------------------------
function AddManualShoppingBillModal({
  isOpen,
  onClose,
  onSaved,
  initialData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialData?: any;
}) {
  const [shopName, setShopName] = useState(initialData?.shopName || "");
  const [billNumber, setBillNumber] = useState(initialData?.billNumber || "");
  const [billDate, setBillDate] = useState(
    initialData?.billDate || new Date().toISOString().substring(0, 10)
  );
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "UNPAID">("PAID");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<
    Array<{ description: string; quantity: number; rate: number; gstRate: number }>
  >(
    initialData?.items?.length
      ? initialData.items
      : [{ description: "Grocery / Shopping item", quantity: 1, rate: 0, gstRate: 0 }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const updateItem = (index: number, field: string, value: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addItemLine = () => {
    setItems((prev) => [...prev, { description: "", quantity: 1, rate: 0, gstRate: 0 }]);
  };

  const removeItemLine = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Compute totals
  const subtotal = items.reduce((acc, it) => acc + (Number(it.rate) * Number(it.quantity) || 0), 0);
  const totalTax = items.reduce((acc, it) => {
    const itemSub = (Number(it.rate) * Number(it.quantity)) || 0;
    return acc + (itemSub * (Number(it.gstRate) || 0)) / 100;
  }, 0);
  const totalAmount = Math.round((subtotal + totalTax) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) {
      setError("Please enter the store or shop name.");
      return;
    }
    if (items.some((it) => !it.description.trim())) {
      setError("Please provide a description for every item line.");
      return;
    }
    if (totalAmount <= 0) {
      setError("Total bill amount must be greater than ₹0.");
      return;
    }

    setSaving(true);
    setError("");

    const formattedItems = items.map((it, idx) => {
      const q = Number(it.quantity) || 1;
      const r = Number(it.rate) || 0;
      const g = Number(it.gstRate) || 0;
      const itemTax = (q * r * g) / 100;
      const lineTotal = Math.round((q * r + itemTax) * 100) / 100;
      return {
        id: `item_${idx}_${Date.now()}`,
        description: it.description.trim(),
        quantity: q,
        unit: "PCS",
        rate: r,
        gstRate: g,
        totalAmount: lineTotal,
      };
    });

    try {
      const res = await apiFetch("/my-bills/personal", {
        method: "POST",
        body: JSON.stringify({
          shopName: shopName.trim(),
          billNumber: billNumber.trim() || undefined,
          billDate,
          paymentStatus,
          paymentMode,
          notes: notes.trim() || undefined,
          receiptUrl: initialData?.receiptUrl || null,
          items: formattedItems,
          subtotal: Math.round(subtotal * 100) / 100,
          totalTax: Math.round(totalTax * 100) / 100,
          totalAmount,
          paidAmount: paymentStatus === "PAID" ? totalAmount : 0,
        }),
      });

      if (res.error) {
        throw new Error(res.error);
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save shopping bill.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <Receipt className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Add Shopping Bill</h3>
              <p className="text-2xs text-slate-500">Enter personal purchase receipt details</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Shop & Bill Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Store / Shop Name *</label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. DMart, Reliance Fresh, Local Store"
                required
                disabled={saving}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bill / Invoice # (Optional)</label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="e.g. BILL-4491"
                disabled={saving}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bill Date</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as "PAID" | "UNPAID")}
                disabled={saving}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="PAID">Paid</option>
                <option value="UNPAID">Pending / To Pay</option>
              </select>
            </div>
          </div>

          {/* Purchased Items Section */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Purchased Items</span>
              <span className="text-3xs text-slate-500">{items.length} item line(s)</span>
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => {
                const itemSub = (Number(it.rate) * Number(it.quantity)) || 0;
                const itemTax = (itemSub * (Number(it.gstRate) || 0)) / 100;
                const lineTotal = (itemSub + itemTax).toFixed(2);

                return (
                  <div key={idx} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div>
                      <input
                        type="text"
                        value={it.description}
                        onChange={(e) => updateItem(idx, "description", e.target.value)}
                        placeholder="Item name / description"
                        required
                        disabled={saving}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-4 gap-2 items-center">
                      <div>
                        <span className="text-3xs text-slate-400 font-medium block mb-0.5">Qty</span>
                        <input
                          type="number"
                          min="0.1"
                          step="any"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, "quantity", Number(e.target.value) || 1)}
                          disabled={saving}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center"
                        />
                      </div>

                      <div>
                        <span className="text-3xs text-slate-400 font-medium block mb-0.5">Rate (₹)</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.rate}
                          onChange={(e) => updateItem(idx, "rate", Number(e.target.value) || 0)}
                          disabled={saving}
                          className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold"
                        />
                      </div>

                      <div>
                        <span className="text-3xs text-slate-400 font-medium block mb-0.5">GST %</span>
                        <select
                          value={it.gstRate}
                          onChange={(e) => updateItem(idx, "gstRate", Number(e.target.value))}
                          disabled={saving}
                          className="w-full px-1.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-center"
                        >
                          {GST_RATES.map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="text-right">
                        <span className="text-3xs text-slate-400 font-medium block mb-0.5">Amount</span>
                        <span className="font-bold text-slate-900 block text-xs truncate">₹{lineTotal}</span>
                      </div>
                    </div>

                    {items.length > 1 && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => removeItemLine(idx)}
                          disabled={saving}
                          className="text-3xs font-semibold text-red-600 hover:text-red-700"
                        >
                          Remove line
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItemLine}
              disabled={saving}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add another item</span>
            </button>
          </div>

          {/* Payment Mode & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                disabled={saving}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 bg-white focus:border-blue-500 focus:outline-none"
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="CARD">Debit / Credit Card</option>
                <option value="NETBANKING">Net Banking</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Notes (Optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Monthly ration, Electronics"
                disabled={saving}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Totals Box */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 space-y-1">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Estimated GST:</span>
              <span>₹{totalTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-extrabold text-slate-900 border-t border-slate-200 pt-1.5 mt-1">
              <span>Total Bill Amount:</span>
              <span className="text-blue-700">₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2.5 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{saving ? "Saving..." : "Save Shopping Bill"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Mitra ID QR Modal
// -------------------------------------------------------------------------
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
          Show this QR code at any shop checkout so your bill automatically saves to &ldquo;My Shopping Bills&rdquo;.
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

// -------------------------------------------------------------------------
// Customer Pay via UPI Modal
// -------------------------------------------------------------------------
function CustomerPayUpiModal({
  bill,
  onClose,
}: {
  bill: MyBill;
  onClose: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const upiId = bill.seller.upiId?.trim() || "";
  const shopName = bill.seller.name;
  const amount = bill.pendingAmount;
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

  const upiUri = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${amount.toFixed(
        2
      )}&tn=${encodeURIComponent(`Bill ${bill.invoiceNumber}`)}`
    : "";

  useEffect(() => {
    if (!upiId || !upiUri) return;
    QRCode.toDataURL(upiUri, { width: 260, margin: 2 }, (err, url) => {
      if (!err && url) setQrUrl(url);
    });
  }, [upiId, upiUri]);

  const handleCopyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenUpiApp = () => {
    if (isMobile) {
      window.location.href = upiUri;
    } else {
      handleCopyUpi();
      alert(
        "To pay from a computer, please scan the QR code above with Google Pay, PhonePe, or Paytm on your phone, or use the copied UPI ID."
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-2xl text-center animate-fadeIn">
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

        {!upiId ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              This shopkeeper has not added their UPI ID yet.
            </p>
            <p className="text-2xs text-slate-500">
              Please pay in cash or ask the shopkeeper to provide their store UPI QR code.
            </p>
          </div>
        ) : (
          <>
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

            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="text-left overflow-hidden">
                <span className="block text-3xs font-bold uppercase tracking-wider text-slate-400">UPI ID</span>
                <span className="font-mono font-semibold text-slate-800 text-xs truncate block">{upiId}</span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-2xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs shrink-0"
              >
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div className="space-y-2 pt-1">
              {isMobile ? (
                <button
                  type="button"
                  onClick={handleOpenUpiApp}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open UPI App to Pay</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copied ? "UPI ID Copied to Clipboard" : "Copy UPI ID to Pay"}</span>
                </button>
              )}
              <p className="text-3xs text-slate-400 leading-tight">
                {isMobile
                  ? "After completing payment in your UPI app, the shopkeeper confirms receipt and your bill marks as Paid."
                  : "Scan the QR code with GPay, PhonePe, or Paytm on your phone to complete payment."}
              </p>
            </div>
          </>
        )}

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
