"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE_URL } from "../lib/api";
import { useApi } from "../lib/useApi";
import { INDIAN_STATES, stateNameFromCode, GSTIN_REGEX } from "../lib/states";
import { TableSkeleton, TableError } from "../components/TableSkeleton";
import { FileText, Plus, Download, Users, X, PlusCircle, Pencil, Clock, AlertCircle, IndianRupee, Zap, Bell } from "lucide-react";
import AddPaymentModal from "./components/AddPaymentModal";

const GST_RATES = [0, 5, 18, 40];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Local date (not UTC) so invoices made early morning in India don't get yesterday's date.
const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
};

const newLine = () => ({
  itemId: "",
  description: "",
  hsnSacCode: "998313",
  quantity: 1,
  rate: 0,
  gstRate: 18,
});

type FocusedInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customer?: { name: string; gstin?: string | null } | null;
  supplyType: string;
  subtotal: number;
  totalAmount: number;
  customerId: string;
  dueDate?: string | null;
  notes?: string | null;
  isReverseCharge: boolean;
  applicablePercent?: number | null;
  ecomGstin?: string | null;
  items: Array<{
    itemId?: string | null;
    description: string;
    hsnSacCode: string;
    quantity: number;
    rate: number;
    gstRate: number;
    cessRate?: number | null;
  }>;
};

export default function SalesPage() {
  const { business } = useAuth();

  const [tab, setTab] = useState<"INVOICES" | "CUSTOMERS">("INVOICES");
  const [invoiceFilter, setInvoiceFilter] = useState<"ALL" | "TO_COLLECT" | "PAID">("ALL");

  // Data (cached + refreshed in background by SWR)
  const invoicesQ = useApi<any[]>("/sales/invoices?view=list");
  const customersQ = useApi<any[]>("/customers");
  const itemsQ = useApi<any[]>("/items");

  const invoices = invoicesQ.data ?? [];
  const [highlightedInvoice, setHighlightedInvoice] = useState<FocusedInvoice | null>(null);
  const customers = customersQ.data ?? [];
  const itemsList = itemsQ.data ?? [];
  const displayInvoices =
    highlightedInvoice && !invoices.some((invoice) => invoice.id === highlightedInvoice.id)
      ? [...invoices, highlightedInvoice]
      : invoices;

  // Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState("");
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  // Customer form
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custGstin, setCustGstin] = useState("");
  const [custState, setCustState] = useState("27");
  const [custError, setCustError] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const customerLock = useRef(false);
  const quickActionHandled = useRef(false);

  // Invoice form
  const [selectedCustId, setSelectedCustId] = useState("");
  const [invDate, setInvDate] = useState(todayStr());
  const [invDueDate, setInvDueDate] = useState("");
  const [invNotes, setInvNotes] = useState("");
  const [invItems, setInvItems] = useState<any[]>([newLine()]);
  const [isReverseCharge, setIsReverseCharge] = useState(false);
  const [applicablePercent, setApplicablePercent] = useState("");
  const [isEcommerceSale, setIsEcommerceSale] = useState(false);
  const [ecomGstin, setEcomGstin] = useState("");
  const [savingInvoice, setSavingInvoice] = useState(false);
  const submitLock = useRef(false);

  // PDF
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Add Payment modal
  const [paymentInvoice, setPaymentInvoice] = useState<any | null>(null);

  // Payment reminder modal
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [reminderModalData, setReminderModalData] = useState<{
    invoiceNum: string;
    customerName: string;
    email: string;
    count: number;
    pendingAmount: number;
  } | null>(null);

  const handleSendReminder = async (inv: any) => {
    setRemindingId(inv.id);
    const { data, error } = await apiFetch<any>(`/sales/invoices/${inv.id}/remind`, {
      method: "POST",
    });
    setRemindingId(null);
    if (error) {
      alert(error);
      return;
    }
    if (data?.success) {
      invoicesQ.mutate();
      setReminderModalData({
        invoiceNum: inv.invoiceNumber,
        customerName: inv.customer?.name || "Customer",
        email: data.email,
        count: data.reminderCount,
        pendingAmount: data.pendingAmount,
      });
    }
  };

  const openInvoiceEditor = useCallback(async (invoiceId: string, loadedInvoice?: FocusedInvoice) => {
    const { data, error } = loadedInvoice
      ? { data: loadedInvoice, error: null }
      : await apiFetch<FocusedInvoice>(`/sales/invoices/${encodeURIComponent(invoiceId)}`);
    if (error || !data) {
      showToast(error || "Could not load this invoice for editing.");
      return;
    }
    setEditingInvoiceId(data.id);
    setSelectedCustId(data.customerId);
    setInvDate(String(data.invoiceDate).slice(0, 10));
    setInvDueDate(data.dueDate ? String(data.dueDate).slice(0, 10) : "");
    setInvNotes(data.notes || "");
    setIsReverseCharge(Boolean(data.isReverseCharge));
    setApplicablePercent(data.applicablePercent == null ? "" : String(data.applicablePercent));
    setEcomGstin(data.ecomGstin || "");
    setIsEcommerceSale(Boolean(data.ecomGstin));
    setInvItems(data.items.map((item) => ({
      itemId: item.itemId || "",
      description: item.description,
      hsnSacCode: item.hsnSacCode,
      quantity: item.quantity,
      rate: item.rate,
      gstRate: item.gstRate,
      cessRate: item.cessRate || 0,
    })));
    setShowInvoiceModal(true);
  }, [showToast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get("healthCheckRecord");
    if (!recordId) return;

    let active = true;
    const timeout = window.setTimeout(() => {
      setTab("INVOICES");
      void apiFetch<FocusedInvoice>(`/sales/invoices/${encodeURIComponent(recordId)}`).then(({ data, error }) => {
        if (!active) return;
        if (!data) {
          setToast(error || "Could not open this invoice.");
          window.setTimeout(() => setToast(""), 3000);
          return;
        }
        setHighlightedInvoice(data);
        window.history.replaceState(null, "", window.location.pathname);
        void openInvoiceEditor(recordId, data);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [openInvoiceEditor]);

  useEffect(() => {
    if (quickActionHandled.current || customersQ.loading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("addInvoice") !== "1") return;

    const timeout = window.setTimeout(() => {
      if (quickActionHandled.current) return;
      quickActionHandled.current = true;
      window.history.replaceState(null, "", window.location.pathname);
      const loadedCustomers = customersQ.data ?? [];
      if (loadedCustomers.length === 0) {
        setShowCustomerModal(true);
        return;
      }
      setSelectedCustId(loadedCustomers[0].id);
      setShowInvoiceModal(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [customersQ.data, customersQ.loading]);

  // ---------- Customer ----------
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (customerLock.current) return;
    setCustError("");

    if (custGstin && !GSTIN_REGEX.test(custGstin)) {
      setCustError("GSTIN format looks invalid. It must be 15 characters, e.g. 27AAAAA0000A1Z5.");
      return;
    }

    customerLock.current = true;
    setSavingCustomer(true);

    try {
      const { data, error } = await apiFetch<any>("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: custName.trim(),
          email: custEmail.trim() || undefined,
          gstin: custGstin,
          stateCode: custState,
          stateName: stateNameFromCode(custState),
        }),
      });

      if (error) {
        setCustError(error);
        customersQ.mutate();
        return;
      }

      const created: any = (data as any)?.customer ?? data;
      if (created?.id) {
        customersQ.mutate((prev) => [created, ...(prev ?? [])], { revalidate: true });
      } else {
        customersQ.mutate();
      }

      setShowCustomerModal(false);
      setCustName("");
      setCustEmail("");
      setCustGstin("");
      setCustState("27");
      showToast("Customer added successfully");
    } finally {
      customerLock.current = false;
      setSavingCustomer(false);
    }
  };

  // ---------- Invoice line items ----------
  const updateItem = (idx: number, patch: Record<string, any>) => {
    setInvItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleItemSelect = (idx: number, itemId: string) => {
    const selectedItem = itemsList.find((i) => i.id === itemId);
    if (selectedItem) {
      updateItem(idx, {
        itemId: selectedItem.id,
        description: selectedItem.name,
        hsnSacCode: selectedItem.hsnSacCode,
        rate: selectedItem.sellingPrice,
        gstRate: selectedItem.gstRate,
      });
    } else {
      updateItem(idx, { itemId });
    }
  };

  const handleAddLineItem = () => setInvItems((prev) => [...prev, newLine()]);

  const handleRemoveLineItem = (idx: number) => {
    setInvItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  // ---------- Live tax preview (same rounding as the backend) ----------
  const selectedCustomer = customers.find((c) => c.id === selectedCustId);
  const isIntraState = selectedCustomer ? business?.stateCode === selectedCustomer.stateCode : true;

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalCess = 0;

  invItems.forEach((itm) => {
    const taxable = r2((Number(itm.quantity) || 0) * (Number(itm.rate) || 0));
    const gst = Number(itm.gstRate) || 0;
    const cess = r2((taxable * (Number(itm.cessRate) || 0)) / 100);
    totalTaxable += taxable;
    totalCess += cess;
    if (isIntraState) {
      totalCgst += r2((taxable * (gst / 2)) / 100);
      totalSgst += r2((taxable * (gst / 2)) / 100);
    } else {
      totalIgst += r2((taxable * gst) / 100);
    }
  });

  const grandTotal = Math.round(totalTaxable + totalCgst + totalSgst + totalIgst + totalCess);

  const hasValidItems =
    invItems.length > 0 &&
    invItems.every((itm) => itm.description.trim() !== "" && itm.rate > 0 && itm.quantity > 0);

  // ---------- Save invoice ----------
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLock.current) return;
    if (!selectedCustId) return alert("Please select a customer.");

    if (!hasValidItems || grandTotal <= 0) {
      return alert("Each item needs a description, quantity > 0 and rate > 0. Fill or remove empty rows.");
    }

    submitLock.current = true;
    setSavingInvoice(true);

    try {
      const { data, error } = await apiFetch<any>(
        editingInvoiceId ? `/sales/invoices/${editingInvoiceId}` : "/sales/invoices",
        {
        method: editingInvoiceId ? "PUT" : "POST",
        body: JSON.stringify({
          customerId: selectedCustId,
          invoiceDate: invDate,
          dueDate: invDueDate || null,
          notes: invNotes,
          placeOfSupply: selectedCustomer?.stateCode || business?.stateCode,
          isReverseCharge,
          applicablePercent: applicablePercent === "" ? null : Number(applicablePercent),
          ecomGstin: isEcommerceSale ? ecomGstin : "",
          items: invItems,
        }),
        }
      );

      if (error) {
        alert(error);
        invoicesQ.mutate();
        return;
      }

      const created: any = (data as any)?.invoice ?? data;
      if (created?.id) {
        invoicesQ.mutate(
          (prev) => {
            const updated = { ...created, customer: created.customer ?? selectedCustomer };
            return prev?.some((invoice) => invoice.id === updated.id)
              ? prev.map((invoice) => invoice.id === updated.id ? updated : invoice)
              : [updated, ...(prev ?? [])];
          },
          { revalidate: true }
        );
      } else {
        invoicesQ.mutate();
      }

      setShowInvoiceModal(false);
      setEditingInvoiceId(null);
      setTab("INVOICES");
      setInvItems([newLine()]);
      setInvDate(todayStr());
      setInvDueDate("");
      setInvNotes("");
      setSelectedCustId("");
      setIsReverseCharge(false);
      setApplicablePercent("");
      setIsEcommerceSale(false);
      setEcomGstin("");
      showToast(editingInvoiceId ? "Invoice details updated" : "Invoice generated successfully.");
    } finally {
      submitLock.current = false;
      setSavingInvoice(false);
    }
  };

  // ---------- PDF ----------
  const handleDownloadPdf = async (invId: string, invNum: string) => {
    if (downloadingId) return;
    setDownloadingId(invId);
    try {
      const token = localStorage.getItem("gstmitra_token");
      const response = await fetch(`${API_BASE_URL}/sales/invoices/${invId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        alert("Could not download the invoice PDF. Please try again.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
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

  // Today at midnight for overdue calculations
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const getInvoicePaymentInfo = (inv: any) => {
    const total = Number(inv.totalAmount) || 0;
    const paid = Number(inv.paidAmount) || 0;
    const pending = Math.max(0, r2(total - paid));
    const status = inv.paymentStatus || (pending <= 0 ? "PAID" : "UNPAID");

    let isOverdue = false;
    let overdueDays = 0;
    if (inv.dueDate && pending > 0 && inv.status !== "CANCELLED") {
      const due = new Date(inv.dueDate);
      due.setHours(0, 0, 0, 0);
      if (!isNaN(due.getTime())) {
        const diffMs = todayMidnight.getTime() - due.getTime();
        overdueDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isOverdue = overdueDays > 0;
      }
    }

    return { total, paid, pending, status, isOverdue, overdueDays };
  };

  let moneyToCollect = 0;
  let overdueAmount = 0;
  const customersWhoOwe = new Set<string>();

  invoices.forEach((inv) => {
    if (inv.status === "CANCELLED") return;
    const { pending, isOverdue } = getInvoicePaymentInfo(inv);
    if (pending > 0) {
      moneyToCollect += pending;
      if (inv.customerId || inv.customer?.id) {
        customersWhoOwe.add(inv.customerId || inv.customer?.id);
      }
    }
    if (isOverdue && pending > 0) {
      overdueAmount += pending;
    }
  });

  moneyToCollect = r2(moneyToCollect);
  overdueAmount = r2(overdueAmount);

  const filteredInvoices = displayInvoices.filter((inv) => {
    if (invoiceFilter === "ALL") return true;
    const { status, pending } = getInvoicePaymentInfo(inv);
    if (invoiceFilter === "TO_COLLECT") {
      return inv.status !== "CANCELLED" && (status === "PARTIAL" || status === "UNPAID" || pending > 0);
    }
    if (invoiceFilter === "PAID") {
      return inv.status !== "CANCELLED" && (status === "PAID" || pending <= 0);
    }
    return true;
  });

  const toCollectCount = displayInvoices.filter((inv) => {
    if (inv.status === "CANCELLED") return false;
    const { status, pending } = getInvoicePaymentInfo(inv);
    return status === "PARTIAL" || status === "UNPAID" || pending > 0;
  }).length;

  const paidCount = displayInvoices.filter((inv) => {
    if (inv.status === "CANCELLED") return false;
    const { status, pending } = getInvoicePaymentInfo(inv);
    return status === "PAID" || pending <= 0;
  }).length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Sales & Customer Invoices
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Auto CGST+SGST for same state sales, IGST for interstate sales. Download the invoice PDF anytime from the table.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/new-bill/create"
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Generate Invoice</span>
          </Link>
          <button
            onClick={() => setShowCustomerModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all"
          >
            <Users className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
          
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-xs font-bold">
        <button
          onClick={() => setTab("INVOICES")}
          className={`pb-2.5 px-1 border-b-2 transition-all ${
            tab === "INVOICES" ? "border-blue-600 text-blue-700 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          All Invoices ({invoicesQ.loading ? "…" : invoices.length})
        </button>
        <button
          onClick={() => setTab("CUSTOMERS")}
          className={`pb-2.5 px-1 border-b-2 transition-all ${
            tab === "CUSTOMERS" ? "border-blue-600 text-blue-700 font-extrabold" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Customers ({customersQ.loading ? "…" : customers.length})
        </button>
      </div>

      {/* Invoices List */}
      {tab === "INVOICES" && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Money to collect
                </p>
                <p className="text-2xl font-extrabold text-slate-900">
                  ₹{moneyToCollect.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500">
                  from {customersWhoOwe.size} {customersWhoOwe.size === 1 ? "customer" : "customers"}
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Overdue
                </p>
                <p className="text-2xl font-extrabold text-red-600">
                  ₹{overdueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500">
                  past payment due date
                </p>
              </div>
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
                <AlertCircle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Sub-tabs for invoices */}
          <div className="flex border-b border-slate-200 gap-2 text-xs font-bold pt-1">
            <button
              onClick={() => setInvoiceFilter("ALL")}
              className={`pb-2.5 px-3 border-b-2 transition-all ${
                invoiceFilter === "ALL"
                  ? "border-blue-600 text-blue-700 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              All ({displayInvoices.length})
            </button>
            <button
              onClick={() => setInvoiceFilter("TO_COLLECT")}
              className={`pb-2.5 px-3 border-b-2 transition-all ${
                invoiceFilter === "TO_COLLECT"
                  ? "border-blue-600 text-blue-700 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              To collect ({toCollectCount})
            </button>
            <button
              onClick={() => setInvoiceFilter("PAID")}
              className={`pb-2.5 px-3 border-b-2 transition-all ${
                invoiceFilter === "PAID"
                  ? "border-blue-600 text-blue-700 font-extrabold"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              Paid ({paidCount})
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {invoicesQ.loading ? (
              <TableSkeleton />
            ) : invoicesQ.error && invoices.length === 0 ? (
              <TableError message={invoicesQ.error.message} onRetry={() => invoicesQ.mutate()} />
            ) : displayInvoices.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No sales invoices generated yet</p>
                <p className="text-xs text-slate-500">Click &quot;Create Tax Invoice&quot; to create your first invoice.</p>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No invoices in this view</p>
                <p className="text-xs text-slate-400">
                  {invoiceFilter === "TO_COLLECT"
                    ? "Great news! All invoices are fully paid."
                    : "No paid invoices yet."}
                </p>
              </div>
            ) : (
              <>
                {/* Desktop & Tablet Table */}
                <div className="overflow-x-auto hidden md:block">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Supply Type</th>
                        <th className="py-3 px-4">Total Amount</th>
                        <th className="py-3 px-4">Payment Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                      {filteredInvoices.map((inv) => {
                        const { pending, status, isOverdue, overdueDays } = getInvoicePaymentInfo(inv);
                        return (
                          <tr
                            key={inv.id}
                            id={`health-check-record-${inv.id}`}
                            className={`transition-colors ${
                              highlightedInvoice?.id === inv.id
                                ? "bg-amber-50 outline outline-2 outline-amber-400"
                                : "hover:bg-slate-50/80"
                            }`}
                          >
                            <td className="py-3 px-4 font-mono font-bold text-blue-700">{inv.invoiceNumber}</td>
                            <td className="py-3 px-4 text-slate-600">
                              {new Date(inv.invoiceDate).toLocaleDateString("en-IN")}
                            </td>
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {inv.customer?.name || "Customer"}
                              {(inv.buyerGstin || inv.customer?.gstin) && (
                                <p className="text-3xs text-slate-400 font-mono">{inv.buyerGstin || inv.customer?.gstin}</p>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`text-3xs font-bold px-2 py-0.5 rounded-full ${
                                  inv.supplyType === "INTRA_STATE"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-purple-50 text-purple-700"
                                }`}
                              >
                                {inv.supplyType === "INTRA_STATE" ? "CGST + SGST (Intra)" : "IGST (Interstate)"}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-extrabold text-slate-900">₹{inv.totalAmount.toFixed(2)}</td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-1 items-start">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {status === "PAID" ? (
                                    <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Paid
                                    </span>
                                  ) : status === "PARTIAL" ? (
                                    <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                      Part paid
                                    </span>
                                  ) : (
                                    <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                      Unpaid
                                    </span>
                                  )}
                                  {isOverdue && pending > 0 && (
                                    <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                                      Overdue {overdueDays} {overdueDays === 1 ? "day" : "days"}
                                    </span>
                                  )}
                                </div>
                                <span className="text-3xs text-slate-500 font-medium">
                                  {pending > 0 ? (
                                    <>
                                      Pending: <strong className="text-slate-800 font-mono font-bold">₹{pending.toFixed(2)}</strong>
                                      {inv.reminderCount > 0 && (
                                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-3xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                          <Bell className="w-2.5 h-2.5" />
                                          Reminded ({inv.reminderCount}x)
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-emerald-700 font-semibold">Fully settled</span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right space-x-2">
                              {inv.status !== "CANCELLED" && pending > 0 && (
                                <>
                                  <button
                                    onClick={() => setPaymentInvoice(inv)}
                                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                  >
                                    <IndianRupee className="w-3.5 h-3.5" />
                                    <span>Add payment</span>
                                  </button>
                                  <button
                                    onClick={() => handleSendReminder(inv)}
                                    disabled={remindingId === inv.id}
                                    title="Send payment reminder to customer by email"
                                    className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                  >
                                    <Bell className="w-3.5 h-3.5" />
                                    <span>{remindingId === inv.id ? "Sending..." : "Remind"}</span>
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => void openInvoiceEditor(inv.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                disabled={downloadingId === inv.id}
                                title="Download invoice PDF"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 disabled:opacity-60"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{downloadingId === inv.id ? "..." : "Invoice PDF"}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card View (phone width) */}
                <div className="divide-y divide-slate-100 block md:hidden">
                  {filteredInvoices.map((inv) => {
                    const { pending, status, isOverdue, overdueDays } = getInvoicePaymentInfo(inv);
                    return (
                      <div
                        key={inv.id}
                        id={`health-check-record-mobile-${inv.id}`}
                        className={`p-4 space-y-3 ${
                          highlightedInvoice?.id === inv.id ? "bg-amber-50" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-mono font-bold text-blue-700 text-xs">{inv.invoiceNumber}</p>
                            <p className="text-xs font-bold text-slate-900 mt-0.5">{inv.customer?.name || "Customer"}</p>
                            <p className="text-3xs text-slate-400 mt-0.5">
                              {new Date(inv.invoiceDate).toLocaleDateString("en-IN")}
                            </p>
                          </div>
                          <div className="flex flex-col items-end">
                            <p className="font-extrabold text-sm text-slate-900">₹{inv.totalAmount.toFixed(2)}</p>
                            {pending > 0 ? (
                              <p className="text-3xs font-semibold text-amber-700">Pending: ₹{pending.toFixed(2)}</p>
                            ) : (
                              <p className="text-3xs font-semibold text-emerald-700">Paid in full</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {status === "PAID" ? (
                              <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Paid
                              </span>
                            ) : status === "PARTIAL" ? (
                              <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                Part paid
                              </span>
                            ) : (
                              <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                Unpaid
                              </span>
                            )}
                            {isOverdue && pending > 0 && (
                              <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                                Overdue {overdueDays}d
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {inv.status !== "CANCELLED" && pending > 0 && (
                              <>
                                <button
                                  onClick={() => setPaymentInvoice(inv)}
                                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                                >
                                  <IndianRupee className="w-3 h-3" />
                                  <span>Add payment</span>
                                </button>
                                <button
                                  onClick={() => handleSendReminder(inv)}
                                  disabled={remindingId === inv.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"
                                >
                                  <Bell className="w-3 h-3" />
                                  <span>{remindingId === inv.id ? "..." : "Remind"}</span>
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => void openInvoiceEditor(inv.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                              disabled={downloadingId === inv.id}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-md border border-blue-200"
                            >
                              <Download className="w-3 h-3" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Customers List */}
      {tab === "CUSTOMERS" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {customersQ.loading ? (
            <TableSkeleton />
          ) : customersQ.error && customers.length === 0 ? (
            <TableError message={customersQ.error.message} onRetry={() => customersQ.mutate()} />
          ) : customers.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Users className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No customers added yet</p>
              <p className="text-xs text-slate-500">Click "Add Customer" to add your first customer.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Customer Name</th>
                    <th className="py-3 px-4">GSTIN</th>
                    <th className="py-3 px-4">State</th>
                    <th className="py-3 px-4">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                      <td className="py-3 px-4 font-mono">{c.gstin || "Unregistered"}</td>
                      <td className="py-3 px-4">
                        {c.stateName} ({c.stateCode})
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-600">{c.registrationType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">Add Customer / Party</h3>
              <button
                type="button"
                disabled={savingCustomer}
                onClick={() => setShowCustomerModal(false)}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {custError && <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg">{custError}</div>}

            <form onSubmit={handleSaveCustomer} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customer / Company Name *</label>
                <input
                  type="text"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="e.g. Acme Tech Solutions"
                  required
                  disabled={savingCustomer}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email for payment reminders (Optional)</label>
                <input
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  placeholder="customer@example.com"
                  disabled={savingCustomer}
                  className="w-full px-3 py-2 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">15-Digit GSTIN (Optional)</label>
                <input
                  type="text"
                  value={custGstin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setCustGstin(val);
                    if (val.length >= 2 && INDIAN_STATES.some((s) => s.code === val.substring(0, 2))) {
                      setCustState(val.substring(0, 2));
                    }
                  }}
                  maxLength={15}
                  placeholder="e.g. 27AAAAA0000A1Z5"
                  disabled={savingCustomer}
                  className="w-full px-3 py-2 border rounded-xl font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">State</label>
                <select
                  value={custState}
                  onChange={(e) => setCustState(e.target.value)}
                  disabled={savingCustomer}
                  className="w-full px-3 py-2 border rounded-xl bg-white"
                >
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  disabled={savingCustomer}
                  onClick={() => setShowCustomerModal(false)}
                  className="px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCustomer}
                  className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingCustomer && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {savingCustomer ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6 space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-base text-slate-900">{editingInvoiceId ? "Edit Tax Invoice" : "Create Tax Invoice"}</h3>
              <button
                type="button"
                disabled={savingInvoice}
                onClick={() => {
                  setShowInvoiceModal(false);
                  setEditingInvoiceId(null);
                }}
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveInvoice} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer *</label>
                  <select
                    value={selectedCustId}
                    onChange={(e) => setSelectedCustId(e.target.value)}
                    disabled={savingInvoice}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.stateCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invDate}
                    onChange={(e) => setInvDate(e.target.value)}
                    disabled={savingInvoice}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Due Date (optional)</label>
                  <input
                    type="date"
                    value={invDueDate}
                    min={invDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    disabled={savingInvoice}
                    className="w-full px-3 py-2 border rounded-xl bg-white"
                  />
                </div>
              </div>
              <label className="block font-semibold text-slate-700">
                Notes (optional)
                <textarea
                  value={invNotes}
                  onChange={(event) => setInvNotes(event.target.value)}
                  disabled={savingInvoice}
                  rows={2}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>

              <details className="border border-slate-200 rounded-xl p-3">
                <summary className="font-bold text-slate-800 cursor-pointer">Advanced (optional)</summary>
                <div className="mt-3 space-y-3">
                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isReverseCharge}
                      onChange={(e) => setIsReverseCharge(e.target.checked)}
                      disabled={savingInvoice}
                      className="rounded border-slate-300"
                    />
                    Tax payable on reverse charge
                  </label>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Applicable % of Tax Rate</label>
                    <select
                      value={applicablePercent}
                      onChange={(e) => setApplicablePercent(e.target.value)}
                      disabled={savingInvoice}
                      className="w-full px-3 py-2 border rounded-xl bg-white"
                    >
                      <option value="">Not applicable</option>
                      <option value="65">65%</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isEcommerceSale}
                      onChange={(e) => {
                        setIsEcommerceSale(e.target.checked);
                        if (!e.target.checked) setEcomGstin("");
                      }}
                      disabled={savingInvoice}
                      className="rounded border-slate-300"
                    />
                    Sold via e-commerce
                  </label>

                  {isEcommerceSale && (
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">E-Commerce GSTIN</label>
                      <input
                        type="text"
                        value={ecomGstin}
                        onChange={(e) => setEcomGstin(e.target.value.toUpperCase())}
                        maxLength={15}
                        disabled={savingInvoice}
                        className="w-full px-3 py-2 border rounded-xl font-mono uppercase"
                      />
                    </div>
                  )}
                </div>
              </details>

              {/* Tax Type Badge */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs flex items-center justify-between">
                <span className="font-bold text-blue-900">
                  Tax Calculation Rule: {isIntraState ? "Intra-State (CGST + SGST)" : "Interstate (IGST)"}
                </span>
                <span className="text-3xs text-blue-700">
                  Home State ({business?.stateCode}) vs Customer State ({selectedCustomer?.stateCode || business?.stateCode})
                </span>
              </div>

              {/* Line Items */}
              <div className="space-y-3">
                <label className="block font-bold text-slate-800">Invoice Items</label>
                {itemsQ.loading ? (
                  <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
                ) : itemsList.length === 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <p className="text-amber-800 font-medium">
                      No items in your catalog yet. Add an item first to pick it here.
                    </p>
                    <Link
                      href="/items"
                      target="_blank"
                      className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg"
                    >
                      + Add Item
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-3xs text-slate-500">
                    <span>Item not in the list?</span>
                    <div className="flex items-center gap-3">
                      <Link href="/items" target="_blank" className="font-bold text-blue-600 hover:underline">
                        + Add new item
                      </Link>
                      <button
                        type="button"
                        onClick={() => itemsQ.mutate()}
                        className="font-bold text-slate-600 hover:underline"
                      >
                        ↻ Refresh list
                      </button>
                    </div>
                  </div>
                )}

                {invItems.map((itm, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 p-3 bg-slate-50 rounded-xl border items-center">
                    <div className="col-span-2">
                      <select
                        value={itm.itemId}
                        onChange={(e) => handleItemSelect(idx, e.target.value)}
                        disabled={savingInvoice}
                        className="w-full px-2 py-1.5 border rounded-lg bg-white"
                      >
                        <option value="">Select Item...</option>
                        {itemsList.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} (₹{i.sellingPrice})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-3">
                      <input
                        type="text"
                        value={itm.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="Description"
                        disabled={savingInvoice}
                        className="w-full px-2 py-1.5 border rounded-lg"
                      />
                    </div>

                    <div className="col-span-1">
                      <input
                        type="number"
                        min="1"
                        value={itm.quantity}
                        onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 1 })}
                        disabled={savingInvoice}
                        title="Quantity"
                        className="w-full px-1 py-1.5 border rounded-lg text-center"
                      />
                    </div>

                    <div className="col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        value={itm.rate}
                        onChange={(e) => updateItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                        placeholder="Rate ₹"
                        disabled={savingInvoice}
                        className="w-full px-2 py-1.5 border rounded-lg text-right font-bold"
                      />
                    </div>

                    <div className="col-span-2">
                      <select
                        value={itm.gstRate}
                        onChange={(e) => updateItem(idx, { gstRate: parseFloat(e.target.value) })}
                        disabled={savingInvoice}
                        title="GST rate"
                        className="w-full px-1 py-1.5 border rounded-lg bg-white font-semibold text-blue-700"
                      >
                        {GST_RATES.map((r) => (
                          <option key={r} value={r}>
                            {r}%
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={itm.cessRate ?? 0}
                        onChange={(e) => updateItem(idx, { cessRate: parseFloat(e.target.value) || 0 })}
                        disabled={savingInvoice}
                        title="Cess rate (%)"
                        placeholder="Cess %"
                        className="w-full px-1 py-1.5 border rounded-lg text-center"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(idx)}
                        disabled={savingInvoice}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddLineItem}
                  disabled={savingInvoice}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              </div>

              {/* Totals Box */}
              <div className="bg-slate-900 text-white rounded-xl p-4 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span>Taxable Subtotal:</span>
                  <span className="font-semibold">₹{totalTaxable.toFixed(2)}</span>
                </div>
                {totalCess > 0 && (
                  <div className="flex justify-between text-amber-300">
                    <span>Cess:</span>
                    <span>₹{totalCess.toFixed(2)}</span>
                  </div>
                )}
                {isIntraState ? (
                  <>
                    <div className="flex justify-between text-blue-300">
                      <span>CGST Tax:</span>
                      <span>₹{totalCgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-blue-300">
                      <span>SGST Tax:</span>
                      <span>₹{totalSgst.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-purple-300">
                    <span>IGST Tax:</span>
                    <span>₹{totalIgst.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-extrabold text-sm text-yellow-300 pt-2 border-t border-slate-700">
                  <span>Grand Total:</span>
                  <span>₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t">
                <button
                  type="button"
                  disabled={savingInvoice}
                  onClick={() => {
                    setShowInvoiceModal(false);
                    setEditingInvoiceId(null);
                  }}
                  className="px-4 py-2 font-semibold disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingInvoice}
                  className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {savingInvoice && (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  )}
                  {savingInvoice ? "Saving..." : editingInvoiceId ? "Save Invoice Changes" : "Generate Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment Modal */}
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

      {/* Payment reminder email sent */}
      {reminderModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900">
                <Bell className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-bold">Payment Reminder Emailed</h3>
              </div>
              <button
                type="button"
                onClick={() => setReminderModalData(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-1">
              <p className="font-semibold">
                Bill #{reminderModalData.invoiceNum} · {reminderModalData.customerName}
              </p>
              <p>Due amount: ₹{reminderModalData.pendingAmount.toFixed(2)}</p>
              <p>Email sent to <strong>{reminderModalData.email}</strong>.</p>
              <p className="text-2xs text-emerald-800">
                Reminder sent {reminderModalData.count} time{reminderModalData.count > 1 ? "s" : ""}. The customer can also see it in My Bills.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setReminderModalData(null)}
              className="w-full rounded-xl border border-slate-300 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Done
            </button>
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