"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { CheckCircle2, ArrowRight, Building, ShieldCheck, Sparkles, HelpCircle } from "lucide-react";
import { Tooltip } from "../components/Tooltip";

const INDIAN_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "19", name: "West Bengal" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, business, updateBusinessState } = useAuth();

  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [businessType, setBusinessType] = useState("RETAIL");
  const [stateCode, setStateCode] = useState("27");
  const [turnoverRange, setTurnoverRange] = useState("40L_TO_15CR");
  const [filingFrequency, setFilingFrequency] = useState("MONTHLY");
  const [gstin, setGstin] = useState("");

  const [gstinError, setGstinError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (business) {
      if (business.name) setBusinessName(business.name);
      if (business.tradeName) setTradeName(business.tradeName);
      if (business.stateCode) setStateCode(business.stateCode);
      if (business.gstin) setGstin(business.gstin);
      if (business.businessType) setBusinessType(business.businessType);
      if (business.turnoverRange) setTurnoverRange(business.turnoverRange);
      if (business.filingFrequency) setFilingFrequency(business.filingFrequency);
    }
  }, [business]);

  const validateGstinFormat = (val: string) => {
    if (!val || val.trim() === "") {
      setGstinError("");
      return true;
    }
    const clean = val.trim().toUpperCase();
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (clean.length !== 15) {
      setGstinError("GSTIN must be exactly 15 characters.");
      return false;
    }
    if (!regex.test(clean)) {
      setGstinError("Invalid GSTIN format. Example: 27AAAAA0000A1Z5");
      return false;
    }
    const extractedState = clean.substring(0, 2);
    setStateCode(extractedState);
    setGstinError("");
    return true;
  };

  const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setGstin(val);
    validateGstinFormat(val);
  };

  const handleCompleteOnboarding = async () => {
    if (gstin && gstin.trim() !== "") {
      if (!validateGstinFormat(gstin)) {
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg("");

    const { data, error } = await apiFetch<{ business: any }>("/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({
        businessName,
        tradeName,
        businessType,
        stateCode,
        turnoverRange,
        filingFrequency,
        gstin,
      }),
    });

    setSubmitting(false);

    if (error) {
      setErrorMsg(error);
      return;
    }

    if (data?.business) {
      updateBusinessState(data.business);
      router.push("/");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Progress Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 sm:p-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider bg-blue-500/30 text-blue-200 px-3 py-1 rounded-full border border-blue-400/30">
              Step {step} of 3 • Quick Setup
            </span>
            <span className="text-xs text-blue-200 font-medium">Plain Words Guidance</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold">Set up your business for GST</h1>
          <p className="text-blue-100 text-sm mt-1">
            Answer 3 quick questions so GSTMitra shows only the features relevant to your business.
          </p>

          {/* Steps Indicator */}
          <div className="flex items-center gap-2 mt-6">
            <div className={`h-2 flex-1 rounded-full transition-all ${step >= 1 ? "bg-white" : "bg-blue-900/50"}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all ${step >= 2 ? "bg-white" : "bg-blue-900/50"}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all ${step >= 3 ? "bg-white" : "bg-blue-900/50"}`}></div>
          </div>
        </div>

        {/* Content Box */}
        <div className="p-6 sm:p-8 space-y-6">
          {errorMsg && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
              {errorMsg}
            </div>
          )}

          {/* Step 1: Business Profile & Type */}
          {step === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Building className="w-5 h-5 text-blue-600" />
                  What is your business name and type?
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  This will appear on your invoices and GST return summaries.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Legal Business Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Ramesh Traders or Apex Tech Solutions"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trade Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="e.g. Ramesh Electronics Shop"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Business Activity
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { key: "RETAIL", label: "Retail Shop", desc: "Selling goods directly to customers" },
                      { key: "SERVICES", label: "Services & IT", desc: "Software, consulting, freelancing" },
                      { key: "WHOLESALE", label: "Wholesale", desc: "B2B bulk supply to traders" },
                      { key: "FREELANCER", label: "Freelancer", desc: "Solo professional or consultant" },
                      { key: "MANUFACTURING", label: "Manufacturing", desc: "Making products & goods" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setBusinessType(item.key)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          businessType === item.key
                            ? "border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 font-semibold"
                            : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
                        }`}
                      >
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className="text-3xs text-slate-500 mt-0.5 leading-tight">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!businessName.trim()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  <span>Next: State & Turnover</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: State & Turnover Range */}
          {step === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  State & Annual Turnover
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  GST rules (CGST+SGST vs IGST) are automatically determined by your home state code.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    State where business is registered
                  </label>
                  <select
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} (Code {s.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estimated Annual Turnover
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { key: "BELOW_15L", label: "Below ₹15 Lakhs", desc: "Exempt or small seller" },
                      { key: "15L_TO_40L", label: "₹15 Lakhs – ₹40 Lakhs", desc: "Near registration limit" },
                      { key: "40L_TO_15CR", label: "₹40 Lakhs – ₹1.5 Crore", desc: "Standard small business" },
                      { key: "ABOVE_15CR", label: "Above ₹1.5 Crore", desc: "Regular monthly GST filer" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setTurnoverRange(item.key)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          turnoverRange === item.key
                            ? "border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 font-semibold"
                            : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
                        }`}
                      >
                        <div className="text-xs font-bold">{item.label}</div>
                        <div className="text-3xs text-slate-500 mt-0.5">{item.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GST Return Filing Frequency
                  </label>
                  <div className="flex gap-4">
                    <label className={`flex-1 p-3 rounded-xl border cursor-pointer text-xs font-medium transition-all ${filingFrequency === "MONTHLY" ? "border-blue-600 bg-blue-50 text-blue-900 font-bold" : "border-slate-200"}`}>
                      <input
                        type="radio"
                        name="frequency"
                        value="MONTHLY"
                        checked={filingFrequency === "MONTHLY"}
                        onChange={() => setFilingFrequency("MONTHLY")}
                        className="mr-2"
                      />
                      Monthly Filer (Standard)
                    </label>
                    <label className={`flex-1 p-3 rounded-xl border cursor-pointer text-xs font-medium transition-all ${filingFrequency === "QUARTERLY" ? "border-blue-600 bg-blue-50 text-blue-900 font-bold" : "border-slate-200"}`}>
                      <input
                        type="radio"
                        name="frequency"
                        value="QUARTERLY"
                        checked={filingFrequency === "QUARTERLY"}
                        onChange={() => setFilingFrequency("QUARTERLY")}
                        className="mr-2"
                      />
                      Quarterly Filer (QRMP Scheme)
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium px-4 py-2"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-md transition-all"
                >
                  <span>Next: GSTIN Number</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: GSTIN & Registration */}
          {step === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  Your 15-digit GSTIN (If registered)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  If you are already registered on gst.gov.in, enter your GSTIN below. If not registered yet, leave blank.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      15-Character GSTIN Number
                    </label>
                    <Tooltip
                      term="What is GSTIN?"
                      text="GSTIN is your unique 15-digit Goods and Services Tax Identification Number issued by the government."
                      example="27AAAAA0000A1Z5"
                    />
                  </div>
                  <input
                    type="text"
                    value={gstin}
                    onChange={handleGstinChange}
                    maxLength={15}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    className={`w-full px-3.5 py-2.5 border rounded-xl text-sm font-mono uppercase tracking-wider focus:ring-2 focus:outline-none ${
                      gstinError
                        ? "border-red-500 focus:ring-red-400 bg-red-50/30"
                        : gstin.length === 15
                        ? "border-emerald-500 focus:ring-emerald-400 bg-emerald-50/20"
                        : "border-slate-300 focus:ring-blue-500"
                    }`}
                  />

                  {gstinError ? (
                    <p className="text-xs text-red-600 font-medium mt-1">{gstinError}</p>
                  ) : gstin.length === 15 ? (
                    <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Valid GSTIN format detected for State Code {gstin.substring(0, 2)}!
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">
                      Leave empty if you haven't registered for GST yet.
                    </p>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs space-y-1.5 text-blue-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    Customized Experience Ready
                  </p>
                  <p className="text-blue-800 text-3xs leading-relaxed">
                    Based on your answers, GSTMitra will automatically calculate CGST+SGST vs IGST for your sales, flag ineligible ITC on purchases, and generate GSTR-1, GSTR-3B and GSTR-2B Books reports!
                  </p>
                </div>
              </div>

              <div className="pt-4 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium px-4 py-2"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCompleteOnboarding}
                  disabled={submitting || Boolean(gstinError)}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-7 py-3 rounded-xl shadow-lg transition-all disabled:opacity-50"
                >
                  {submitting ? "Setting up..." : "Complete Setup & Launch Dashboard"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
