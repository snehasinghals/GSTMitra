"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, API_BASE_URL } from "../../lib/api";
import { GSTIN_REGEX, INDIAN_STATES, isValidGstin, normalizeGstin } from "../../lib/states";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

const GST_RATES = [0, 5, 18, 40];
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const todayStr = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
};

type CatalogItem = {
  id: string;
  name: string;
  hsnSacCode?: string | null;
  sellingPrice: number;
  gstRate: number;
  unit?: string;
};

type HsnHit = { code: string; description: string; gstRate?: number | null };

type Line = {
  uid: number;
  itemId?: string;
  name: string;
  hsn: string;
  qty: string;
  price: string;
  gstRate: number;
  unit: string;
  cessRate: string;
  saveToCatalog: boolean;
};

let uidCounter = 1;
const newLine = (): Line => ({
  uid: uidCounter++,
  itemId: undefined,
  name: "",
  hsn: "",
  qty: "1",
  price: "",
  gstRate: 18,
  unit: "PCS",
  cessRate: "",
  saveToCatalog: false,
});

// ---------------------------------------------------------------
// HSN lookup by plain product name / code (debounced)
// ---------------------------------------------------------------
function useHsnSearch(q: string, enabled: boolean, type: "GOODS" | "SERVICE" = "GOODS") {
  const [hits, setHits] = useState<HsnHit[]>([]);
  useEffect(() => {
    if (!enabled || q.length < 3) {
      setHits([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await apiFetch<HsnHit[]>(
        `/hsn/suggest?q=${encodeURIComponent(q)}&type=${type}`
      );
      if (active) setHits(Array.isArray(data) ? data.slice(0, 3) : []);
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, enabled, type]);
  return hits;
}

// ---------------------------------------------------------------
// One item row
// ---------------------------------------------------------------
function ItemRow({
  line,
  catalog,
  total,
  canRemove,
  onChange,
  onRemove,
}: {
  line: Line;
  catalog: CatalogItem[];
  total: number;
  canRemove: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [hsnQuery, setHsnQuery] = useState("");

  const suggestions = useMemo(() => {
    const q = line.name.trim().toLowerCase();
    if (!focused || !q || line.itemId) return [];
    return catalog.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [focused, line.name, line.itemId, catalog]);

  const query = hsnQuery.trim() || line.name.trim();
  // Only search when there's no HSN set AND the item isn't from the catalog
  const hsnHits = useHsnSearch(query, !line.hsn && !line.itemId);

  const pickCatalog = (c: CatalogItem) => {
    onChange({
      itemId: c.id,
      name: c.name,
      hsn: c.hsnSacCode || "",
      price: String(c.sellingPrice ?? ""),
      gstRate: GST_RATES.includes(c.gstRate) ? c.gstRate : 18,
      unit: c.unit || "PCS",
    });
    setFocused(false);
  };

  const pickHsn = (h: HsnHit) => {
    const patch: Partial<Line> = { hsn: h.code };
    if (!line.itemId && h.gstRate != null && GST_RATES.includes(Number(h.gstRate))) {
      patch.gstRate = Number(h.gstRate);
    }
    onChange(patch);
    setHsnQuery("");
  };

  const qtyNum = Number(line.qty) || 0;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
      {/* Pick from saved Items */}
      <select
        value={line.itemId || ""}
        onChange={(e) => {
          const c = catalog.find((x) => x.id === e.target.value);
          if (c) pickCatalog(c);
          else onChange({ itemId: undefined });
        }}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
      >
        <option value="">Pick from my Items…</option>
        {catalog.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} (₹{c.sellingPrice})
          </option>
        ))}
      </select>

      {/* Name + remove */}
      <div className="flex items-start gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={line.name}
            onChange={(e) => onChange({ name: e.target.value, itemId: undefined })}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Item name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={() => pickCatalog(c)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-slate-500">₹{c.sellingPrice}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Qty, price, GST */}
      <div className="grid grid-cols-12 items-end gap-2">
        <div className="col-span-4">
          <label className="mb-1 block text-[11px] text-slate-500">Qty</label>
          <div className="flex">
            <button
              type="button"
              onClick={() => onChange({ qty: String(Math.max(1, qtyNum - 1)) })}
              className="rounded-l-lg border border-r-0 border-slate-300 px-2.5 text-slate-600 hover:bg-slate-50"
            >
              −
            </button>
            <input
              type="number"
              min="0"
              step="any"
              value={line.qty}
              onChange={(e) => onChange({ qty: e.target.value })}
              className="w-full border border-slate-300 py-2 text-center text-sm"
            />
            <button
              type="button"
              onClick={() => onChange({ qty: String(qtyNum + 1) })}
              className="rounded-r-lg border border-l-0 border-slate-300 px-2.5 text-slate-600 hover:bg-slate-50"
            >
              +
            </button>
          </div>
        </div>
        <div className="col-span-4">
          <label className="mb-1 block text-[11px] text-slate-500">Price (₹)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={line.price}
            onChange={(e) => onChange({ price: e.target.value })}
            placeholder="0"
            className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-right text-sm"
          />
        </div>
        <div className="col-span-4">
          <label className="mb-1 block text-[11px] text-slate-500">GST</label>
          <select
            value={line.gstRate}
            onChange={(e) => onChange({ gstRate: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
          >
            {GST_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* HSN status line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {line.hsn ? (
          <>
            <span className="text-slate-500">
              HSN <span className="font-mono text-slate-700">{line.hsn}</span>
            </span>
            <button
              type="button"
              onClick={() => onChange({ hsn: "" })}
              className="text-slate-400 underline hover:text-slate-600"
            >
              change
            </button>
          </>
        ) : hsnHits.length > 0 ? (
          <>
            <span className="text-slate-500">HSN:</span>
            {hsnHits.map((h) => {
              const shortDesc =
                h.description.length > 30
                  ? h.description.slice(0, 28) + "…"
                  : h.description;
              return (
                <button
                  key={h.code}
                  type="button"
                  onClick={() => pickHsn(h)}
                  title={h.description}
                  className="rounded-full border border-slate-300 px-2.5 py-1 font-mono text-slate-700 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700"
                >
                  {h.code} · {shortDesc}
                </button>
              );
            })}
          </>
        ) : (
          <span className="text-slate-400">
            HSN not set{line.name.trim().length < 3 ? " (type the item name to get suggestions)" : ""}
          </span>
        )}

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="ml-auto text-slate-500 hover:text-slate-800"
        >
          {showDetails ? "Hide details" : "Item details"}
        </button>
      </div>

      {showDetails && (
        <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-xs">
          <div className="col-span-2">
            <label className="mb-1 block text-slate-500">Search HSN by product name or code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={hsnQuery}
                onChange={(e) => setHsnQuery(e.target.value)}
                placeholder="e.g. rice, shirt, 6109"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <input
                type="text"
                value={line.hsn}
                onChange={(e) => onChange({ hsn: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                placeholder="HSN"
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-slate-500">Unit</label>
            <input
              type="text"
              value={line.unit}
              onChange={(e) => onChange({ unit: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
            />
          </div>
          <div>
            <label className="mb-1 block text-slate-500">Cess %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={line.cessRate}
              onChange={(e) => onChange({ cessRate: e.target.value })}
              placeholder="0"
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>
          {!line.itemId && (
            <label className="col-span-2 flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={line.saveToCatalog}
                onChange={(e) => onChange({ saveToCatalog: e.target.checked })}
                className="rounded border-slate-300"
              />
              Save to my Items (HSN and price are remembered next time)
            </label>
          )}
        </div>
      )}

      <div className="flex justify-end text-sm">
        <span className="text-slate-500">
          Line total&nbsp;<strong className="text-slate-900">₹{total.toFixed(2)}</strong>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// QR scanner: opens the camera and reads the QR automatically
// ---------------------------------------------------------------
// QR Scanner modal (camera live scan + browse image from device)
// ---------------------------------------------------------------
function QrScannerModal({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef(onResult);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [decodingFile, setDecodingFile] = useState(false);

  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            stopped = true;
            resultRef.current(code.data);
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Live camera is not available. You can browse or upload a QR image from your device below.");
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setStarting(false);
          raf = requestAnimationFrame(tick);
        }
      } catch (e: any) {
        setStarting(false);
        setError(
          e?.name === "NotAllowedError"
            ? "Camera permission was denied. You can browse or upload a QR photo below instead."
            : e?.name === "NotFoundError"
            ? "No camera found on this device. You can browse or upload a QR photo below."
            : "Could not start camera. You can browse or upload a QR photo below."
        );
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDecodingFile(true);
    setError("");

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const offscreenCanvas = document.createElement("canvas");
          offscreenCanvas.width = img.naturalWidth || img.width;
          offscreenCanvas.height = img.naturalHeight || img.height;
          const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            setError("Could not read image file.");
            setDecodingFile(false);
            return;
          }
          ctx.drawImage(img, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
          const imgData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: "attemptBoth",
          });
          if (code && code.data) {
            resultRef.current(code.data);
          } else {
            setError("No QR code detected in this photo. Please select a clearer photo or scan with camera.");
          }
        } catch {
          setError("Failed to decode QR code from the selected image.");
        } finally {
          setDecodingFile(false);
        }
      };
      img.onerror = () => {
        setError("Could not load image file.");
        setDecodingFile(false);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      setError("Failed to read image from device.");
      setDecodingFile(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Scan or Upload Customer QR</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-500 hover:text-slate-700" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            {error}
          </div>
        )}

        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              Starting camera…
            </div>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />

        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={decodingFile}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" />
            {decodingFile ? "Decoding photo..." : "Upload / Browse QR photo from device"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-300 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Quick UPI Setup Modal (inline setup without losing bill draft)
// ---------------------------------------------------------------
function QuickUpiModal({
  currentUpi,
  onSave,
  onClose,
}: {
  currentUpi: string;
  onSave: (upi: string) => void;
  onClose: () => void;
}) {
  const [upi, setUpi] = useState(currentUpi);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = upi.trim();
    if (!/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(clean)) {
      setError("Enter a valid UPI ID (e.g. name@oksbi)");
      return;
    }
    setSaving(true);
    const { data, error: err } = await apiFetch<{ message: string; business: { id: string; upiId: string } }>(
      "/auth/business/upi",
      {
        method: "PATCH",
        body: JSON.stringify({ upiId: clean }),
      }
    );
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    if (data?.business) {
      onSave(data.business.upiId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900">Add UPI ID</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4 text-slate-500 hover:text-slate-700" />
          </button>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Enter your shop&apos;s UPI ID so customers can scan and pay directly from this bill.
        </p>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">UPI ID</label>
            <input
              type="text"
              value={upi}
              onChange={(e) => {
                setUpi(e.target.value);
                setError("");
              }}
              placeholder="e.g. shopname@okaxis"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {saving ? "Saving..." : "Save & Generate QR"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Page
// ---------------------------------------------------------------
export default function NewBillPage() {
  const { business, updateBusinessState } = useAuth();
  const [showQuickUpiModal, setShowQuickUpiModal] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [hasDraftRestored, setHasDraftRestored] = useState(false);

  // Customer (essentials)
  const [custSearch, setCustSearch] = useState("");
  const [custFocused, setCustFocused] = useState(false);
  const [custResults, setCustResults] = useState<any[]>([]);
  const [recentCustomers, setRecentCustomers] = useState<any[]>([]);
  const [mitraSuggestions, setMitraSuggestions] = useState<{ name: string; mitraId: string }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custNotice, setCustNotice] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const custBoxRef = useRef<HTMLDivElement>(null);

  // Customer + invoice extras (More options)
  const [showMore, setShowMore] = useState(false);
  const [custAddress, setCustAddress] = useState("");
  const [custPan, setCustPan] = useState("");
  const [custGstin, setCustGstin] = useState("");
  const [custState, setCustState] = useState("");
  const [custMitraId, setCustMitraId] = useState("");
  const [availableGstins, setAvailableGstins] = useState<{ shopName: string; gstin: string }[]>([]);
  const [accountPan, setAccountPan] = useState("");
  const [fetchingPan, setFetchingPan] = useState(false);
  const [panNotice, setPanNotice] = useState<string | null>(null);

  const [invDate, setInvDate] = useState(todayStr());
  const [invDueDate, setInvDueDate] = useState("");
  const [invNotes, setInvNotes] = useState("");
  const [isReverseCharge, setIsReverseCharge] = useState(false);
  const [applicablePercent, setApplicablePercent] = useState("");
  const [isEcommerceSale, setIsEcommerceSale] = useState(false);
  const [ecomGstin, setEcomGstin] = useState("");

  // Items
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<Line[]>(() => [newLine()]);

  // Payment
  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "PAY_LATER">("CASH");
  const [upiQr, setUpiQr] = useState<string | null>(null);
  const [upiReceived, setUpiReceived] = useState<boolean | null>(null);

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [checkingRules, setCheckingRules] = useState(false);
  const [ruleViolations, setRuleViolations] = useState<any[]>([]);
  const [ruleSuccessMsg, setRuleSuccessMsg] = useState("");
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<{ invoice: any; customer: string; missingHsn: number } | null>(null);

  // ---------- draft persistence (sessionStorage) ----------
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("gstmitra_new_bill_draft");
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.custSearch) setCustSearch(draft.custSearch);
        if (draft.selectedCustomerId) setSelectedCustomerId(draft.selectedCustomerId);
        if (draft.custPhone) setCustPhone(draft.custPhone);
        if (draft.custEmail) setCustEmail(draft.custEmail);
        if (draft.custAddress) setCustAddress(draft.custAddress);
        if (draft.custPan) setCustPan(draft.custPan);
        if (draft.custGstin) setCustGstin(draft.custGstin);
        if (draft.custState) setCustState(draft.custState);
        if (draft.custMitraId) setCustMitraId(draft.custMitraId);
        if (Array.isArray(draft.availableGstins)) setAvailableGstins(draft.availableGstins);
        if (draft.invDate) setInvDate(draft.invDate);
        if (draft.invDueDate) setInvDueDate(draft.invDueDate);
        if (draft.invNotes) setInvNotes(draft.invNotes);
        if (draft.isReverseCharge != null) setIsReverseCharge(draft.isReverseCharge);
        if (draft.applicablePercent != null) setApplicablePercent(draft.applicablePercent);
        if (draft.isEcommerceSale != null) setIsEcommerceSale(draft.isEcommerceSale);
        if (draft.ecomGstin) setEcomGstin(draft.ecomGstin);
        if (Array.isArray(draft.lines) && draft.lines.length > 0) setLines(draft.lines);
        if (draft.paymentMode) setPaymentMode(draft.paymentMode);
        if (draft.upiReceived != null) setUpiReceived(draft.upiReceived);
        if (draft.showMore != null) setShowMore(draft.showMore);

        const hasAnyContent = Boolean(
          draft.custSearch ||
          draft.custPhone ||
          draft.custGstin ||
          (draft.lines && draft.lines.some((l: any) => l.name || l.price))
        );
        if (hasAnyContent) {
          setHasDraftRestored(true);
        }
      }
    } catch (e) {
      console.error("Failed to restore draft:", e);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated || created) return;
    const hasAnyContent = Boolean(
      custSearch ||
      custPhone ||
      custEmail ||
      custGstin ||
      custAddress ||
      lines.some((l) => l.name || l.price)
    );
    if (!hasAnyContent) {
      sessionStorage.removeItem("gstmitra_new_bill_draft");
      return;
    }
    const draft = {
      custSearch,
      selectedCustomerId,
      custPhone,
      custEmail,
      custAddress,
      custPan,
      custGstin,
      custState,
      custMitraId,
      availableGstins,
      invDate,
      invDueDate,
      invNotes,
      isReverseCharge,
      applicablePercent,
      isEcommerceSale,
      ecomGstin,
      lines,
      paymentMode,
      upiReceived,
      showMore,
    };
    sessionStorage.setItem("gstmitra_new_bill_draft", JSON.stringify(draft));
  }, [
    draftHydrated,
    created,
    custSearch,
    selectedCustomerId,
    custPhone,
    custEmail,
    custAddress,
    custPan,
    custGstin,
    custState,
    custMitraId,
    availableGstins,
    invDate,
    invDueDate,
    invNotes,
    isReverseCharge,
    applicablePercent,
    isEcommerceSale,
    ecomGstin,
    lines,
    paymentMode,
    upiReceived,
    showMore,
  ]);

  // ---------- data ----------
  useEffect(() => {
    (async () => {
      const { data } = await apiFetch<CatalogItem[]>("/Items");
      if (Array.isArray(data)) setCatalog(data);
    })();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (custBoxRef.current && !custBoxRef.current.contains(e.target as Node)) setCustFocused(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!custFocused || custSearch.trim()) return;
    let active = true;
    (async () => {
      const { data } = await apiFetch<any[]>("/customers/recent?limit=5");
      if (active && Array.isArray(data)) setRecentCustomers(data);
    })();
    return () => {
      active = false;
    };
  }, [custFocused, custSearch]);

  useEffect(() => {
    const q = custSearch.trim();
    if (!q || !custFocused || selectedCustomerId) {
      setCustResults([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await apiFetch<any[]>(`/customers/search?q=${encodeURIComponent(q)}`);
      if (active) setCustResults(Array.isArray(data) ? data : []);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [custSearch, custFocused, selectedCustomerId]);

  // Live Mitra ID suggestions while typing (skips phone-number-only input)
  useEffect(() => {
    const q = custSearch.trim();
    if (!custFocused || selectedCustomerId || q.length < 3 || /^\d+$/.test(q)) {
      setMitraSuggestions([]);
      return;
    }
    let active = true;
    const t = setTimeout(async () => {
      const { data } = await apiFetch<{ name: string; mitraId: string }[]>(
        `/customers/mitra-suggest?q=${encodeURIComponent(q)}`
      );
      if (active) setMitraSuggestions(Array.isArray(data) ? data : []);
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [custSearch, custFocused, selectedCustomerId]);

  // ---------- customer helpers ----------
  const loadGstinChips = async (mitraId: string) => {
    const { data } = await apiFetch<any>(`/customers/lookup-mitra?id=${encodeURIComponent(mitraId)}`);
    if (data?.found && Array.isArray(data.gstins)) {
      setAvailableGstins(data.gstins.filter((g: any) => g.gstin));
    }
  };

  const selectCustomer = (c: any) => {
    setSelectedCustomerId(c.id);
    setCustSearch(c.name || "");
    setCustPhone(c.phone || "");
    setCustEmail(c.email || "");
    setCustAddress(c.address || "");
    setCustGstin(c.gstin || "");
    setCustMitraId(c.mitraId || "");
    setAvailableGstins([]);
    if (c.stateCode) setCustState(c.stateCode);
    setCustFocused(false);
    setCustNotice(null);
    setPanNotice(null);
    if (c.mitraId) loadGstinChips(c.mitraId);

    // If customer has a registered PAN in profile, save it into accountPan
    if (c.pan) {
      setAccountPan(c.pan);
      if (grandTotal >= 200000) {
        setCustPan(c.pan);
        setPanNotice(`✓ Customer PAN (${c.pan}) auto-applied from account for high-value sale.`);
      }
    } else {
      setAccountPan("");
    }

    // If email or PAN is missing, do a background fetch using their phone or mitraId
    const lookupKey = c.mitraId || c.phone;
    if (lookupKey && (!c.email || !c.pan)) {
      apiFetch<any>(`/customers/lookup-mitra?id=${encodeURIComponent(lookupKey)}`).then(({ data }) => {
        if (data && data.found) {
          if (!c.email && data.email) {
            setCustEmail(data.email);
          }
          if (data.pan) {
            setAccountPan(data.pan);
            if (grandTotal >= 200000) {
              setCustPan(data.pan);
              setPanNotice(`✓ Customer PAN (${data.pan}) auto-applied from account for high-value sale.`);
            }
          }
          if (!c.address && data.address) {
            setCustAddress(data.address);
          }
        }
      });
    }
  };

  const lookupMitra = async (raw: string) => {
    const id = raw.trim();
    if (!id) return;
    setLookingUp(true);
    setCustNotice(null);
    setPanNotice(null);
    try {
      const { data } = await apiFetch<any>(`/customers/lookup-mitra?id=${encodeURIComponent(id)}`);
      if (data && data.found) {
        setCustSearch(data.name || "");
        setCustPhone(data.phone || "");
        setCustEmail(data.email || "");
        setCustMitraId(data.source === "USER" ? data.mitraId || "" : "");
        setCustAddress(data.address || "");
        if (data.pan) {
          setAccountPan(data.pan);
          if (grandTotal >= 200000) {
            setCustPan(data.pan);
            setPanNotice(`✓ Customer PAN (${data.pan}) auto-applied from account for high-value sale.`);
          }
        } else {
          setAccountPan("");
        }
        // Store gstins for chips — do NOT auto-fill
        if (Array.isArray(data.gstins) && data.gstins.length > 0) {
          setAvailableGstins(data.gstins.filter((g: any) => g.gstin));
        }
        setSelectedCustomerId(data.customerId || null);
        setCustNotice(
          data.source === "USER" && data.mitraId
            ? `GSTMitra account found for ${data.name}. The invoice can be sent to their Purchases for review.`
            : `Details filled for ${data.name}`
        );
        setCustFocused(false);
      } else {
        setCustNotice("No customer found for that ID. You can enter the details manually.");
      }
    } catch {
      setCustNotice("Lookup failed. Please enter the details manually.");
    } finally {
      setLookingUp(false);
    }
  };

  const fetchPanFromAccount = async () => {
    if (accountPan) {
      setCustPan(accountPan);
      setPanNotice(`✓ Customer PAN (${accountPan}) applied from personal account!`);
      return;
    }
    const target = custMitraId || custPhone || custSearch.trim();
    if (!target) {
      setPanNotice("Please select or enter customer first to fetch PAN.");
      return;
    }
    setFetchingPan(true);
    setPanNotice(null);
    try {
      const { data } = await apiFetch<any>(`/customers/lookup-mitra?id=${encodeURIComponent(target)}`);
      if (data?.found && data.pan) {
        setAccountPan(data.pan);
        setCustPan(data.pan);
        setPanNotice(`✓ Customer PAN (${data.pan}) fetched from personal account!`);
      } else {
        setPanNotice("Customer has not added a PAN card to their personal profile.");
      }
    } catch {
      setPanNotice("Could not fetch customer PAN. Please enter manually.");
    } finally {
      setFetchingPan(false);
    }
  };

  // ---------- totals ----------
  const businessState = business?.stateCode || "";
  const effectiveState = custState || businessState;
  const isIntraState = !businessState || effectiveState === businessState;

  const calc = useMemo(() => {
    return lines.map((l) => {
      const taxable = r2((Number(l.qty) || 0) * (Number(l.price) || 0));
      const gst = Number(l.gstRate) || 0;
      const cess = r2((taxable * (Number(l.cessRate) || 0)) / 100);
      const cgst = isIntraState ? r2((taxable * (gst / 2)) / 100) : 0;
      const sgst = isIntraState ? r2((taxable * (gst / 2)) / 100) : 0;
      const igst = isIntraState ? 0 : r2((taxable * gst) / 100);
      return { taxable, cgst, sgst, igst, cess, total: r2(taxable + cgst + sgst + igst + cess) };
    });
  }, [lines, isIntraState]);

  const subtotal = r2(calc.reduce((a, l) => a + l.taxable, 0));
  const gstTotal = r2(calc.reduce((a, l) => a + l.cgst + l.sgst + l.igst, 0));
  const cessTotal = r2(calc.reduce((a, l) => a + l.cess, 0));
  const grandTotal = Math.round(subtotal + gstTotal + cessTotal);

  const isPanRequired = grandTotal >= 200000;
  useEffect(() => {
    if (isPanRequired) {
      if (accountPan && !custPan) {
        setCustPan(accountPan);
        setPanNotice(`✓ High-value sale (≥ ₹2 Lakh): Auto-applied PAN (${accountPan}) from customer's profile.`);
      }
    }
  }, [isPanRequired, accountPan]);

  // ---------- UPI QR ----------
  const vpa = (business?.upiId || "").trim();
  const hasUpiId = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(vpa);

  useEffect(() => {
    if (paymentMode !== "UPI" || grandTotal <= 0 || !hasUpiId) {
      setUpiQr(null);
      return;
    }
    const payee = business?.tradeName || business?.name || "Merchant";
    const uri =
      `upi://pay?pa=${encodeURIComponent(vpa)}` +
      `&pn=${encodeURIComponent(payee)}` +
      `&am=${grandTotal.toFixed(2)}` +
      `&cu=INR` +
      `&tn=${encodeURIComponent("Bill payment")}`;
    QRCode.toDataURL(uri, { width: 220, margin: 2 }, (err, url) => {
      if (!err && url) setUpiQr(url);
    });
  }, [paymentMode, grandTotal, business, vpa, hasUpiId]);

  // ---------- line helpers ----------
  const updateLine = (uid: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
  const removeLine = (uid: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.uid !== uid) : prev));

  // ---------- submit ----------
  const fail = (msg: string) => {
    setFormError(msg);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCheckRules = async () => {
    setRuleViolations([]);
    setRuleSuccessMsg("");
    setFormError("");

    const valid = lines.filter((l) => l.name.trim() && Number(l.qty) > 0 && Number(l.price) > 0);
    if (valid.length === 0) {
      return fail("Add at least one item before checking GST rules.");
    }

    setCheckingRules(true);
    const gstin = custGstin.trim().toUpperCase();
    const effectiveMode = paymentMode === "UPI" && upiReceived === true ? "CASH" : paymentMode;

    try {
      const res = await apiFetch<any>("/rules/validate-invoice", {
        method: "POST",
        body: JSON.stringify({
          invoice: {
            invoiceDate: invDate,
            placeOfSupply: effectiveState || undefined,
            isReverseCharge,
            buyerGstin: gstin ? normalizeGstin(gstin) : null,
            paymentMode: effectiveMode,
          },
          Items: valid.map((l) => ({
            description: l.name.trim(),
            hsnSacCode: l.hsn || null,
            quantity: Number(l.qty),
            rate: Number(l.price),
            gstRate: l.gstRate,
            cessRate: Number(l.cessRate) || 0,
          })),
          customer: {
            name: custSearch.trim() || undefined,
            gstin: gstin || null,
            stateCode: effectiveState || undefined,
            pan: custPan.trim() || null,
          },
        }),
      });

      if (res.data) {
        if (res.data.violations && res.data.violations.length > 0) {
          setRuleViolations(res.data.violations);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          setRuleSuccessMsg("All bill details match statutory GST rules! No compliance errors found.");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else if (res.error) {
        fail(res.error);
      }
    } catch (e: any) {
      fail(e?.message || "Failed to check rules");
    } finally {
      setCheckingRules(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setRuleViolations([]);
    setRuleSuccessMsg("");

    const name = custSearch.trim();
    if (!name) return fail("Please enter the customer name.");
    if (isPanRequired && !custPan.trim()) {
      setShowMore(true);
      return fail("PAN is mandatory for bills above ₹2,00,000.");
    }
    const gstin = custGstin.trim().toUpperCase();
    if (gstin && !GSTIN_REGEX.test(gstin)) {
      setShowMore(true);
      return fail("Invalid GSTIN. It must be 15 characters, e.g. 27AAAAA0000A1Z5.");
    }

    const valid = lines.filter((l) => l.name.trim() && Number(l.qty) > 0 && Number(l.price) > 0);
    if (valid.length === 0) return fail("Add at least one item with a name, quantity and price.");

    // B2B (GSTIN given) bills must carry HSN. B2C can be completed later.
    if (gstin) {
      const missing = valid.find((l) => !l.hsn);
      if (missing) return fail(`HSN is required for GST-registered customers. Set it for "${missing.name}".`);
    }

    setSubmitting(true);
    try {
      // 1. customer
      let customerId = selectedCustomerId;
      if (!customerId) {
        const { data, error } = await apiFetch<any>("/customers/quick", {
          method: "POST",
          body: JSON.stringify({
            name,
            phone: custPhone.trim() || undefined,
            email: custEmail.trim() || undefined,
            mitraId: custMitraId || undefined,
            gstin: gstin || undefined,
            address: custAddress.trim() || undefined,
            pan: custPan.trim() || undefined,
            stateCode: effectiveState || undefined,
          }),
        });
        if (error || !data) return fail(error || "Could not create the customer.");
        customerId = data.id;
      } else if (custEmail.trim()) {
        const { error } = await apiFetch<unknown>(`/customers/${customerId}`, {
          method: "PUT",
          body: JSON.stringify({ email: custEmail.trim() }),
        });
        if (error) return fail(error);
      }

      // 2. optionally remember new Items in the catalog (best effort)
      const resolved = await Promise.all(
        valid.map(async (l) => {
          if (l.itemId || !l.saveToCatalog) return l;
          const { data } = await apiFetch<CatalogItem>("/Items", {
            method: "POST",
            body: JSON.stringify({
              name: l.name.trim(),
              sellingPrice: Number(l.price),
              gstRate: l.gstRate,
              hsnSacCode: l.hsn || undefined,
              unit: l.unit || "PCS",
              purchasePrice: 0,
            }),
          });
          return data ? { ...l, itemId: data.id } : l;
        })
      );

      // 3. invoice
      const effectiveMode = paymentMode === "UPI" && upiReceived === true ? "CASH" : paymentMode;
      const notes = [invNotes.trim(), custMitraId ? `Mitra ID: ${custMitraId}` : ""].filter(Boolean).join(" | ");

      const res = await apiFetch<any>("/sales/invoices", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          buyerGstin: gstin ? normalizeGstin(gstin) : null,
          paymentMode: effectiveMode,
          invoiceDate: invDate,
          dueDate: invDueDate || null,
          notes: notes || null,
          placeOfSupply: effectiveState || undefined,
          isReverseCharge,
          applicablePercent: applicablePercent === "" ? null : Number(applicablePercent),
          ecomGstin: isEcommerceSale ? ecomGstin : "",
          Items: resolved.map((l) => ({
            itemId: l.itemId || null,
            description: l.name.trim(),
            hsnSacCode: l.hsn || null,
            quantity: Number(l.qty),
            rate: Number(l.price),
            gstRate: l.gstRate,
            cessRate: Number(l.cessRate) || 0,
            unit: l.unit || "PCS",
          })),
        }),
      });

      if (res.ruleViolations && res.ruleViolations.length > 0) {
        setRuleViolations(res.ruleViolations);
        setFormError(res.error || "This bill has GST compliance errors. Please review and correct the highlighted issues below.");
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (res.error || !res.data) return fail(res.error || "Could not create the bill.");
      const inv = res.data;

      sessionStorage.removeItem("gstmitra_new_bill_draft");
      setHasDraftRestored(false);

      setCreated({
        invoice: inv.invoice ?? inv,
        customer: name,
        missingHsn: resolved.filter((l) => !l.hsn).length,
      });
    } catch (err: any) {
      fail(err?.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    sessionStorage.removeItem("gstmitra_new_bill_draft");
    setHasDraftRestored(false);
    setCreated(null);
    setLines([newLine()]);
    setCustSearch("");
    setCustPhone("");
    setCustEmail("");
    setCustAddress("");
    setCustPan("");
    setCustGstin("");
    setCustState("");
    setCustMitraId("");
    setAvailableGstins([]);
    setMitraSuggestions([]);
    setSelectedCustomerId(null);
    setInvDate(todayStr());
    setInvDueDate("");
    setInvNotes("");
    setIsReverseCharge(false);
    setApplicablePercent("");
    setIsEcommerceSale(false);
    setEcomGstin("");
    setPaymentMode("CASH");
    setUpiReceived(null);
    setShowMore(false);
    setCustNotice(null);
  };

  const downloadPdf = async (id: string, num: string) => {
    try {
      const token = localStorage.getItem("gstmitra_token");
      const res = await fetch(`${API_BASE_URL}/sales/invoices/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return alert("Could not download the invoice PDF.");
      const url = window.URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${num}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download the PDF. Please try again.");
    }
  };

  // ================= SUCCESS =================
  if (created) {
    const { invoice, customer, missingHsn } = created;
    const paid = invoice.paymentStatus === "PAID";
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-10">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bill Created Successfully!</h2>
            <p className="font-mono text-xs text-slate-500">#{invoice.invoiceNumber}</p>
          </div>
          <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Customer</span>
              <span className="font-medium text-slate-900">{customer}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total</span>
              <span className="font-semibold text-slate-900">₹{Number(invoice.totalAmount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className={paid ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                {paid ? "Paid" : "To collect"}
              </span>
            </div>
          </div>

          {invoice.recipientDelivery?.status === "MY_BILLS" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left text-xs text-emerald-800">
              Personal B2C bill saved directly to customer&apos;s &ldquo;My Shopping Bills&rdquo; section. You can download or share the PDF.
            </div>
          )}
          {invoice.recipientDelivery?.status === "PENDING_REVIEW" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-left text-xs text-blue-800">
              B2B invoice sent to customer&apos;s GSTMitra Purchases for review and ITC processing. You can also download and share the PDF.
            </div>
          )}
          {invoice.recipientDelivery?.message &&
            invoice.recipientDelivery.status !== "PENDING_REVIEW" &&
            invoice.recipientDelivery.status !== "MY_BILLS" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800">
                {invoice.recipientDelivery.message} You can still download and share the PDF.
              </div>
            )}

          {missingHsn > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {missingHsn} item{missingHsn > 1 ? "s have" : " has"} no HSN yet. Add it from Sales → Edit before
                you file GSTR-1.
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadPdf(invoice.id, invoice.invoiceNumber)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" /> PDF
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" /> Make Another Bill
            </button>
          </div>
          <Link href="/sales" className="inline-block text-xs text-slate-500 hover:text-slate-800">
            Back to Sales Bills
          </Link>
        </div>
      </div>
    );
  }

  // ================= FORM =================
  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const label = "mb-1 block text-xs font-medium text-slate-600";

  return (
    <div className="mx-auto max-w-2xl px-3 pb-6 sm:px-0">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Make Bill</h1>
          <p className="text-xs text-slate-500 mt-0.5">Create official GST Tax Invoice</p>
        </div>
        <Link href="/sales" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Sales Bills
        </Link>
      </div>

      {hasDraftRestored && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
            <span>Restored your unfinished bill draft.</span>
          </div>
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2.5 py-1 text-2xs font-semibold text-blue-700 hover:bg-blue-50 transition"
          >
            <RotateCcw className="h-3 w-3" /> Clear draft
          </button>
        </div>
      )}

      {ruleSuccessMsg && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-semibold text-emerald-900 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <Check className="h-5 w-5 text-emerald-600 shrink-0" />
            <span>{ruleSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setRuleSuccessMsg("")}
            className="text-emerald-500 hover:text-emerald-800 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {ruleViolations.length > 0 && (
        <div className="mb-6 rounded-2xl border-2 border-red-300 bg-red-50/70 p-5 shadow-xs animate-fadeIn">
          <div className="flex items-start justify-between pb-3 border-b border-red-200">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-xs">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-950">
                  GST Compliance Issues Found In This Bill ({ruleViolations.length})
                </h3>
                <p className="text-xs text-red-700 mt-0.5">
                  This bill was checked against official GST statutory rules. The explanation and recommended fix are shown below:
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRuleViolations([])}
              className="text-red-400 hover:text-red-700 p-1 rounded-lg"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 space-y-3.5">
            {ruleViolations.map((v, i) => (
              <div
                key={i}
                className="rounded-xl border border-red-200 bg-white p-4 shadow-2xs space-y-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold uppercase text-2xs ${
                        v.severity === "error"
                          ? "bg-red-100 text-red-800 border border-red-200"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {v.severity === "error" ? "Rule Violation" : "Review Warning"}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{v.ruleName}</span>
                  </div>
                  <span className="font-mono text-3xs text-slate-400 font-semibold">{v.ruleCode}</span>
                </div>

                <div className="text-red-900 font-semibold text-xs leading-relaxed bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                  ⚠️ {v.message}
                </div>

                {v.why && (
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-200 space-y-1">
                    <span className="font-bold text-slate-800 block text-xs">Legal Reason & Explanation:</span>
                    <p className="text-slate-700 leading-relaxed text-xs">{v.why}</p>
                    {v.officialSource && (
                      <p className="text-2xs text-slate-500 pt-1 border-t border-slate-200/60 mt-1">
                        <span className="font-semibold text-slate-600">Official Reference:</span> {v.officialSource}
                      </p>
                    )}
                  </div>
                )}

                {v.howToFix && (
                  <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200 space-y-0.5">
                    <span className="font-bold text-emerald-950 block text-xs">How To Fix:</span>
                    <p className="text-emerald-900 leading-relaxed font-medium text-xs">{v.howToFix}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-slate-900 p-3 text-xs text-white flex items-center justify-between">
            <span>Please correct the highlighted fields in the form above or below, then click &quot;Save &amp; Make Bill&quot; to continue.</span>
          </div>
        </div>
      )}

      {formError && ruleViolations.length === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Customer */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Customer</h2>

          <div ref={custBoxRef} className="relative">
            <label className={label}>Name, phone or Mitra ID</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={custSearch}
                onChange={(e) => {
                  setCustSearch(e.target.value);
                  setSelectedCustomerId(null);
                  setCustMitraId("");
                  setCustEmail("");
                  setCustNotice(null);
                }}
                onFocus={() => setCustFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (custResults.length === 0) lookupMitra(custSearch);
                  }
                }}
                placeholder="Search or type a new customer"
                className={`${field} pl-9 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                aria-label="Scan customer QR"
              >
                <QrCode className="h-4 w-4" />
              </button>
            </div>

            {custFocused && !selectedCustomerId && (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {(custSearch.trim() ? custResults : recentCustomers).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selectCustomer(c)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span>
                      <span className="block font-medium text-slate-900">{c.name}</span>
                      <span className="block text-xs text-slate-500">{c.phone || c.gstin || "No contact"}</span>
                    </span>
                    {Number(c.pendingAmount) > 0 && (
                      <span className="text-xs font-medium text-red-600">
                        owes ₹{Number(c.pendingAmount).toFixed(0)}
                      </span>
                    )}
                  </button>
                ))}

                {/* Live GSTMitra account suggestions while typing a Mitra ID */}
                {mitraSuggestions.length > 0 && (
                  <div className="border-t border-slate-100">
                    <p className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      GSTMitra accounts
                    </p>
                    {mitraSuggestions.map((m) => (
                      <button
                        key={m.mitraId}
                        type="button"
                        onMouseDown={() => lookupMitra(m.mitraId)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                      >
                        <span className="font-medium text-slate-900">{m.name}</span>
                        <span className="text-xs text-blue-700">{m.mitraId}</span>
                      </button>
                    ))}
                  </div>
                )}

                {custSearch.trim() && (
                  <button
                    type="button"
                    onMouseDown={() => lookupMitra(custSearch)}
                    disabled={lookingUp}
                    className="w-full border-t border-slate-100 px-3 py-2 text-left text-xs text-blue-700 hover:bg-blue-50"
                  >
                    {lookingUp ? "Looking up…" : `Look up “${custSearch.trim()}” as Mitra ID`}
                  </button>
                )}
                {!custSearch.trim() && recentCustomers.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">No recent customers yet.</p>
                )}
              </div>
            )}
          </div>

          {custNotice && (
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>{custNotice}</span>
              <button type="button" onClick={() => setCustNotice(null)} aria-label="Dismiss">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div>
            <label className={label}>Phone (optional)</label>
            <input
              type="tel"
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              placeholder="10-digit mobile number"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Email for payment reminders (optional)</label>
            <input
              type="email"
              value={custEmail}
              onChange={(e) => setCustEmail(e.target.value)}
              placeholder="customer@example.com"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Address (optional)</label>
            <input
              type="text"
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              placeholder="Shop / area / street / city"
              className={field}
            />
          </div>

          {/* GSTIN — visible here so B2B is set before adding Items */}
          <div>
            <label className={label}>GSTIN (GST-registered customer only)</label>
            <div className="relative">
              <input
                type="text"
                value={custGstin}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase();
                  setCustGstin(v);
                  if (v.length >= 2 && INDIAN_STATES.some((s) => s.code === v.substring(0, 2))) {
                    setCustState(v.substring(0, 2));
                  }
                }}
                maxLength={15}
                placeholder="27AAAAA0000A1Z5 (leave blank for B2C)"
                className={`${field} font-mono uppercase pr-8 ${
                  custGstin.length === 15
                    ? isValidGstin(custGstin)
                      ? "border-emerald-500 focus:ring-emerald-500"
                      : "border-red-400 focus:ring-red-400"
                    : ""
                }`}
              />
              {custGstin.length === 15 && (
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm">
                  {isValidGstin(custGstin) ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </span>
              )}
            </div>
            {custGstin.length > 0 && custGstin.length < 15 && (
              <p className="mt-1 text-xs text-slate-400">{15 - custGstin.length} more characters needed</p>
            )}
            {custGstin.length === 15 && !isValidGstin(custGstin) && (
              <p className="mt-1 text-xs text-red-600">Invalid GSTIN format</p>
            )}
            {custGstin.length === 15 && isValidGstin(custGstin) && (
              <p className="mt-1 text-xs text-emerald-700">
                Valid GSTIN — this will be a B2B (IGST eligible) invoice
              </p>
            )}
            {/* GSTIN chips from Mitra lookup — tap to use, never auto-filled */}
            {availableGstins.length > 0 && !custGstin && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {availableGstins.map((g) => (
                  <button
                    key={g.gstin}
                    type="button"
                    onClick={() => {
                      const v = normalizeGstin(g.gstin);
                      setCustGstin(v);
                      if (v.length >= 2) setCustState(v.substring(0, 2));
                    }}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-800 hover:border-blue-400 hover:bg-blue-100"
                    title={g.gstin}
                  >
                    GST bill? Use {g.gstin} ({g.shopName})
                  </button>
                ))}
              </div>
            )}

            {/* Dynamic PAN Card — Appears automatically when sale >= ₹2 Lakh OR if customer has PAN */}
            {(isPanRequired || custPan) && (
              <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3.5 space-y-2 animate-fadeIn transition-all">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                    <span>Customer PAN</span>
                    {isPanRequired && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                        Required (Sale ≥ ₹2 Lakh)
                      </span>
                    )}
                  </label>

                  {/* 1-Click Fetch Button */}
                  <button
                    type="button"
                    onClick={fetchPanFromAccount}
                    disabled={fetchingPan}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-white hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition cursor-pointer shadow-2xs disabled:opacity-60"
                    title="Fetch PAN from customer's personal GSTMitra profile"
                  >
                    <Sparkles className="h-3 w-3 text-indigo-600" />
                    <span>
                      {fetchingPan
                        ? "Fetching..."
                        : accountPan
                        ? `Apply Account PAN (${accountPan})`
                        : "1-Click Fetch PAN"}
                    </span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={custPan}
                    onChange={(e) => setCustPan(e.target.value.toUpperCase())}
                    maxLength={10}
                    placeholder="ABCDE1234F"
                    className={`${field} font-mono uppercase bg-white ${
                      isPanRequired && !custPan ? "border-red-400 focus:ring-red-400 ring-1 ring-red-400" : ""
                    }`}
                  />
                  {custPan && (
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>

                {panNotice ? (
                  <p className={`text-[11px] font-medium ${panNotice.startsWith("✓") ? "text-emerald-700" : "text-amber-700"}`}>
                    {panNotice}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {accountPan
                      ? `Customer has registered PAN (${accountPan}) in personal details.`
                      : "Quoting customer's PAN is mandatory for invoices ≥ ₹2,00,000 under Rule 114B."}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Products */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Products</h2>
          {lines.map((l, i) => (
            <ItemRow
              key={l.uid}
              line={l}
              catalog={catalog}
              total={calc[i]?.total ?? 0}
              canRemove={lines.length > 1}
              onChange={(patch) => updateLine(l.uid, patch)}
              onRemove={() => removeLine(l.uid)}
            />
          ))}
          <button
            type="button"
            onClick={() => setLines((p) => [...p, newLine()])}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" /> Add product
          </button>

          <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>GST ({isIntraState ? "CGST + SGST" : "IGST"})</span>
              <span>₹{gstTotal.toFixed(2)}</span>
            </div>
            {cessTotal > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Cess</span>
                <span>₹{cessTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold text-slate-900">
              <span>Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </section>

        {/* Payment */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Payment</h2>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ["CASH", "Cash"],
                ["UPI", "UPI"],
                ["PAY_LATER", "Pay later"],
              ] as const
            ).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPaymentMode(mode)}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                  paymentMode === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          {paymentMode === "CASH" && <p className="text-xs text-slate-500">Will be recorded as paid in full.</p>}
          {paymentMode === "PAY_LATER" && (
            <p className="text-xs text-slate-500">
              Will be saved as unpaid. Set a due date under More options if needed.
            </p>
          )}

          {paymentMode === "UPI" && (
            <div className="space-y-3">
              {!hasUpiId && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-2">
                  <p className="font-medium">
                    Add your shop&apos;s UPI ID to generate a customer payment QR code.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowQuickUpiModal(true)}
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-800 transition"
                    >
                      Quick Add UPI ID
                    </button>
                    <Link
                      href="/settings?returnTo=/new-bill/create"
                      className="text-xs text-amber-800 underline font-medium hover:text-amber-950"
                    >
                      Open in Shop Settings
                    </Link>
                  </div>
                </div>
              )}
              {upiQr ? (
                <div className="mx-auto w-fit rounded-xl border border-slate-200 p-2 text-center">
                  <img src={upiQr} alt="UPI QR" className="h-44 w-44" />
                  <p className="mt-1 text-xs text-slate-500">Scan to pay ₹{grandTotal.toFixed(2)}</p>
                </div>
              ) : (
                <p className="py-4 text-center text-xs text-slate-400">Add Items to show the QR code.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setUpiReceived(true)}
                  className={`rounded-lg border py-2 text-sm font-medium ${
                    upiReceived === true
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Received
                </button>
                <button
                  type="button"
                  onClick={() => setUpiReceived(false)}
                  className={`rounded-lg border py-2 text-sm font-medium ${
                    upiReceived === false
                      ? "border-slate-800 bg-slate-800 text-white"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Not yet
                </button>
              </div>
              <p className="text-center text-xs text-slate-500">
                Payment isn&apos;t verified automatically. Check your UPI app before marking it as received.
              </p>
            </div>
          )}
        </section>

        {/* More options */}
        <section className="rounded-2xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <span>
              <span className="block text-sm font-semibold text-slate-900">More options</span>
              <span className="block text-xs text-slate-500">
                Date, due date, notes, customer state, reverse charge, e-commerce
              </span>
            </span>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${showMore ? "rotate-180" : ""}`} />
          </button>

          {showMore && (
            <div className="space-y-4 border-t border-slate-100 p-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Invoice date</label>
                  <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className={field} />
                </div>
                <div>
                  <label className={label}>Due date</label>
                  <input
                    type="date"
                    value={invDueDate}
                    min={invDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className={field}
                  />
                </div>
              </div>

              <div>
                <label className={label}>Notes</label>
                <textarea
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                  rows={2}
                  className={field}
                />
              </div>

              <div>
                <label className={label}>Customer state (decides CGST+SGST or IGST)</label>
                <select
                  value={effectiveState}
                  onChange={(e) => setCustState(e.target.value)}
                  className={`${field} bg-white`}
                >
                  {!effectiveState && <option value="">Same as my business</option>}
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 border-t border-slate-100 pt-3">
                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={isReverseCharge}
                    onChange={(e) => setIsReverseCharge(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Tax payable on reverse charge
                </label>

                <div>
                  <label className={label}>Applicable % of tax rate</label>
                  <select
                    value={applicablePercent}
                    onChange={(e) => setApplicablePercent(e.target.value)}
                    className={`${field} bg-white`}
                  >
                    <option value="">Not applicable</option>
                    <option value="65">65%</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={isEcommerceSale}
                    onChange={(e) => {
                      setIsEcommerceSale(e.target.checked);
                      if (!e.target.checked) setEcomGstin("");
                    }}
                    className="rounded border-slate-300"
                  />
                  Sold via e-commerce
                </label>
                {isEcommerceSale && (
                  <div>
                    <label className={label}>E-commerce GSTIN</label>
                    <input
                      type="text"
                      value={ecomGstin}
                      onChange={(e) => setEcomGstin(e.target.value.toUpperCase())}
                      maxLength={15}
                      className={`${field} font-mono uppercase`}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        

        {/* Action bar: sticks to the bottom of the form column only */}
        <div className="sticky bottom-3 z-30 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="text-lg font-bold text-slate-900">₹{grandTotal.toFixed(2)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCheckRules}
              disabled={checkingRules || submitting || grandTotal <= 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition"
              title="Check bill details against statutory GST rules before saving"
            >
              {checkingRules ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
              ) : (
                <Check className="h-4 w-4 text-emerald-600" />
              )}
              {checkingRules ? "Checking Rules..." : "Pre-check Rules"}
            </button>
            <button
              type="submit"
              disabled={submitting || grandTotal <= 0}
              className="flex min-w-[170px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {submitting ? "Checking & Creating…" : "Save & Make Bill"}
            </button>
          </div>
        </div>
      </form>

      {/* QR scanner */}
      {showQrModal && (
        <QrScannerModal
          onClose={() => setShowQrModal(false)}
          onResult={(text) => {
            const v = text.trim();
            setShowQrModal(false);
            setCustSearch(v);
            lookupMitra(v);
          }}
        />
      )}

      {/* Quick UPI modal */}
      {showQuickUpiModal && (
        <QuickUpiModal
          currentUpi={business?.upiId || ""}
          onClose={() => setShowQuickUpiModal(false)}
          onSave={(newUpi) => {
            updateBusinessState({ upiId: newUpi });
            setShowQuickUpiModal(false);
          }}
        />
      )}
    </div>
  );
}