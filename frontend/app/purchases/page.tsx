"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { apiFetch, API_BASE_URL } from "../lib/api";
import { useApi } from "../lib/useApi";
import { INDIAN_STATES, stateNameFromCode, GSTIN_REGEX } from "../lib/states";
import { Tooltip } from "../components/Tooltip";
import { TableSkeleton, TableError, CardSkeleton } from "../components/TableSkeleton";
import { ShoppingBag, Plus, Users, CheckCircle2, AlertOctagon, X, Loader2, Download, Wallet, AlertTriangle, Pencil } from "lucide-react";

const EMPTY_ITEM = { description: "Purchase Item / Service", hsnSacCode: "998313", quantity: 1, rate: 0, gstRate: 18, cessAmount: 0 };

const CATEGORIES = [
  "STOCK",
  "RENT",
  "UTILITIES",
  "CAPITAL_GOODS",
  "FREIGHT",
  "PROFESSIONAL_SERVICES",
  "OFFICE_SUPPLIES",
  "IT_SERVICES",
  "ADVERTISING",
  "OTHER",
];

const PAY_STYLE: Record<string, { label: string; className: string }> = {
  PAID: { label: "Paid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  PARTIAL: { label: "Partially paid", className: "bg-amber-50 text-amber-700 border-amber-200" },
  UNPAID: { label: "Unpaid", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

type PaymentBill = {
  id: string;
  billNumber: string;
  totalAmount: number;
  paidAmount: number;
};

type ItcPaymentRisk = {
  id: string;
  billNumber: string;
  vendorName: string;
  daysOld: number;
  daysLeft: number;
  itcAtRisk: number;
  level: "WARNING" | "REVERSE_NOW";
};

type FocusedBill = {
  id: string;
  billNumber: string;
  billDate: string;
  vendor?: { name: string; gstin?: string | null } | null;
  category: string;
  vendorId: string;
  isReverseCharge: boolean;
  isItcEligible: boolean;
  itcIneligibilityReason?: string | null;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalAmount: number;
  paidAmount: number;
  status: string;
  dueDate?: string | null;
  items: Array<{
    id?: string;
    itemId?: string | null;
    description: string;
    hsnSacCode: string;
    quantity: number;
    unit?: string;
    rate: number;
    gstRate: number;
    cessAmount: number;
    cessRate: number;
    isItcEligible?: boolean;
  }>;
};

// Local date (not UTC) so early-morning entries in India don't get yesterday's date.
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
};

export default function PurchasesPage() {
  const [tab, setTab] = useState<"BILLS" | "VENDORS">("BILLS");

  // Data (cached + refreshed in background by SWR)
  const billsQ = useApi<any[]>("/purchases/bills?view=list");
  const vendorsQ = useApi<any[]>("/vendors");
  const summaryQ = useApi<any>("/purchases/expenses-summary");
  const riskQ = useApi<ItcPaymentRisk[]>("/purchases/itc-payment-risk");

  const bills = billsQ.data ?? [];
  const [highlightedBill, setHighlightedBill] = useState<FocusedBill | null>(null);
  const vendors = vendorsQ.data ?? [];
  const expenseSummary = summaryQ.data;
  const displayBills =
    highlightedBill && !bills.some((bill) => bill.id === highlightedBill.id)
      ? [...bills, highlightedBill]
      : bills;

  // Modals
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [paymentBill, setPaymentBill] = useState<PaymentBill | null>(null);

  // Saving state (UI feedback) + refs (instant double-click lock)
  const [savingVendor, setSavingVendor] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [downloadingBillId, setDownloadingBillId] = useState<string | null>(null);
  const vendorLock = useRef(false);
  const billLock = useRef(false);
  const paymentLock = useRef(false);
  const quickActionHandled = useRef(false);

  const [toast, setToast] = useState("");
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  // Vendor form
  const [vName, setVName] = useState("");
  const [vGstin, setVGstin] = useState("");
  const [vState, setVState] = useState("27");
  const [vError, setVError] = useState("");

  // Bill form
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [billNum, setBillNum] = useState("");
  const [billDate, setBillDate] = useState(todayStr());
  const [billDueDate, setBillDueDate] = useState("");
  const [category, setCategory] = useState("STOCK");
  const [isReverseCharge, setIsReverseCharge] = useState(false);
  const [isItcEligible, setIsItcEligible] = useState(true);
  const [itcReason, setItcReason] = useState("");
  const [billItems, setBillItems] = useState<any[]>([{ ...EMPTY_ITEM }]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayStr());
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentError, setPaymentError] = useState("");

  // ITC can only be claimed on bills from GST-registered vendors.
  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);
  const vendorRegistered = !!selectedVendor?.gstin;
  const itcClaimable = vendorRegistered && isItcEligible;

  const updateBillItem = (index: number, patch: Record<string, unknown>) => {
    setBillItems((previous) => previous.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item
    ));
  };

  const handleDownloadBill = async (billId: string, billNumber: string) => {
    if (downloadingBillId) return;
    setDownloadingBillId(billId);
    try {
      const token = localStorage.getItem("gstmitra_token");
      const response = await fetch(`${API_BASE_URL}/purchases/bills/${billId}/pdf`, {
        headers: { Authorization: `${"Bear" + "er"} ${token}` },
      });
      if (!response.ok) {
        alert("Could not download the bill PDF. Please try again.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `BILL-${billNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Could not download the bill PDF. Please check your connection.");
    } finally {
      setDownloadingBillId(null);
    }
  };

  // ---------- Vendor ----------
  const handleSaveVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vendorLock.current) return;
    setVError("");

    if (vGstin && !GSTIN_REGEX.test(vGstin)) {
      setVError("GSTIN format looks invalid. It must be 15 characters, e.g. 27AAAAA0000A1Z5.");
      return;
    }

    vendorLock.current = true;
    setSavingVendor(true);

    try {
      const { data, error } = await apiFetch<any>("/vendors", {
        method: "POST",
        body: JSON.stringify({
          name: vName.trim(),
          gstin: vGstin,
          stateCode: vState,
          stateName: stateNameFromCode(vState),
        }),
      });

      if (error) {
        setVError(error);
        vendorsQ.mutate();
        return;
      }

      const created: any = (data as any)?.vendor ?? data;
      if (created?.id) {
        vendorsQ.mutate((prev) => [created, ...(prev ?? [])], { revalidate: true });
      } else {
        vendorsQ.mutate();
      }

      setShowVendorModal(false);
      setVName("");
      setVGstin("");
      setVState("27");
      showToast("Vendor added successfully");
    } finally {
      vendorLock.current = false;
      setSavingVendor(false);
    }
  };

  // ---------- Purchase bill ----------
  const handleSaveBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (billLock.current) return;
    if (!selectedVendorId || !billNum.trim()) return alert("Vendor and Bill Number are required.");
    if (!billItems.every((item) =>
      String(item.description || "").trim() && Number(item.rate) > 0 && Number(item.quantity) > 0
    )) return alert("Each bill line needs a description, quantity, and taxable amount greater than 0.");
    if (billDueDate && billDueDate < billDate) return alert("Due date cannot be before the bill date.");

    billLock.current = true;
    setSavingBill(true);

    try {
      const { data, error } = await apiFetch<any>(
        editingBillId ? `/purchases/bills/${editingBillId}` : "/purchases/bills",
        {
        method: editingBillId ? "PUT" : "POST",
        body: JSON.stringify({
          vendorId: selectedVendorId,
          billNumber: billNum.trim(),
          billDate,
          ...(billDueDate ? { dueDate: billDueDate } : {}),
          category,
          isReverseCharge,
          isItcEligible: itcClaimable,
          itcIneligibilityReason: itcClaimable ? "" : vendorRegistered ? itcReason : "Unregistered vendor",
          items: billItems,
        }),
        }
      );

      if (error) {
        alert(error);
        billsQ.mutate();
        return;
      }

      const created: any = (data as any)?.bill ?? data;
      if (created?.id) {
        billsQ.mutate(
          (prev) => {
            const updated = { ...created, vendor: created.vendor ?? selectedVendor };
            return prev?.some((bill) => bill.id === updated.id)
              ? prev.map((bill) => bill.id === updated.id ? updated : bill)
              : [updated, ...(prev ?? [])];
          },
          { revalidate: true }
        );
      } else {
        billsQ.mutate();
      }
      summaryQ.mutate(); // totals changed
      riskQ.mutate();

      setShowBillModal(false);
      setEditingBillId(null);
      setTab("BILLS");
      setBillNum("");
      setBillDueDate("");
      setItcReason("");
      setIsReverseCharge(false);
      setIsItcEligible(true);
      setBillItems([{ ...EMPTY_ITEM }]);
      if (!editingBillId && created?.id && created?.billNumber) {
        showToast("Purchase bill saved. Your bill PDF is downloading.");
        void handleDownloadBill(created.id, created.billNumber);
      } else {
        showToast(editingBillId ? "Purchase bill details updated" : "Purchase bill added successfully");
      }
    } finally {
      billLock.current = false;
      setSavingBill(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentBill || paymentLock.current) return;
    setPaymentError("");
    const amount = Math.round((Number(paymentAmount) + Number.EPSILON) * 100) / 100;
    const balance = Math.round((paymentBill.totalAmount - paymentBill.paidAmount + Number.EPSILON) * 100) / 100;
    if (!(amount > 0) || amount > balance) {
      setPaymentError("Enter an amount greater than 0 and no more than the balance due.");
      return;
    }

    paymentLock.current = true;
    setSavingPayment(true);
    try {
      const { error } = await apiFetch<unknown>(`/purchases/bills/${paymentBill.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          paymentDate,
          mode: paymentMode,
          reference: paymentReference.trim() || undefined,
        }),
      });
      if (error) {
        setPaymentError(error);
        return;
      }

      await Promise.all([billsQ.mutate(), riskQ.mutate(), summaryQ.mutate()]);
      setPaymentBill(null);
      setPaymentAmount("");
      setPaymentDate(todayStr());
      setPaymentMode("UPI");
      setPaymentReference("");
      showToast("Payment recorded");
    } finally {
      paymentLock.current = false;
      setSavingPayment(false);
    }
  };

  const openBillEditor = useCallback(async (billId: string, loadedBill?: FocusedBill) => {
    const { data, error } = loadedBill
      ? { data: loadedBill, error: null }
      : await apiFetch<FocusedBill>(`/purchases/bills/${encodeURIComponent(billId)}`);
    if (error || !data) {
      showToast(error || "Could not load this purchase bill for editing.");
      return;
    }
    setEditingBillId(data.id);
    setSelectedVendorId(data.vendorId);
    setBillNum(data.billNumber);
    setBillDate(String(data.billDate).slice(0, 10));
    setBillDueDate(data.dueDate ? String(data.dueDate).slice(0, 10) : "");
    setCategory(data.category || "STOCK");
    setIsReverseCharge(Boolean(data.isReverseCharge));
    setIsItcEligible(Boolean(data.isItcEligible));
    setItcReason(data.itcIneligibilityReason || "");
    setBillItems(data.items.map((item) => ({
      id: item.id,
      itemId: item.itemId || "",
      description: item.description,
      hsnSacCode: item.hsnSacCode,
      quantity: item.quantity,
      rate: item.rate,
      gstRate: item.gstRate,
      cessAmount: item.cessAmount,
      cessRate: item.cessRate,
      isItcEligible: item.isItcEligible,
    })));
    setTab("BILLS");
    setShowBillModal(true);
  }, [showToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get("healthCheckRecord");
    if (!recordId) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      setTab("BILLS");
      void apiFetch<FocusedBill>(`/purchases/bills/${encodeURIComponent(recordId)}`).then(({ data, error }) => {
        if (!active) return;
        if (!data) {
          setToast(error || "Could not open this purchase bill.");
          window.setTimeout(() => setToast(""), 3000);
          return;
        }
        setHighlightedBill(data);
        void openBillEditor(recordId, data);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [openBillEditor]);

  useEffect(() => {
    if (quickActionHandled.current || vendorsQ.loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("addBill") !== "1") return;

    const timeout = window.setTimeout(() => {
      if (quickActionHandled.current) return;
      quickActionHandled.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      const loadedVendors = vendorsQ.data ?? [];
      if (loadedVendors.length === 0) {
        setShowVendorModal(true);
        return;
      }
      setSelectedVendorId(loadedVendors[0].id);
      setIsItcEligible(true);
      setShowBillModal(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [vendorsQ.data, vendorsQ.loading]);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600" />
            Purchases & Expense Bills
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Track business expenses and Input Tax Credit (ITC) eligibility under Sec 17(5).
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowVendorModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all"
          >
            <Users className="w-4 h-4" />
            <span>Add Vendor</span>
          </button>
          <button
            // Disabled until vendors have loaded, otherwise users get a false "add a vendor first" message.
            disabled={vendorsQ.loading || !!vendorsQ.error}
            onClick={() => {
              if (vendors.length === 0) {
                alert("Please add at least one vendor first.");
                setShowVendorModal(true);
                return;
              }
              setEditingBillId(null);
              setBillNum("");
              setBillDate(todayStr());
              setBillDueDate("");
              setCategory("STOCK");
              setIsReverseCharge(false);
              setIsItcEligible(true);
              setItcReason("");
              setBillItems([{ ...EMPTY_ITEM }]);
              setSelectedVendorId(vendors[0]?.id || "");
              setIsItcEligible(true);
              setShowBillModal(true);
            }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Add Purchase Bill</span>
          </button>
        </div>
      </div>

      {/* Expense Top Summary Box */}
      {summaryQ.loading ? (
        <CardSkeleton className="h-24" />
      ) : (
        expenseSummary && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              <span className="text-3xs text-slate-400 font-bold uppercase">Total Purchases</span>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">
                ₹{expenseSummary.totalPurchases.toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <span className="text-3xs text-emerald-600 font-bold uppercase">Eligible ITC Claim</span>
              <p className="text-xl font-extrabold text-emerald-600 mt-0.5">
                ₹{expenseSummary.totalEligibleItc.toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <span className="text-3xs text-red-600 font-bold uppercase">Blocked ITC (Ineligible)</span>
              <p className="text-xl font-extrabold text-red-600 mt-0.5">
                ₹{expenseSummary.totalBlockedItc.toLocaleString("en-IN")}
              </p>
            </div>
            <div>
              <span className="text-3xs text-slate-400 font-bold uppercase">Total Bills</span>
              <p className="text-xl font-extrabold text-slate-900 mt-0.5">{expenseSummary.billCount} Bills</p>
            </div>
          </div>
        )
      )}

      {riskQ.data && riskQ.data.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
          <div className="mb-2 flex items-center gap-2 font-bold">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            {riskQ.data.length} unpaid bill{riskQ.data.length === 1 ? "" : "s"} close to the 180-day ITC limit
          </div>
          <div className="space-y-1.5">
            {riskQ.data.slice(0, 5).map((risk) => (
              <p key={risk.id}>
                <span className="font-semibold">{risk.billNumber}</span> · {risk.vendorName} · {risk.daysOld} days old ·{" "}
                {risk.level === "REVERSE_NOW" ? (
                  <span className="font-bold text-red-700">
                    180 days crossed, reverse ITC ₹{risk.itcAtRisk.toFixed(2)}
                  </span>
                ) : (
                  <span>
                    {risk.daysLeft} days left to pay, ITC at risk ₹{risk.itcAtRisk.toFixed(2)}
                  </span>
                )}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
        <button
          onClick={() => setTab("BILLS")}
          className={`pb-2.5 px-1 border-b-2 transition-all ${
            tab === "BILLS" ? "border-blue-600 text-blue-700 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          All Purchase Bills ({billsQ.loading ? "…" : bills.length})
        </button>
        <button
          onClick={() => setTab("VENDORS")}
          className={`pb-2.5 px-1 border-b-2 transition-all ${
            tab === "VENDORS" ? "border-blue-600 text-blue-700 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Vendors ({vendorsQ.loading ? "…" : vendors.length})
        </button>
      </div>

      {/* Bills Table */}
      {tab === "BILLS" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {billsQ.loading ? (
            <TableSkeleton />
          ) : billsQ.error && bills.length === 0 ? (
            <TableError message={billsQ.error.message} onRetry={() => billsQ.mutate()} />
          ) : displayBills.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No purchase bills recorded</p>
              <p className="text-xs text-slate-500">Add purchase bills to claim Input Tax Credit on your GSTR-3B return.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Bill #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Vendor</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">ITC Status</th>
                    <th className="py-3 px-4">Total Tax</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                  {displayBills.map((bill) => {
                    const taxTotal = bill.totalCgst + bill.totalSgst + bill.totalIgst + bill.totalCess;
                    return (
                      <tr
                        key={bill.id}
                        id={`health-check-record-${bill.id}`}
                        className={`transition-colors ${highlightedBill?.id === bill.id ? "bg-amber-50 outline outline-2 outline-amber-400" : "hover:bg-slate-50/80"}`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">{bill.billNumber}</td>
                        <td className="py-3 px-4 text-slate-600">{new Date(bill.billDate).toLocaleDateString("en-IN")}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {bill.vendor?.name}
                          {bill.vendor?.gstin && (
                            <p className="text-3xs text-slate-400 font-mono">{bill.vendor.gstin}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{bill.category}</td>
                        <td className="py-3 px-4">
                          {bill.isItcEligible ? (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Eligible ITC
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-3xs font-bold bg-red-50 text-red-700 px-2.5 py-0.5 rounded-full border border-red-200">
                              <AlertOctagon className="w-3 h-3" /> Blocked / Ineligible
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold text-blue-700">₹{taxTotal.toFixed(2)}</td>
                        <td className="py-3 px-4 font-extrabold text-slate-900">₹{bill.totalAmount.toFixed(2)}</td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-3xs font-bold ${PAY_STYLE[bill.status]?.className ?? PAY_STYLE.UNPAID.className}`}>
                              {PAY_STYLE[bill.status]?.label ?? PAY_STYLE.UNPAID.label}
                            </span>
                            {bill.status !== "PAID" && (
                              <p className="text-3xs font-semibold text-slate-600">
                                Due ₹{(bill.totalAmount - bill.paidAmount).toFixed(2)}
                              </p>
                            )}
                            {bill.dueDate && (
                              <p className="text-3xs text-slate-500">
                                Due by {new Date(bill.dueDate).toLocaleDateString("en-IN")}
                                {bill.status !== "PAID" && bill.dueDate.slice(0, 10) < todayStr() && (
                                  <span className="ml-1 font-bold text-red-600">Overdue</span>
                                )}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => void openBillEditor(bill.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Edit details</span>
                            </button>
                            {bill.status !== "PAID" && (
                              <button
                                onClick={() => {
                                  setPaymentBill(bill);
                                  setPaymentAmount((bill.totalAmount - bill.paidAmount).toFixed(2));
                                  setPaymentDate(todayStr());
                                  setPaymentMode("UPI");
                                  setPaymentReference("");
                                  setPaymentError("");
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                              >
                                <Wallet className="h-3.5 w-3.5" />
                                <span>Record Payment</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleDownloadBill(bill.id, bill.billNumber)}
                              disabled={downloadingBillId === bill.id}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 disabled:opacity-60"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>{downloadingBillId === bill.id ? "..." : "Bill PDF"}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Vendors Table */}
      {tab === "VENDORS" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {vendorsQ.loading ? (
            <TableSkeleton />
          ) : vendorsQ.error && vendors.length === 0 ? (
            <TableError message={vendorsQ.error.message} onRetry={() => vendorsQ.mutate()} />
          ) : vendors.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Users className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No vendors added yet</p>
              <p className="text-xs text-slate-500">Click "Add Vendor" to add your first supplier.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Vendor Name</th>
                    <th className="py-3 px-4">GSTIN</th>
                    <th className="py-3 px-4">State</th>
                    <th className="py-3 px-4">Vendor Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                  {vendors.map((v) => (
                    <tr key={v.id}>
                      <td className="py-3 px-4 font-bold text-slate-900">{v.name}</td>
                      <td className="py-3 px-4 font-mono">{v.gstin || "Unregistered"}</td>
                      <td className="py-3 px-4">
                        {v.stateName} ({v.stateCode})
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-600">{v.vendorType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Vendor Modal */}
      {showVendorModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">Add Vendor / Supplier</h3>
              <button
                onClick={() => setShowVendorModal(false)}
                disabled={savingVendor}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {vError && <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg">{vError}</div>}

            <form onSubmit={handleSaveVendor} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vendor / Supplier Name *</label>
                <input
                  type="text"
                  value={vName}
                  onChange={(e) => setVName(e.target.value)}
                  placeholder="e.g. Apex Hardware Supplies"
                  required
                  disabled={savingVendor}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vendor GSTIN (Optional)</label>
                <input
                  type="text"
                  value={vGstin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setVGstin(val);
                    if (val.length >= 2 && INDIAN_STATES.some((s) => s.code === val.substring(0, 2))) {
                      setVState(val.substring(0, 2));
                    }
                  }}
                  maxLength={15}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  disabled={savingVendor}
                  className="w-full px-3 py-2 border rounded-xl font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Vendor State</label>
                <select
                  value={vState}
                  onChange={(e) => setVState(e.target.value)}
                  disabled={savingVendor}
                  className="w-full px-3 py-2 border rounded-xl bg-white"
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <p className="text-3xs text-slate-400 mt-1">
                  Decides CGST+SGST vs IGST on bills from this vendor. Filled automatically from the GSTIN.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowVendorModal(false)}
                  disabled={savingVendor}
                  className="px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingVendor}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingVendor && <Loader2 className="w-4 h-4 animate-spin" />}
                  {savingVendor ? "Saving..." : "Save Vendor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Purchase Bill Modal */}
      {showBillModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl p-6 space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">{editingBillId ? "Edit Purchase Bill Details" : "Record Purchase Bill"}</h3>
              <button
                onClick={() => {
                  setShowBillModal(false);
                  setEditingBillId(null);
                }}
                disabled={savingBill}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBill} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vendor *</label>
                  <select
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    disabled={savingBill}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  >
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.gstin ? "Registered" : "Unregistered"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bill Number *</label>
                  <input
                    type="text"
                    value={billNum}
                    onChange={(e) => setBillNum(e.target.value)}
                    placeholder="e.g. VEND-9981"
                    required
                    disabled={savingBill}
                    className="w-full px-3 py-2 border rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={savingBill}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    disabled={savingBill}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Due Date (optional)</label>
                  <input
                    type="date"
                    value={billDueDate}
                    min={billDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    disabled={savingBill}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  />
                </div>
              </div>

              {/* ITC Eligibility Toggle & Plain Words Explanation */}
              <div className="p-4 bg-slate-50 border rounded-xl space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={isReverseCharge}
                    onChange={(e) => setIsReverseCharge(e.target.checked)}
                    disabled={savingBill}
                    className="h-4 w-4 rounded text-blue-600"
                  />
                  This purchase is liable to reverse charge (confirm from the supplier invoice / tax advice)
                </label>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900">Input Tax Credit (ITC) Eligibility</span>
                    <Tooltip
                      term="Blocked Credit Sec 17(5)"
                      text="Certain expenses like motor cars for personal use, food/catering, and club memberships are blocked by GST law. Tax paid on them cannot be claimed as ITC."
                      example="Motor vehicle purchase -> Blocked ITC"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={itcClaimable}
                      onChange={(e) => setIsItcEligible(e.target.checked)}
                      disabled={savingBill || !vendorRegistered}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="font-bold text-blue-700">Eligible to Claim ITC</span>
                  </label>
                </div>

                {!vendorRegistered && (
                  <p className="text-3xs font-semibold text-red-700">
                    This vendor has no GSTIN (unregistered), so ITC cannot be claimed on this bill.
                  </p>
                )}

                {vendorRegistered && !isItcEligible && (
                  <div>
                    <label className="block text-3xs font-semibold text-red-700 mb-1">
                      Reason why ITC is ineligible / blocked:
                    </label>
                    <input
                      type="text"
                      value={itcReason}
                      onChange={(e) => setItcReason(e.target.value)}
                      placeholder="e.g. Sec 17(5) Motor vehicle"
                      disabled={savingBill}
                      className="w-full px-3 py-1.5 border border-red-200 rounded-lg text-xs bg-red-50/50"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="font-bold text-slate-800">Bill line items and tax details</p>
                {billItems.map((item, index) => (
                  <div key={item.id || index} className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
                    <label className="col-span-2 text-xs font-semibold text-slate-700 sm:col-span-2">
                      Description
                      <input
                        value={item.description}
                        onChange={(event) => updateBillItem(index, { description: event.target.value })}
                        required
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      HSN/SAC
                      <input
                        value={item.hsnSacCode}
                        onChange={(event) => updateBillItem(index, { hsnSacCode: event.target.value })}
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Unit
                      <input
                        value={item.unit || "PCS"}
                        onChange={(event) => updateBillItem(index, { unit: event.target.value })}
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Quantity
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) => updateBillItem(index, { quantity: Number(event.target.value) || 0 })}
                        required
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Rate / taxable amount (₹)
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.rate}
                        onChange={(event) => updateBillItem(index, { rate: Number(event.target.value) || 0 })}
                        required
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border px-3 py-2 font-bold"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      GST rate
                      <select
                        value={item.gstRate}
                        onChange={(event) => updateBillItem(index, { gstRate: Number(event.target.value) })}
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border bg-white px-3 py-2 font-bold text-blue-700"
                      >
                        {[0, 5, 18, 40].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-700">
                      Cess amount (₹)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.cessAmount ?? 0}
                        onChange={(event) => updateBillItem(index, { cessAmount: Number(event.target.value) || 0 })}
                        disabled={savingBill}
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={item.isItcEligible ?? isItcEligible}
                        onChange={(event) => updateBillItem(index, { isItcEligible: event.target.checked })}
                        disabled={savingBill || !itcClaimable}
                      />
                      ITC eligible for this line
                    </label>
                    {billItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setBillItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))}
                        disabled={savingBill}
                        className="self-end justify-self-start text-xs font-bold text-red-600"
                      >
                        Remove line
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBillItems((previous) => [...previous, { ...EMPTY_ITEM }])}
                  disabled={savingBill}
                  className="text-xs font-bold text-blue-700 hover:underline"
                >
                  + Add bill line
                </button>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowBillModal(false);
                    setEditingBillId(null);
                  }}
                  disabled={savingBill}
                  className="px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBill}
                  className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {savingBill && <Loader2 className="w-4 h-4 animate-spin" />}
                  {savingBill ? "Saving..." : editingBillId ? "Save Bill Changes" : "Save Purchase Bill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {paymentBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Record Payment · {paymentBill.billNumber}</h3>
              <button
                onClick={() => setPaymentBill(null)}
                disabled={savingPayment}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
              <div><p className="text-slate-500">Total</p><p className="font-bold">₹{paymentBill.totalAmount.toFixed(2)}</p></div>
              <div><p className="text-slate-500">Paid</p><p className="font-bold">₹{paymentBill.paidAmount.toFixed(2)}</p></div>
              <div><p className="text-slate-500">Balance</p><p className="font-bold">₹{(paymentBill.totalAmount - paymentBill.paidAmount).toFixed(2)}</p></div>
            </div>
            {paymentError && <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{paymentError}</div>}
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(paymentBill.totalAmount - paymentBill.paidAmount).toFixed(2)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  disabled={savingPayment}
                  className="w-full rounded-xl border px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    max={todayStr()}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                    disabled={savingPayment}
                    className="w-full rounded-xl border bg-white px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-semibold text-slate-700">Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    disabled={savingPayment}
                    className="w-full rounded-xl border bg-white px-3 py-2"
                  >
                    <option value="UPI">UPI</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="CASH">Cash</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700">Reference (optional)</label>
                <input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  disabled={savingPayment}
                  className="w-full rounded-xl border px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 border-t pt-3">
                <button
                  type="button"
                  onClick={() => setPaymentBill(null)}
                  disabled={savingPayment}
                  className="px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPayment}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white disabled:opacity-60"
                >
                  {savingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                  {savingPayment ? "Saving..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-emerald-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg animate-fadeIn">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}