"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, X } from "lucide-react";
import { apiFetch } from "../lib/api";

type Suggestion = { code: string; description: string };

type MissingItem = {
  itemId: string;
  description: string;
  gstRate: number;
  unit: string;
  invoice: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    customer: { id: string; name: string } | null;
  } | null;
  suggestions: Suggestion[];
  // local state
  pending?: string; // hsn picked but not saved yet
  saved?: boolean;
  saving?: boolean;
  error?: string;
};

export default function FixHsnPage() {
  const [items, setItems] = useState<MissingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [allDoneMsg, setAllDoneMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    const { data, error } = await apiFetch<{ count: number; items: MissingItem[] }>(
      "/sales/invoices/missing-hsn"
    );
    if (error || !data) {
      setFetchError(error || "Could not load items.");
    } else {
      setItems(data.items.map((i) => ({ ...i, pending: undefined, saved: false, saving: false, error: "" })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchItem = useCallback(
    async (itemId: string, hsnSacCode: string): Promise<boolean> => {
      setItems((prev) =>
        prev.map((i) => (i.itemId === itemId ? { ...i, saving: true, error: "" } : i))
      );
      const { error } = await apiFetch("/sales/invoices/fix-hsn", {
        method: "PATCH",
        body: JSON.stringify({ itemId, hsnSacCode }),
      });
      if (error) {
        setItems((prev) =>
          prev.map((i) => (i.itemId === itemId ? { ...i, saving: false, error } : i))
        );
        return false;
      }
      setItems((prev) =>
        prev.map((i) => (i.itemId === itemId ? { ...i, saving: false, saved: true, error: "" } : i))
      );
      return true;
    },
    []
  );

  const acceptAll = async () => {
    // For each unsaved item that has a pending pick or at least one suggestion, accept the top suggestion
    const candidates = items.filter(
      (i) => !i.saved && (i.pending || i.suggestions.length > 0)
    );
    if (candidates.length === 0) return;
    setAcceptingAll(true);

    const fixes = candidates.map((item) => ({
      invoiceItemId: item.itemId,
      hsnSacCode: item.pending || item.suggestions[0].code,
    }));

    const { error } = await apiFetch("/sales/invoices/fix-hsn", {
      method: "POST",
      body: JSON.stringify({ fixes }),
    });

    setAcceptingAll(false);
    if (!error) {
      setItems((prev) =>
        prev.map((i) => {
          const match = fixes.find((f) => f.invoiceItemId === i.itemId);
          return match ? { ...i, pending: match.hsnSacCode, saved: true, error: "" } : i;
        })
      );
      setAllDoneMsg(`All ${fixes.length} item${fixes.length > 1 ? "s" : ""} updated successfully!`);
    } else {
      setFetchError(error || "Failed to update items in bulk.");
    }
  };

  const unsaved = items.filter((i) => !i.saved);
  const saved = items.filter((i) => i.saved);

  return (
    <div className="mx-auto max-w-2xl px-3 pb-10 sm:px-0">
      {/* Header */}
      <div className="flex items-center justify-between py-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Fix HSN codes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Set missing HSN codes so GSTR-1 can be exported.
          </p>
        </div>
        <Link
          href="/sales"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Sales
        </Link>
      </div>

      {loading && (
        <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
      )}

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      {!loading && !fetchError && unsaved.length === 0 && saved.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-emerald-800">
            No items with missing HSN — you can export GSTR-1.
          </p>
          <Link href="/filing" className="text-sm text-emerald-700 underline">
            Go to Filing
          </Link>
        </div>
      )}

      {!loading && unsaved.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>{unsaved.length}</strong> item{unsaved.length > 1 ? "s" : ""} need HSN
              </span>
            </div>
            <button
              type="button"
              onClick={acceptAll}
              disabled={acceptingAll}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {acceptingAll ? "Saving…" : "Accept all (top suggestion)"}
            </button>
          </div>

          {allDoneMsg && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {allDoneMsg}
            </div>
          )}

          <div className="space-y-3">
            {unsaved.map((item) => (
              <ItemCard
                key={item.itemId}
                item={item}
                onPick={(hsn) =>
                  setItems((prev) =>
                    prev.map((i) => (i.itemId === item.itemId ? { ...i, pending: hsn } : i))
                  )
                }
                onAccept={() => patchItem(item.itemId, item.pending || item.suggestions[0]?.code || "")}
              />
            ))}
          </div>
        </>
      )}

      {/* Already fixed this session */}
      {saved.length > 0 && (
        <div className="mt-6 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Fixed this session ({saved.length})
          </p>
          {saved.map((item) => (
            <div
              key={item.itemId}
              className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800"
            >
              <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="flex-1">{item.description}</span>
              <span className="font-mono text-xs text-emerald-700">{item.pending || item.suggestions[0]?.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({
  item,
  onPick,
  onAccept,
}: {
  item: MissingItem;
  onPick: (hsn: string) => void;
  onAccept: () => void;
}) {
  const picked = item.pending;
  const hasSuggestions = item.suggestions.length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Invoice context */}
      {item.invoice && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-mono text-slate-700">#{item.invoice.invoiceNumber}</span>
          <span>·</span>
          <span>{item.invoice.customer?.name ?? "Customer"}</span>
          <span>·</span>
          <span>{new Date(item.invoice.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      )}

      {/* Item details */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{item.description}</p>
          <p className="text-xs text-slate-500">
            GST {item.gstRate}% · {item.unit}
          </p>
        </div>
        {picked && (
          <div className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-mono text-blue-800">
            {picked}
            <button
              type="button"
              onClick={() => onPick("")}
              aria-label="Clear selection"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {hasSuggestions && !picked && (
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-slate-500">Suggestions:</span>
          {item.suggestions.map((s) => {
            const shortDesc =
              s.description.length > 35
                ? s.description.slice(0, 33) + "…"
                : s.description;
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => onPick(s.code)}
                title={s.description}
                className="rounded-full border border-slate-300 px-2.5 py-1 font-mono text-xs text-slate-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
              >
                {s.code} · {shortDesc}
              </button>
            );
          })}
        </div>
      )}

      {!hasSuggestions && !picked && (
        <p className="text-xs text-slate-400 italic">No automatic suggestions — type the HSN code manually below.</p>
      )}

      {/* Manual entry */}
      <ManualHsnInput
        onSet={onPick}
        current={picked || ""}
      />

      {/* Error */}
      {item.error && (
        <p className="text-xs text-red-600">{item.error}</p>
      )}

      {/* Accept button */}
      <button
        type="button"
        onClick={onAccept}
        disabled={item.saving || (!picked && !hasSuggestions)}
        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {item.saving
          ? "Saving…"
          : picked
          ? `Accept ${picked}`
          : hasSuggestions
          ? `Accept ${item.suggestions[0].code}`
          : "No HSN available"}
      </button>
    </div>
  );
}

function ManualHsnInput({
  current,
  onSet,
}: {
  current: string;
  onSet: (hsn: string) => void;
}) {
  const [val, setVal] = useState(current);

  useEffect(() => {
    setVal(current);
  }, [current]);

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 8))}
        placeholder="Or type HSN (4-8 digits)"
        maxLength={8}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm placeholder:text-slate-400"
      />
      <button
        type="button"
        onClick={() => {
          if (/^\d{4,8}$/.test(val)) onSet(val);
        }}
        disabled={!/^\d{4,8}$/.test(val)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
      >
        Use
      </button>
    </div>
  );
}

