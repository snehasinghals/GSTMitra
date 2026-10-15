"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CreditCard, Sparkles } from "lucide-react";
import { type Business, useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";

const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

function SettingsContent() {
  const { business, loading } = useAuth();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      {returnTo ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
          <div className="flex items-center gap-2 text-sm text-blue-900">
            <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
            <span>Adding UPI ID for your bill. Your bill draft is safely preserved.</span>
          </div>
          <Link
            href={returnTo}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to bill in progress
          </Link>
        </div>
      ) : (
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to shop
        </Link>
      )}

      {business ? (
        <UpiSettingsForm key={business.id} business={business} returnTo={returnTo} />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            {loading
              ? "Loading your business settings..."
              : "Complete shop setup before adding a UPI ID for payment QR codes."}
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

function UpiSettingsForm({ business, returnTo }: { business: Business; returnTo: string | null }) {
  const router = useRouter();
  const { updateBusinessState } = useAuth();
  const [upiId, setUpiId] = useState(business.upiId || "");
  const [upiIdError, setUpiIdError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

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

  const handleSaveUpiId = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUpiIdError("");
    setSaveError("");
    setSaveSuccess("");

    const cleanUpiId = upiId.trim();
    if (!UPI_REGEX.test(cleanUpiId)) {
      setUpiIdError("Enter a valid UPI ID, for example name@oksbi.");
      return;
    }

    setSaving(true);
    const { data, error } = await apiFetch<{ message: string; business: { id: string; upiId: string } }>(
      "/auth/business/upi",
      {
        method: "PATCH",
        body: JSON.stringify({ upiId: cleanUpiId }),
      }
    );
    setSaving(false);

    if (error) {
      setSaveError(error);
      return;
    }

    if (data?.business) {
      updateBusinessState(data.business);
      setUpiId(data.business.upiId);

      if (returnTo) {
        setSaveSuccess("UPI ID saved! Redirecting back to your bill...");
        setRedirectCountdown(1);
      } else {
        setSaveSuccess("UPI ID saved. New Invoices can now show a payment QR.");
      }
    } else {
      setSaveError("Could not save the UPI ID. Please try again.");
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
          <CreditCard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">Manage the UPI ID used for bill payment QR codes.</p>
        </div>
      </div>

      <form onSubmit={handleSaveUpiId} className="space-y-4">
        <div>
          <label htmlFor="upi-id" className="mb-1 block text-sm font-semibold text-slate-700">
            UPI ID
          </label>
          <input
            id="upi-id"
            type="text"
            value={upiId}
            onChange={(event) => {
              setUpiId(event.target.value);
              setUpiIdError("");
              setSaveError("");
              setSaveSuccess("");
            }}
            placeholder="e.g. name@oksbi"
            autoComplete="off"
            aria-invalid={Boolean(upiIdError)}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 ${
              upiIdError
                ? "border-red-500 bg-red-50/30 focus:ring-red-400"
                : "border-slate-300 focus:ring-blue-500"
            }`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Customers can scan the QR on a bill to start a UPI payment to this ID.
          </p>
          {upiIdError && <p className="mt-1 text-xs font-medium text-red-600">{upiIdError}</p>}
        </div>

        {saveError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </p>
        )}
        {saveSuccess && (
          <div className="space-y-2">
            <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {saveSuccess}
            </p>
            {returnTo && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => router.push(returnTo)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Return to bill now
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save UPI ID"}
          </button>
          {returnTo && (
            <Link
              href={returnTo}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel & return to bill
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
