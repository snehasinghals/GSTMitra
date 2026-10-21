// "use client";

// import React, { useState, useEffect } from "react";
// import { useRouter } from "next/navigation";
// import Link from "next/link";
// import { useAuth } from "../context/AuthContext";
// import { apiFetch } from "../lib/api";
// import { CheckCircle2, ArrowRight, Building, ShieldCheck, Sparkles, HelpCircle } from "lucide-react";
// import { Tooltip } from "../components/Tooltip";

// const INDIAN_STATES = [
//   { code: "01", name: "Jammu and Kashmir" },
//   { code: "02", name: "Himachal Pradesh" },
//   { code: "03", name: "Punjab" },
//   { code: "04", name: "Chandigarh" },
//   { code: "05", name: "Uttarakhand" },
//   { code: "06", name: "Haryana" },
//   { code: "07", name: "Delhi" },
//   { code: "08", name: "Rajasthan" },
//   { code: "09", name: "Uttar Pradesh" },
//   { code: "10", name: "Bihar" },
//   { code: "19", name: "West Bengal" },
//   { code: "27", name: "Maharashtra" },
//   { code: "29", name: "Karnataka" },
//   { code: "33", name: "Tamil Nadu" },
//   { code: "36", name: "Telangana" },
//   { code: "37", name: "Andhra Pradesh" },
// ];

// const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

// export default function OnboardingPage() {
//   const router = useRouter();
//   const { user, business, updateBusinessState, refreshContext, loading } = useAuth();

//   const [step, setStep] = useState(1);
//   const [businessName, setBusinessName] = useState("");
//   const [tradeName, setTradeName] = useState("");
//   const [businessType, setBusinessType] = useState("RETAIL");
//   const [stateCode, setStateCode] = useState("27");
//   const [turnoverRange, setTurnoverRange] = useState("40L_TO_15CR");
//   const [filingFrequency, setFilingFrequency] = useState("MONTHLY");
//   const [gstin, setGstin] = useState("");
//   const [upiId, setUpiId] = useState("");

//   const [gstinError, setGstinError] = useState("");
//   const [upiIdError, setUpiIdError] = useState("");
//   const [submitting, setSubmitting] = useState(false);
//   const [errorMsg, setErrorMsg] = useState("");

//   // Rule 4: If a user with isOnboarded = true opens /onboarding, redirect them to Shop Dashboard
//   useEffect(() => {
//     if (!loading && business?.isOnboarded) {
//       router.replace("/");
//     }
//   }, [loading, business, router]);

//   // Rule 2: business name field must start EMPTY and be required.
//   // Only pre-fill the name when isOnboarded is already true (editing existing shop).
//   // Never show placeholder names like "<name>'s Business" in the field.
//   useEffect(() => {
//     if (business) {
//       if (business.isOnboarded && business.name && !business.name.endsWith("'s Business")) {
//         setBusinessName(business.name);
//       }
//       if (business.tradeName) setTradeName(business.tradeName);
//       if (business.stateCode) setStateCode(business.stateCode);
//       if (business.gstin) setGstin(business.gstin);
//       if (business.businessType) setBusinessType(business.businessType);
//       if (business.turnoverRange) setTurnoverRange(business.turnoverRange);
//       if (business.filingFrequency) setFilingFrequency(business.filingFrequency);
//       if (business.upiId) setUpiId(business.upiId);
//     }
//   }, [business]);

//   const validateGstinFormat = (val: string) => {
//     if (!val || val.trim() === "") {
//       setGstinError("");
//       return true;
//     }
//     const clean = val.trim().toUpperCase();
//     const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
//     if (clean.length !== 15) {
//       setGstinError("GSTIN must be exactly 15 characters.");
//       return false;
//     }
//     if (!regex.test(clean)) {
//       setGstinError("Invalid GSTIN format. Example: 27AAAAA0000A1Z5");
//       return false;
//     }
//     const extractedState = clean.substring(0, 2);
//     setStateCode(extractedState);
//     setGstinError("");
//     return true;
//   };

//   const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     const val = e.target.value.toUpperCase();
//     setGstin(val);
//     validateGstinFormat(val);
//   };

//   const handleCompleteOnboarding = async () => {
//     if (gstin && gstin.trim() !== "") {
//       if (!validateGstinFormat(gstin)) {
//         return;
//       }
//     }

//     const cleanUpiId = upiId.trim();
//     if (cleanUpiId && !UPI_REGEX.test(cleanUpiId)) {
//       setUpiIdError("Enter a valid UPI ID, for example name@oksbi.");
//       return;
//     }
//     setUpiIdError("");

//     setSubmitting(true);
//     setErrorMsg("");

//     const { data, error } = await apiFetch<{ business: any }>("/auth/onboarding", {
//       method: "POST",
//       body: JSON.stringify({
//         businessName: businessName.trim(),
//         tradeName: tradeName.trim() || undefined,
//         businessType,
//         stateCode,
//         turnoverRange,
//         filingFrequency,
//         gstin: gstin.trim() || undefined,
//         upiId: cleanUpiId || undefined,
//       }),
//     });

//     setSubmitting(false);

//     if (error) {
//       setErrorMsg(error);
//       return;
//     }

//     if (data?.business) {
//       if (typeof window !== "undefined") {
//         sessionStorage.setItem("justOnboarded", "1");
//       }
//       updateBusinessState(data.business);
//       await refreshContext();
//       router.push("/?justOnboarded=1");
//     }
//   };

//   return (
//     <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-3 sm:p-6 bg-slate-100">
//       <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
//         {/* Progress Header */}
//         <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5 sm:p-8">
//           <div className="flex items-center justify-between mb-3">
//             <span className="text-xs font-semibold uppercase tracking-wider bg-blue-500/30 text-blue-200 px-3 py-1 rounded-full border border-blue-400/30">
//               Step {step} of 3 • Quick Setup
//             </span>
//             <span className="text-xs text-blue-200 font-medium hidden sm:inline">Plain Words Guidance</span>
//           </div>

//           <h1 className="text-xl sm:text-3xl font-extrabold">Start your shop on GSTMitra</h1>
//           <p className="text-blue-100 text-xs sm:text-sm mt-1">
//             Answer 3 quick questions so GSTMitra shows only the features relevant to your shop.
//           </p>

//           {/* Steps Indicator */}
//           <div className="flex items-center gap-2 mt-5 sm:mt-6">
//             <div className={`h-2 flex-1 rounded-full transition-all ${step >= 1 ? "bg-white" : "bg-blue-900/50"}`}></div>
//             <div className={`h-2 flex-1 rounded-full transition-all ${step >= 2 ? "bg-white" : "bg-blue-900/50"}`}></div>
//             <div className={`h-2 flex-1 rounded-full transition-all ${step >= 3 ? "bg-white" : "bg-blue-900/50"}`}></div>
//           </div>
//         </div>

//         {/* Content Box */}
//         <div className="p-6 sm:p-8 space-y-6">
//           {errorMsg && (
//             <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
//               {errorMsg}
//             </div>
//           )}

//           {/* Step 1: Business Profile & Type */}
//           {step === 1 && (
//             <div className="space-y-6 animate-fadeIn">
//               <div>
//                 <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
//                   <Building className="w-5 h-5 text-blue-600" />
//                   What is your business name and type?
//                 </h2>
//                 <p className="text-xs text-slate-500 mt-0.5">
//                   This will appear on your invoices and GST return summaries.
//                 </p>
//               </div>

//               <div className="space-y-4">
//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     Shop / Business Name <span className="text-red-500">*</span>
//                   </label>
//                   <input
//                     type="text"
//                     value={businessName}
//                     onChange={(e) => setBusinessName(e.target.value)}
//                     placeholder="e.g. Ramesh Kirana Store, Priya Electronics"
//                     className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
//                     required
//                   />
//                 </div>

//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     Trade Name (Optional)
//                   </label>
//                   <input
//                     type="text"
//                     value={tradeName}
//                     onChange={(e) => setTradeName(e.target.value)}
//                     placeholder="e.g. Ramesh Electronics Shop"
//                     className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
//                   />
//                 </div>

//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     Primary Business Activity
//                   </label>
//                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
//                     {[
//                       { key: "RETAIL", label: "Retail Shop", desc: "Selling goods directly to customers" },
//                       { key: "SERVICES", label: "Services & IT", desc: "Software, consulting, freelancing" },
//                       { key: "WHOLESALE", label: "Wholesale", desc: "B2B bulk supply to traders" },
//                       { key: "FREELANCER", label: "Freelancer", desc: "Solo professional or consultant" },
//                       { key: "MANUFACTURING", label: "Manufacturing", desc: "Making products & goods" },
//                     ].map((item) => (
//                       <button
//                         key={item.key}
//                         type="button"
//                         onClick={() => setBusinessType(item.key)}
//                         className={`p-3 rounded-xl border text-left transition-all ${
//                           businessType === item.key
//                             ? "border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 font-semibold"
//                             : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
//                         }`}
//                       >
//                         <div className="text-xs font-bold">{item.label}</div>
//                         <div className="text-3xs text-slate-500 mt-0.5 leading-tight">{item.desc}</div>
//                       </button>
//                     ))}
//                   </div>
//                 </div>
//               </div>

//               <div className="pt-4 flex items-center justify-between">
//                 <Link
//                   href="/home"
//                   className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 transition-colors"
//                 >
//                   Not now
//                 </Link>
//                 <button
//                   type="button"
//                   onClick={() => setStep(2)}
//                   disabled={!businessName.trim()}
//                   className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
//                 >
//                   <span>Next: State & Turnover</span>
//                   <ArrowRight className="w-4 h-4" />
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* Step 2: State & Turnover Range */}
//           {step === 2 && (
//             <div className="space-y-6 animate-fadeIn">
//               <div>
//                 <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
//                   <ShieldCheck className="w-5 h-5 text-blue-600" />
//                   State & Annual Turnover
//                 </h2>
//                 <p className="text-xs text-slate-500 mt-0.5">
//                   GST rules (CGST+SGST vs IGST) are automatically determined by your home state code.
//                 </p>
//               </div>

//               <div className="space-y-4">
//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     State where business is registered
//                   </label>
//                   <select
//                     value={stateCode}
//                     onChange={(e) => setStateCode(e.target.value)}
//                     className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
//                   >
//                     {INDIAN_STATES.map((s) => (
//                       <option key={s.code} value={s.code}>
//                         {s.name} (Code {s.code})
//                       </option>
//                     ))}
//                   </select>
//                 </div>

//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     Estimated Annual Turnover
//                   </label>
//                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
//                     {[
//                       { key: "BELOW_15L", label: "Below ₹15 Lakhs", desc: "Exempt or small seller" },
//                       { key: "15L_TO_40L", label: "₹15 Lakhs – ₹40 Lakhs", desc: "Near registration limit" },
//                       { key: "40L_TO_15CR", label: "₹40 Lakhs – ₹1.5 Crore", desc: "Standard small business" },
//                       { key: "ABOVE_15CR", label: "Above ₹1.5 Crore", desc: "Regular monthly GST filer" },
//                     ].map((item) => (
//                       <button
//                         key={item.key}
//                         type="button"
//                         onClick={() => setTurnoverRange(item.key)}
//                         className={`p-3 rounded-xl border text-left transition-all ${
//                           turnoverRange === item.key
//                             ? "border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-500/20 font-semibold"
//                             : "border-slate-200 hover:border-slate-300 text-slate-700 bg-white"
//                         }`}
//                       >
//                         <div className="text-xs font-bold">{item.label}</div>
//                         <div className="text-3xs text-slate-500 mt-0.5">{item.desc}</div>
//                       </button>
//                     ))}
//                   </div>
//                 </div>

//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     GST Return Filing Frequency
//                   </label>
//                   <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4">
//                     <label className={`flex-1 p-3 rounded-xl border cursor-pointer text-xs font-medium transition-all ${filingFrequency === "MONTHLY" ? "border-blue-600 bg-blue-50 text-blue-900 font-bold" : "border-slate-200"}`}>
//                       <input
//                         type="radio"
//                         name="frequency"
//                         value="MONTHLY"
//                         checked={filingFrequency === "MONTHLY"}
//                         onChange={() => setFilingFrequency("MONTHLY")}
//                         className="mr-2"
//                       />
//                       Monthly Filer (Standard)
//                     </label>
//                     <label className={`flex-1 p-3 rounded-xl border cursor-pointer text-xs font-medium transition-all ${filingFrequency === "QUARTERLY" ? "border-blue-600 bg-blue-50 text-blue-900 font-bold" : "border-slate-200"}`}>
//                       <input
//                         type="radio"
//                         name="frequency"
//                         value="QUARTERLY"
//                         checked={filingFrequency === "QUARTERLY"}
//                         onChange={() => setFilingFrequency("QUARTERLY")}
//                         className="mr-2"
//                       />
//                       Quarterly Filer (QRMP Scheme)
//                     </label>
//                   </div>
//                 </div>
//               </div>

//               <div className="pt-4 flex items-center justify-between">
//                 <button
//                   type="button"
//                   onClick={() => setStep(1)}
//                   className="text-xs text-slate-600 hover:text-slate-900 font-medium px-4 py-2"
//                 >
//                   Back
//                 </button>
//                 <button
//                   type="button"
//                   onClick={() => setStep(3)}
//                   className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-md transition-all"
//                 >
//                   <span>Next: GSTIN Number</span>
//                   <ArrowRight className="w-4 h-4" />
//                 </button>
//               </div>
//             </div>
//           )}

//           {/* Step 3: GSTIN & Registration */}
//           {step === 3 && (
//             <div className="space-y-6 animate-fadeIn">
//               <div>
//                 <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
//                   <Sparkles className="w-5 h-5 text-blue-600" />
//                   Your 15-digit GSTIN (If registered)
//                 </h2>
//                 <p className="text-xs text-slate-500 mt-0.5">
//                   If you are already registered on gst.gov.in, enter your GSTIN below. If not registered yet, leave blank.
//                 </p>
//               </div>

//               <div className="space-y-4">
//                 <div>
//                   <label className="block text-xs font-semibold text-slate-700 mb-1">
//                     UPI payments (optional)
//                   </label>
//                   <input
//                     type="text"
//                     value={upiId}
//                     onChange={(e) => {
//                       setUpiId(e.target.value);
//                       setUpiIdError("");
//                     }}
//                     placeholder="e.g. name@oksbi"
//                     autoComplete="off"
//                     aria-invalid={Boolean(upiIdError)}
//                     aria-describedby="upi-id-help"
//                     className={`w-full px-3.5 py-2.5 border rounded-xl text-sm focus:ring-2 focus:outline-none ${
//                       upiIdError
//                         ? "border-red-500 focus:ring-red-400 bg-red-50/30"
//                         : "border-slate-300 focus:ring-blue-500"
//                     }`}
//                   />
//                   <p id="upi-id-help" className="text-xs text-slate-500 mt-1">
//                     Add a UPI ID to show customers a payment QR on bills. You can add or change it later in Shop Settings.
//                   </p>
//                   {upiIdError && <p className="text-xs text-red-600 font-medium mt-1">{upiIdError}</p>}
//                 </div>

//                 <div>
//                   <div className="flex items-center justify-between mb-1">
//                     <label className="text-xs font-semibold text-slate-700">
//                       15-Character GSTIN Number
//                     </label>
//                     <Tooltip
//                       term="What is GSTIN?"
//                       text="GSTIN is your unique 15-digit Goods and Services Tax Identification Number issued by the government."
//                       example="27AAAAA0000A1Z5"
//                     />
//                   </div>
//                   <input
//                     type="text"
//                     value={gstin}
//                     onChange={handleGstinChange}
//                     maxLength={15}
//                     placeholder="e.g. 27AAAAA0000A1Z5"
//                     className={`w-full px-3.5 py-2.5 border rounded-xl text-sm font-mono uppercase tracking-wider focus:ring-2 focus:outline-none ${
//                       gstinError
//                         ? "border-red-500 focus:ring-red-400 bg-red-50/30"
//                         : gstin.length === 15
//                         ? "border-emerald-500 focus:ring-emerald-400 bg-emerald-50/20"
//                         : "border-slate-300 focus:ring-blue-500"
//                     }`}
//                   />

//                   {gstinError ? (
//                     <p className="text-xs text-red-600 font-medium mt-1">{gstinError}</p>
//                   ) : gstin.length === 15 ? (
//                     <p className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
//                       <CheckCircle2 className="w-3.5 h-3.5" />
//                       Valid GSTIN format detected for State Code {gstin.substring(0, 2)}!
//                     </p>
//                   ) : (
//                     <p className="text-xs text-slate-400 mt-1">
//                       Leave empty if you haven't registered for GST yet.
//                     </p>
//                   )}
//                 </div>

//                 <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs space-y-1.5 text-blue-900">
//                   <p className="font-bold flex items-center gap-1.5">
//                     <CheckCircle2 className="w-4 h-4 text-blue-600" />
//                     Customized Experience Ready
//                   </p>
//                   <p className="text-blue-800 text-3xs leading-relaxed">
//                     Based on your answers, GSTMitra will automatically calculate CGST+SGST vs IGST for your sales, flag ineligible ITC on purchases, and generate GSTR-1, GSTR-3B and GSTR-2B Books reports!
//                   </p>
//                 </div>
//               </div>

//               <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
//                 <button
//                   type="button"
//                   onClick={() => setStep(2)}
//                   className="w-full sm:w-auto text-xs text-slate-600 hover:text-slate-900 font-medium px-4 py-2 order-2 sm:order-1 text-center"
//                 >
//                   Back
//                 </button>
//                 <button
//                   type="button"
//                   onClick={handleCompleteOnboarding}
//                   disabled={submitting || Boolean(gstinError)}
//                   className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-7 py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 order-1 sm:order-2"
//                 >
//                   {submitting ? "Setting up..." : "Complete Setup & Launch Dashboard"}
//                   <ArrowRight className="w-4 h-4" />
//                 </button>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }




"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import { ArrowRight, CheckCircle2, Loader2, Lock, Store } from "lucide-react";
import { Tooltip } from "../components/Tooltip";

// All GST state / UT codes
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
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const UPI_REGEX = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;

// Returns an error message, or "" when the GSTIN is empty or valid
function getGstinError(value: string): string {
  const clean = value.trim().toUpperCase();
  if (!clean) return "";
  if (clean.length !== 15) return "GSTIN must be exactly 15 characters.";
  if (!GSTIN_REGEX.test(clean)) return "Invalid GSTIN format. Example: 27AAAAA0000A1Z5";
  return "";
}

function getUpiError(value: string): string {
  const clean = value.trim();
  if (!clean) return "";
  return UPI_REGEX.test(clean) ? "" : "Enter a valid UPI ID, for example name@oksbi.";
}

const inputBase =
  "w-full px-4 py-3 rounded-xl border text-sm bg-white transition-colors focus:outline-none focus:ring-2";
const inputOk = "border-slate-300 focus:ring-blue-500 focus:border-blue-500";
const inputBad = "border-red-400 bg-red-50/40 focus:ring-red-400 focus:border-red-400";

export default function OnboardingPage() {
  const router = useRouter();
  const { business, updateBusinessState, refreshContext, loading } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [upiId, setUpiId] = useState("");

  const [gstinTouched, setGstinTouched] = useState(false);
  const [upiTouched, setUpiTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Already onboarded users should never see this page
  useEffect(() => {
    if (!loading && business?.isOnboarded) {
      router.replace("/");
    }
  }, [loading, business, router]);

  // Name starts empty for new users. Pre-fill only when editing an existing shop.
  useEffect(() => {
    if (!business) return;
    if (business.isOnboarded && business.name && !business.name.endsWith("'s Business")) {
      setBusinessName(business.name);
    }
    if (business.gstin) setGstin(business.gstin);
    if (business.stateCode) setStateCode(business.stateCode);
    if (business.upiId) setUpiId(business.upiId);
  }, [business]);

  // ---- Derived values (no extra state needed) ----
  const gstinError = getGstinError(gstin);
  const gstinIsValid = gstin.length === 15 && !gstinError;
  const gstinStateCode = gstinIsValid ? gstin.substring(0, 2) : "";
  const gstinStateName = INDIAN_STATES.find((s) => s.code === gstinStateCode)?.name;

  // If GSTIN is valid, the state comes from it and is locked
  const stateLocked = Boolean(gstinStateName);
  const effectiveStateCode = stateLocked ? gstinStateCode : stateCode;

  const upiError = getUpiError(upiId);

  // Show GSTIN error only after the user finished typing (15 chars) or left the field
  const showGstinError = Boolean(gstinError) && (gstinTouched || gstin.length === 15);
  const showUpiError = Boolean(upiError) && upiTouched;

  const canSubmit = businessName.trim().length > 0 && effectiveStateCode !== "" && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGstinTouched(true);
    setUpiTouched(true);
    setErrorMsg("");

    if (gstinError || upiError) return;
    if (!businessName.trim() || !effectiveStateCode) return;

    setSubmitting(true);

    const { data, error } = await apiFetch<{ business: any }>("/auth/onboarding", {
      method: "POST",
      body: JSON.stringify({
        businessName: businessName.trim(),
        stateCode: effectiveStateCode,
        gstin: gstin.trim() || undefined,
        upiId: upiId.trim() || undefined,
        // Sensible defaults. Users can change these later in Shop Settings.
        businessType: business?.businessType || "RETAIL",
        turnoverRange: business?.turnoverRange || "40L_TO_15CR",
        filingFrequency: business?.filingFrequency || "MONTHLY",
      }),
    });

    setSubmitting(false);

    if (error) {
      setErrorMsg(error);
      return;
    }

    if (data?.business) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("justOnboarded", "1");
      }
      updateBusinessState(data.business);
      await refreshContext();
      router.push("/?justOnboarded=1");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-slate-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white px-6 py-6 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold leading-tight">Set up your shop</h1>
              <p className="text-blue-100 text-xs mt-0.5">Takes less than a minute.</p>
            </div>
          </div>
        </div>

        {/* Single form */}
        <form onSubmit={handleSubmit} className="px-6 py-6 sm:px-8 space-y-5" noValidate>
          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl"
            >
              {errorMsg}
            </div>
          )}

          {/* Business name */}
          <div>
            <label htmlFor="businessName" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Shop / business name <span className="text-red-500">*</span>
            </label>
            <input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Ramesh Kirana Store"
              autoFocus
              autoComplete="organization"
              required
              className={`${inputBase} ${inputOk}`}
            />
            <p className="text-xs text-slate-500 mt-1">Shown on your invoices.</p>
          </div>

          {/* GSTIN */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="gstin" className="text-xs font-semibold text-slate-700">
                GSTIN <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <Tooltip
                term="What is GSTIN?"
                text="GSTIN is your unique 15-character Goods and Services Tax Identification Number issued by the government."
                example="27AAAAA0000A1Z5"
              />
            </div>
            <input
              id="gstin"
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              onBlur={() => setGstinTouched(true)}
              maxLength={15}
              placeholder="27AAAAA0000A1Z5"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={showGstinError}
              aria-describedby="gstin-help"
              className={`${inputBase} font-mono uppercase tracking-wider ${
                showGstinError
                  ? inputBad
                  : gstinIsValid
                  ? "border-emerald-500 bg-emerald-50/30 focus:ring-emerald-400"
                  : inputOk
                }`}
            />
            <div id="gstin-help" className="mt-1 text-xs">
              {showGstinError ? (
                <p className="text-red-600 font-medium">{gstinError}</p>
              ) : gstinIsValid ? (
                <p className="text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Valid GSTIN. State filled automatically.
                </p>
              ) : (
                <p className="text-slate-500">Not registered yet? Leave this empty.</p>
              )}
            </div>
          </div>

          {/* State */}
          <div>
            <label htmlFor="stateCode" className="block text-xs font-semibold text-slate-700 mb-1.5">
              State <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                id="stateCode"
                value={effectiveStateCode}
                onChange={(e) => setStateCode(e.target.value)}
                disabled={stateLocked}
                required
                className={`${inputBase} ${inputOk} disabled:bg-slate-50 disabled:text-slate-700 disabled:cursor-not-allowed`}
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
                  className="w-4 h-4 text-slate-400 absolute right-9 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {stateLocked
                ? "Taken from your GSTIN."
                : "Used to decide CGST + SGST or IGST on every sale."}
            </p>
          </div>

          {/* UPI */}
          <div>
            <label htmlFor="upiId" className="block text-xs font-semibold text-slate-700 mb-1.5">
              UPI ID <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="upiId"
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              onBlur={() => setUpiTouched(true)}
              placeholder="e.g. name@oksbi"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={showUpiError}
              aria-describedby="upi-help"
              className={`${inputBase} ${showUpiError ? inputBad : inputOk}`}
            />
            <p id="upi-help" className={`text-xs mt-1 ${showUpiError ? "text-red-600 font-medium" : "text-slate-500"}`}>
              {showUpiError ? upiError : "Shows a payment QR on your bills. You can add it later in Shop Settings."}
            </p>
          </div>

          {/* Actions */}
          <div className="pt-1 space-y-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3.5 rounded-xl shadow-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Setting up...
                </>
              ) : (
                <>
                  Start using GSTMitra
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>

            <div className="text-center">
              <Link
                href="/home"
                className="text-xs text-slate-500 hover:text-slate-800 font-medium px-2 py-1 transition-colors"
              >
                Not now
              </Link>
            </div>
          </div>

          <p className="text-xs text-slate-400 text-center">
            Business type, turnover and filing frequency can be set later in Shop Settings.
          </p>
        </form>
      </div>
    </div>
  );
}