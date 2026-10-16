"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, Lock, ShieldCheck, Sparkles, Store } from "lucide-react";
import { type Business, useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { INDIAN_STATES, isValidGstin } from "../lib/states";

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

const BUSINESS_TYPES = [
  { key: "RETAIL", label: "Retail shop" },
  { key: "SERVICES", label: "Services & IT" },
  { key: "WHOLESALE", label: "Wholesale" },
  { key: "FREELANCER", label: "Freelancer" },
  { key: "MANUFACTURING", label: "Manufacturing" },
];

const TURNOVER_RANGES = [
  { key: "BELOW_15L", label: "Below ₹15 lakh" },
  { key: "15L_TO_40L", label: "₹15 lakh – ₹40 lakh" },
  { key: "40L_TO_15CR", label: "₹40 lakh – ₹1.5 crore" },
  { key: "ABOVE_15CR", label: "Above ₹1.5 crore" },
];

const inputBase =
  "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2";
const inputOk = "border-slate-300 focus:border-blue-500 focus:ring-blue-500";
const inputBad = "border-red-400 bg-red-50/40 focus:border-red-400 focus:ring-red-400";
const labelCls = "mb-1.5 block text-xs font-semibold text-slate-700";
const helpCls = "mt-1 text-xs text-slate-500";

// Only allow returning to a page inside this app (blocks links like //evil.com)
function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}

type FormValues = {
  businessName: string;
  tradeName: string;
  businessType: string;
  gstin: string;
  stateCode: string;
  turnoverRange: string;
  filingFrequency: string;
  upiId: string;
};

const toForm = (b: Business): FormValues => ({
  businessName: (b.name || "").trim(),
  tradeName: (b.tradeName || "").trim(),
  businessType: b.businessType || "RETAIL",
  gstin: (b.gstin || "").trim().toUpperCase(),
  stateCode: b.stateCode || "",
  turnoverRange: b.turnoverRange || "40L_TO_15CR",
  filingFrequency: b.filingFrequency || "MONTHLY",
  upiId: (b.upiId || "").trim(),
});

function SettingsContent() {
  const { business, loading } = useAuth();
  const searchParams = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      {returnTo ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-center gap-2 text-sm text-blue-900">
            <Sparkles className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
            <span>Your bill draft is safe. Update your details, then go back to your bill.</span>
          </div>
          <Link
            href={returnTo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to bill in progress
          </Link>
        </div>
      ) : (
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to shop
        </Link>
      )}

      {business ? (
        <SettingsForm key={business.id} business={business} returnTo={returnTo} />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            {loading ? "Loading your shop settings..." : "Complete shop setup to manage your settings."}
          </p>
        </section>
      )}
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-500">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  );
}

function SectionCard({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">{icon}</div>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SettingsForm({ business, returnTo }: { business: Business; returnTo: string | null }) {
  const router = useRouter();
  const { updateBusinessState, refreshContext } = useAuth();

  // baseline = what is saved right now. form = what the user is editing.
  const [baseline, setBaseline] = useState<FormValues>(() => toForm(business));
  const [form, setForm] = useState<FormValues>(() => toForm(business));

  const [gstinTouched, setGstinTouched] = useState(false);
  const [upiTouched, setUpiTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  // Redirect back to the bill after a successful save
  useEffect(() => {
    if (redirectCountdown === null || !returnTo) return;
    if (redirectCountdown <= 0) {
      router.push(returnTo);
      return;
    }
    const timer = setTimeout(() => {
      setRedirectCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [redirectCountdown, returnTo, router]);

  // Open the right section for links like /settings#gst or /settings#upi
  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id) return;
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const update = (patch: Partial<FormValues>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaveError("");
    setSaveSuccess("");
  };

  // ---------- derived values ----------
  const gstin = form.gstin.trim().toUpperCase();
  const gstinValid = gstin.length === 15 && isValidGstin(gstin);
  const gstinError =
    gstin.length === 0 || gstinValid
      ? ""
      : gstin.length < 15
      ? "GSTIN must be exactly 15 characters."
      : "Invalid GSTIN format. Example: 27AAAAA0000A1Z5";
  const showGstinError = Boolean(gstinError) && (gstinTouched || gstin.length === 15);

  // A valid GSTIN decides the state (same rule as onboarding)
  const gstinStateCode = gstinValid ? gstin.substring(0, 2) : "";
  const stateLocked = INDIAN_STATES.some((s) => s.code === gstinStateCode);
  const effectiveState = stateLocked ? gstinStateCode : form.stateCode;

  const upiClean = form.upiId.trim();
  const upiError = upiClean && !UPI_REGEX.test(upiClean) ? "Enter a valid UPI ID, for example name@oksbi." : "";
  const showUpiError = Boolean(upiError) && upiTouched;

  const current: FormValues = {
    businessName: form.businessName.trim(),
    tradeName: form.tradeName.trim(),
    businessType: form.businessType,
    gstin,
    stateCode: effectiveState,
    turnoverRange: form.turnoverRange,
    filingFrequency: form.filingFrequency,
    upiId: upiClean,
  };

  const changedKeys = (Object.keys(current) as (keyof FormValues)[]).filter((k) => current[k] !== baseline[k]);
  const hasChanges = changedKeys.length > 0;
  const stateChanged = changedKeys.includes("stateCode");

  const hasErrors = !current.businessName || !current.stateCode || Boolean(gstinError) || Boolean(upiError);
  const canSave = hasChanges && !hasErrors && !saving;

  // ---------- save ----------
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setGstinTouched(true);
    setUpiTouched(true);
    setSaveError("");
    setSaveSuccess("");

    if (!hasChanges || hasErrors) return;

    // Send only what changed. Empty optional fields are sent as null so they can be removed.
    const payload: Record<string, string | null> = {};
    changedKeys.forEach((k) => {
      const v = current[k];
      payload[k] = (k === "tradeName" || k === "gstin" || k === "upiId") && v === "" ? null : v;
    });

    setSaving(true);
    const { data, error } = await apiFetch<{ message?: string; business?: Partial<Business> }>("/auth/business", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setSaving(false);

    if (error) {
      setSaveError(error);
      return;
    }

    updateBusinessState(
      data?.business ?? {
        name: current.businessName,
        tradeName: current.tradeName || undefined,
        businessType: current.businessType,
        gstin: current.gstin || undefined,
        stateCode: current.stateCode,
        turnoverRange: current.turnoverRange,
        filingFrequency: current.filingFrequency,
        upiId: current.upiId || undefined,
      }
    );
    refreshContext(); // refreshes things like state name from the server

    setBaseline(current);
    setForm(current);

    if (returnTo) {
      setSaveSuccess("Saved! Taking you back to your bill...");
      setRedirectCountdown(1);
    } else {
      setSaveSuccess("Saved.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="pb-1">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Change your shop details anytime. Press Save when you are done.</p>
      </div>

      {/* ---------------- Shop details ---------------- */}
      <SectionCard
        id="shop"
        icon={<Store className="h-5 w-5" aria-hidden="true" />}
        title="Shop details"
        subtitle="Shown on your invoices."
      >
        <div>
          <label htmlFor="businessName" className={labelCls}>
            Shop / business name <span className="text-red-500">*</span>
          </label>
          <input
            id="businessName"
            type="text"
            value={form.businessName}
            onChange={(e) => update({ businessName: e.target.value })}
            placeholder="e.g. Ramesh Kirana Store"
            autoComplete="organization"
            className={`${inputBase} ${inputOk}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tradeName" className={labelCls}>
              Trade name <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="tradeName"
              type="text"
              value={form.tradeName}
              onChange={(e) => update({ tradeName: e.target.value })}
              placeholder="e.g. Ramesh Electronics"
              className={`${inputBase} ${inputOk}`}
            />
          </div>
          <div>
            <label htmlFor="businessType" className={labelCls}>
              What do you do?
            </label>
            <select
              id="businessType"
              value={form.businessType}
              onChange={(e) => update({ businessType: e.target.value })}
              className={`${inputBase} ${inputOk}`}
            >
              {BUSINESS_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {/* ---------------- GST details ---------------- */}
      <SectionCard
        id="gst"
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
        title="GST details"
        subtitle="Used for tax calculation and filing."
      >
        <div>
          <label htmlFor="gstin" className={labelCls}>
            GSTIN <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="gstin"
            type="text"
            value={form.gstin}
            onChange={(e) => update({ gstin: e.target.value.toUpperCase() })}
            onBlur={() => setGstinTouched(true)}
            maxLength={15}
            placeholder="27AAAAA0000A1Z5"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={showGstinError}
            className={`${inputBase} font-mono uppercase tracking-wider ${
              showGstinError
                ? inputBad
                : gstinValid
                ? "border-emerald-500 bg-emerald-50/30 focus:ring-emerald-400"
                : inputOk
            }`}
          />
          {showGstinError ? (
            <p className="mt-1 text-xs font-medium text-red-600">{gstinError}</p>
          ) : gstinValid ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Valid GSTIN. State is taken from it.
            </p>
          ) : (
            <p className={helpCls}>Not registered yet? Leave this empty.</p>
          )}
        </div>

        <div>
          <label htmlFor="stateCode" className={labelCls}>
            State <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              id="stateCode"
              value={effectiveState}
              onChange={(e) => update({ stateCode: e.target.value })}
              disabled={stateLocked}
              className={`${inputBase} ${inputOk} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-700`}
            >
              <option value="" disabled>
                Select your state
              </option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            {stateLocked && (
              <Lock
                className="pointer-events-none absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
            )}
          </div>
          <p className={helpCls}>
            {stateLocked ? "Taken from your GSTIN." : "Decides CGST + SGST or IGST on every sale."}
          </p>
          {stateChanged && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
              Old invoices will not change. Only new invoices will use the new state.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="turnoverRange" className={labelCls}>
              Yearly turnover
            </label>
            <select
              id="turnoverRange"
              value={form.turnoverRange}
              onChange={(e) => update({ turnoverRange: e.target.value })}
              className={`${inputBase} ${inputOk}`}
            >
              {TURNOVER_RANGES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span id="freq-label" className={labelCls}>
              How do you file GST returns?
            </span>
            <div
              role="group"
              aria-labelledby="freq-label"
              className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
            >
              {(
                [
                  ["MONTHLY", "Every month"],
                  ["QUARTERLY", "Every quarter"],
                ] as const
              ).map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={form.filingFrequency === key}
                  onClick={() => update({ filingFrequency: key })}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    form.filingFrequency === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>
            <p className={helpCls}>Quarterly means the QRMP scheme.</p>
          </div>
        </div>
      </SectionCard>

      {/* ---------------- Payments ---------------- */}
      <SectionCard
        id="upi"
        icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
        title="Payments"
        subtitle="Used for the payment QR on your bills."
      >
        <div>
          <label htmlFor="upiId" className={labelCls}>
            UPI ID <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="upiId"
            type="text"
            value={form.upiId}
            onChange={(e) => update({ upiId: e.target.value })}
            onBlur={() => setUpiTouched(true)}
            placeholder="e.g. name@oksbi"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={showUpiError}
            className={`${inputBase} ${showUpiError ? inputBad : inputOk}`}
          />
          {showUpiError ? (
            <p className="mt-1 text-xs font-medium text-red-600">{upiError}</p>
          ) : (
            <p className={helpCls}>
              Customers can scan the QR on a bill to pay this ID. Clear the box and save to remove it.
            </p>
          )}
        </div>
      </SectionCard>

      {saveError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {saveError}
        </p>
      )}

      {/* Save bar */}
      <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
        <div className="min-w-0 text-sm" role="status">
          {saveSuccess ? (
            <span className="flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {saveSuccess}
            </span>
          ) : hasChanges ? (
            <span className="font-medium text-amber-700">You have unsaved changes</span>
          ) : (
            <span className="text-slate-500">All changes saved</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {returnTo && (
            <Link
              href={returnTo}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to bill
            </Link>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="flex min-w-[130px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </button>
        </div>
      </div>
    </form>
  );
}