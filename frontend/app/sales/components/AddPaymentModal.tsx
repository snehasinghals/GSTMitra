"use client";

import React, { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";
import { X } from "lucide-react";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
};

type PaymentRecord = {
  id: string;
  amount: number;
  mode: string;
  paidOn: string;
  note?: string | null;
};

type Props = {
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount: number;
    customer?: { name: string } | null;
  };
  onClose: () => void;
  onSuccess: () => void;
};

const MODE_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK", label: "Bank" },
];

const modeLabel = (m: string) => MODE_OPTIONS.find((o) => o.value === m)?.label || m;

export default function AddPaymentModal({ invoice, onClose, onSuccess }: Props) {
  const pending = Math.max(0, r2(Number(invoice.totalAmount) - Number(invoice.paidAmount)));

  const [amount, setAmount] = useState(String(pending));
  const [mode, setMode] = useState("CASH");
  const [paidOn, setPaidOn] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: err } = await apiFetch<PaymentRecord[]>(
        `/sales/invoices/${invoice.id}/payments`
      );
      if (!active) return;
      setLoadingPayments(false);
      if (data) setPayments(data);
      if (err) console.error("Failed to load payments:", err);
    })();
    return () => { active = false; };
  }, [invoice.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const numAmt = parseFloat(amount);
    if (!numAmt || numAmt <= 0) {
      setError("Amount must be more than 0.");
      return;
    }
    if (numAmt > pending) {
      setError(`Amount cannot be more than the pending balance (₹${pending.toFixed(2)}).`);
      return;
    }

    setSaving(true);
    const { error: apiErr } = await apiFetch<any>(
      `/sales/invoices/${invoice.id}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: numAmt,
          mode,
          paidOn: paidOn || todayStr(),
          note: note.trim() || undefined,
        }),
      }
    );
    setSaving(false);

    if (apiErr) {
      setError(apiErr);
      return;
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-fadeIn max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="font-bold text-base text-slate-900">Add payment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {invoice.invoiceNumber} · {invoice.customer?.name || "Customer"}
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Payments so far */}
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-700">Payments so far</p>
          {loadingPayments ? (
            <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
          ) : payments.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No payments yet</p>
          ) : (
            <div className="max-h-32 overflow-y-auto space-y-1.5">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2 border border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-3xs font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {modeLabel(p.mode)}
                    </span>
                    <span className="text-slate-500">
                      {new Date(p.paidOn).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  <span className="font-bold text-slate-900">₹{Number(p.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-between text-xs font-bold text-slate-800 border-t pt-2">
            <span>Pending balance</span>
            <span className="text-amber-700 font-mono">₹{pending.toFixed(2)}</span>
          </div>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg">{error}</div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Amount *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={pending}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              disabled={saving}
              className="w-full px-3 py-2.5 border rounded-xl text-right font-bold text-lg"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Mode</label>
            <div className="flex gap-2">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={saving}
                  onClick={() => setMode(opt.value)}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs border transition-all ${
                    mode === opt.value
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  } disabled:opacity-50`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Date</label>
            <input
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2.5 border rounded-xl bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Received via Google Pay"
              disabled={saving}
              className="w-full px-3 py-2.5 border rounded-xl"
            />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row justify-end gap-2 border-t">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-4 py-2.5 font-semibold text-slate-600 disabled:opacity-50 order-2 sm:order-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm order-1 sm:order-2"
            >
              {saving && (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {saving ? "Saving..." : "Save payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

