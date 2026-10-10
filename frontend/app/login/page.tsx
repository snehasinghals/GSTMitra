"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import { ArrowRight, Lock, Mail, RefreshCw, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, verifyLoginOtp, verifySignupOtp, resendOtp } = useAuth();

  // Login form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // OTP view states
  const [step, setStep] = useState<"FORM" | "OTP">("FORM");
  const [otpCode, setOtpCode] = useState("");
  const [otpPurpose, setOtpPurpose] = useState<"LOGIN" | "SIGNUP">("LOGIN");
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Status & feedback
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Timer effect for 60-second resend cooldown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "OTP" && countdown > 0) {
      setCanResend(false);
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setCanResend(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, countdown]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const res = await login(email, password);
    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else if (res.needsOtp) {
      setStep("OTP");
      setOtpPurpose(res.purpose === "SIGNUP" ? "SIGNUP" : "LOGIN");
      setCountdown(60);
      setCanResend(false);
      setSuccessMsg(res.message || "A verification code has been sent to your email.");
    } else {
      router.push("/");
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg("Please enter the complete 6-digit code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    // If unverified user was sent a SIGNUP OTP from login, verify via signup endpoint, else login endpoint
    const res = otpPurpose === "SIGNUP"
      ? await verifySignupOtp(email, otpCode.trim())
      : await verifyLoginOtp(email, otpCode.trim());

    setLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      router.push("/");
    }
  };

  const handleResend = async () => {
    if (!canResend || resending) return;

    setResending(true);
    setErrorMsg("");
    setSuccessMsg("");

    const res = await resendOtp(email, otpPurpose);
    setResending(false);

    if (res.error) {
      setErrorMsg(res.error);
      if (res.secondsLeft) {
        setCountdown(res.secondsLeft);
        setCanResend(false);
      }
    } else {
      setSuccessMsg("A new verification code has been sent to your email!");
      setCountdown(60);
      setCanResend(false);
      setOtpCode("");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-extrabold text-2xl flex items-center justify-center mx-auto shadow-md">
            GM
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {step === "FORM" ? "Welcome to GSTMitra" : "Two-Step Verification"}
          </h1>
          <p className="text-xs text-slate-500">
            {step === "FORM"
              ? "Sign in to prepare, check, and file your GST returns in simple words."
              : `Enter the 6-digit verification code sent to ${email}`}
          </p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* STEP 1: LOGIN FORM */}
        {step === "FORM" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@mybusiness.com"
                  required
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Continue to Verify"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          /* STEP 2: OTP VERIFICATION SCREEN */
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2 text-center">
                Enter 6-Digit Code
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    setOtpCode(val);
                    if (errorMsg) setErrorMsg("");
                  }}
                  placeholder="······"
                  autoFocus
                  required
                  className="w-full text-center tracking-[12px] font-mono text-2xl font-bold py-3 border-2 border-blue-500/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-600 focus:outline-none bg-blue-50/20"
                />
              </div>
              <p className="text-3xs text-slate-500 text-center mt-1.5">
                Code expires in 10 minutes. Check your inbox or spam folder.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify & Sign In"}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={handleResend}
                disabled={!canResend || resending}
                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-semibold disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                <span>{canResend ? "Resend code" : `Resend code (${countdown}s)`}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("FORM");
                  setErrorMsg("");
                  setSuccessMsg("");
                  setOtpCode("");
                }}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            </div>
          </form>
        )}

        <div className="text-center pt-2 border-t border-slate-200 text-xs text-slate-600">
          First-time user?{" "}
          <Link href="/signup" className="text-blue-600 font-bold hover:underline">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
