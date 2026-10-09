"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { apiFetch, API_BASE_URL } from "../lib/api";
import { useApi } from "../lib/useApi";
import { INDIAN_STATES, stateNameFromCode, GSTIN_REGEX } from "../lib/states";
import { TableSkeleton, TableError } from "../components/TableSkeleton";
import { FileText, Plus, Download, Users, X, PlusCircle, Pencil } from "lucide-react";

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
      showToast(editingInvoiceId ? "Invoice details updated" : "Invoice generated. Your bill PDF is downloading.");
      if (!editingInvoiceId && created?.id && created?.invoiceNumber) {
        void handleDownloadPdf(created.id, created.invoiceNumber, true);
      }
    } finally {
      submitLock.current = false;
      setSavingInvoice(false);
    }
  };

  // ---------- PDF ----------
  const handleDownloadPdf = async (invId: string, invNum: string, billLayout = false) => {
    if (downloadingId) return;
    setDownloadingId(invId);
    try {
      const token = localStorage.getItem("gstmitra_token");
      const pdfPath = billLayout ? "bill.pdf" : "pdf";
      const response = await fetch(`${API_BASE_URL}/sales/invoices/${invId}/${pdfPath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        alert(`Could not download the ${billLayout ? "bill" : "invoice"} PDF. Please try again.`);
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = billLayout ? `BILL-${invNum}.pdf` : `${invNum}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert(`Could not download the ${billLayout ? "bill" : "invoice"} PDF. Please check your connection.`);
    } finally {
      setDownloadingId(null);
    }
  };

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
            Auto CGST+SGST for same state sales, IGST for interstate sales. Download the invoice or bill layout after creation.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowCustomerModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs px-3.5 py-2.5 rounded-xl shadow-xs transition-all"
          >
            <Users className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
          <button
            // Disabled until customers have loaded, otherwise users get a false "add a customer first" message.
            disabled={customersQ.loading || !!customersQ.error}
            onClick={() => {
              if (customers.length === 0) {
                alert("Please add at least one customer first.");
                setShowCustomerModal(true);
                return;
              }
              setEditingInvoiceId(null);
              setInvDate(todayStr());
              setInvDueDate("");
              setInvNotes("");
              setInvItems([newLine()]);
              setIsReverseCharge(false);
              setApplicablePercent("");
              setIsEcommerceSale(false);
              setEcomGstin("");
              setSelectedCustId(customers[0]?.id || "");
              setShowInvoiceModal(true);
            }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Create Tax Invoice</span>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {invoicesQ.loading ? (
            <TableSkeleton />
          ) : invoicesQ.error && invoices.length === 0 ? (
            <TableError message={invoicesQ.error.message} onRetry={() => invoicesQ.mutate()} />
          ) : displayInvoices.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <FileText className="w-12 h-12 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">No sales invoices generated yet</p>
              <p className="text-xs text-slate-500">Click "Create Tax Invoice" to create your first invoice.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-3xs font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Supply Type</th>
                    <th className="py-3 px-4">Taxable</th>
                    <th className="py-3 px-4">Total Amount</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                  {displayInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      id={`health-check-record-${inv.id}`}
                      className={`transition-colors ${highlightedInvoice?.id === inv.id ? "bg-amber-50 outline outline-2 outline-amber-400" : "hover:bg-slate-50/80"}`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4 text-slate-600">{new Date(inv.invoiceDate).toLocaleDateString("en-IN")}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {inv.customer?.name}
                        {inv.customer?.gstin && (
                          <p className="text-3xs text-slate-400 font-mono">{inv.customer.gstin}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-3xs font-bold px-2 py-0.5 rounded-full ${
                            inv.supplyType === "INTRA_STATE" ? "bg-emerald-50 text-emerald-700" : "bg-purple-50 text-purple-700"
                          }`}
                        >
                          {inv.supplyType === "INTRA_STATE" ? "CGST + SGST (Intra)" : "IGST (Interstate)"}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium">₹{inv.subtotal.toFixed(2)}</td>
                      <td className="py-3 px-4 font-extrabold text-slate-900">₹{inv.totalAmount.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right space-x-2">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

      {toast && (
        <div className="fixed bottom-6 right-6 z-[60] bg-emerald-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg animate-fadeIn">
          ✓ {toast}
        </div>
      )}
    </div>
  );
}