"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  Lock,
  Mail,
  RefreshCw,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  ShieldAlert,
  Eye,
  EyeOff,
  UserPlus,
} from "lucide-react";

type LoginMode = "OTP" | "PASSWORD";
type OtpStep = "INPUT_EMAIL" | "VERIFY_CODE";

export default function LoginPage() {
  const router = useRouter();
  const { loginWithOtp, loginWithPassword, verifyLoginOtp, resendOtp } = useAuth();

  // Mode: OTP (default) or PASSWORD
  const [mode, setMode] = useState<LoginMode>("OTP");
  const [otpStep, setOtpStep] = useState<OtpStep>("INPUT_EMAIL");

  // Input states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Status & loading
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Error & Feedback state
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Countdown timer for OTP resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (mode === "OTP" && otpStep === "VERIFY_CODE" && countdown > 0) {
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
  }, [mode, otpStep, countdown]);

  const clearMessages = () => {
    setErrorCode(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSwitchToOtp = () => {
    setMode("OTP");
    setOtpStep("INPUT_EMAIL");
    clearMessages();
  };

  const handleSwitchToPassword = () => {
    setMode("PASSWORD");
    setOtpStep("INPUT_EMAIL");
    clearMessages();
  };

  // 1. Submit OTP login (Step 1: Send OTP to email)
  const handleSendOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    clearMessages();
    setLoading(true);

    const res = await loginWithOtp(email.trim());
    setLoading(false);

    if (res.error) {
      setErrorCode(res.code || null);
      setErrorMessage(res.error);
    } else {
      setOtpStep("VERIFY_CODE");
      setCountdown(60);
      setCanResend(false);
      setOtpCode("");
      setSuccessMessage(res.message || "A 6-digit code has been sent to your email.");
    }
  };

  // 2. Submit OTP verify (Step 2: Enter 6-digit code)
  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMessage("Please enter the complete 6-digit code.");
      return;
    }

    clearMessages();
    setLoading(true);

    const res = await verifyLoginOtp(email.trim(), otpCode.trim());
    setLoading(false);

    if (res.error) {
      setErrorCode(res.code || null);
      setErrorMessage(res.error);
    } else {
      router.push(res.business?.isOnboarded ? "/" : "/home");
    }
  };

  // 3. Resend OTP code
  const handleResend = async () => {
    if (!canResend || resending) return;

    setResending(true);
    clearMessages();

    const res = await resendOtp(email.trim(), "LOGIN");
    setResending(false);

    if (res.error) {
      setErrorMessage(res.error);
      if (res.secondsLeft) {
        setCountdown(res.secondsLeft);
        setCanResend(false);
      }
    } else {
      setSuccessMessage("A new verification code has been sent to your email!");
      setCountdown(60);
      setCanResend(false);
      setOtpCode("");
    }
  };

  // 4. Submit Password login (Direct, no OTP after)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    clearMessages();
    setLoading(true);

    const res = await loginWithPassword(email.trim(), password);
    setLoading(false);

    if (res.error) {
      setErrorCode(res.code || null);
      setErrorMessage(res.error);
    } else {
      router.push(res.business?.isOnboarded ? "/" : "/home");
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-extrabold text-2xl flex items-center justify-center mx-auto shadow-md">
            GM
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Sign In to GSTMitra</h1>
          <p className="text-xs text-slate-500">
            {mode === "OTP" && otpStep === "VERIFY_CODE"
              ? `Enter the 6-digit code sent to ${email}`
              : "Access your account in simple, plain words."}
          </p>
        </div>

        {/* Mode Selector Tabs (only shown on email input screen) */}
        {!(mode === "OTP" && otpStep === "VERIFY_CODE") && (
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1">
            <button
              type="button"
              onClick={handleSwitchToOtp}
              className={`py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === "OTP"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Login with OTP</span>
            </button>
            <button
              type="button"
              onClick={handleSwitchToPassword}
              className={`py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                mode === "PASSWORD"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Login with password</span>
            </button>
          </div>
        )}

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl space-y-2.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="font-medium leading-relaxed">{errorMessage}</div>
            </div>

            {/* Special Action: Not Registered -> Button to Sign Up */}
            {errorCode === "NOT_REGISTERED" && (
              <div className="pt-1">
                <Link
                  href="/signup"
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Go to Sign Up Page</span>
                </Link>
              </div>
            )}

            {/* Special Action: No Password -> Switch to OTP */}
            {errorCode === "NO_PASSWORD" && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleSwitchToOtp}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow transition-all"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Login with OTP instead</span>
                </button>
              </div>
            )}

            {/* Special Action: Wrong Password / Locked -> Switch to OTP */}
            {(errorCode === "WRONG_PASSWORD" || errorCode === "PASSWORD_LOCKED") && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleSwitchToOtp}
                  className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow transition-all"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Login with OTP</span>
                </button>
              </div>
            )}
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* ================= OPTION 1: LOGIN WITH OTP ================= */}
        {mode === "OTP" && otpStep === "INPUT_EMAIL" && (
          <form onSubmit={handleSendOtpSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) clearMessages();
                  }}
                  placeholder="owner@mybusiness.com"
                  required
                  autoFocus
                  className="w-full pl-9 pr-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <p className="text-3xs text-slate-400 mt-1">
                We will email you a 6-digit login code. No password needed.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {loading ? "Sending code..." : "Send Login Code"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* OTP Step 2: Enter 6-digit Code */}
        {mode === "OTP" && otpStep === "VERIFY_CODE" && (
          <form onSubmit={handleVerifyOtpSubmit} className="space-y-5">
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
                    if (errorMessage) clearMessages();
                  }}
                  placeholder="······"
                  autoFocus
                  required
                  className="w-full text-center tracking-[12px] font-mono text-2xl font-bold py-3.5 border-2 border-blue-500/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-600 focus:outline-none bg-blue-50/20"
                />
              </div>
              <p className="text-3xs text-slate-400 text-center mt-1.5">
                Code expires in 10 minutes. Check your inbox or spam folder.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
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
                  setOtpStep("INPUT_EMAIL");
                  setOtpCode("");
                  clearMessages();
                }}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change email</span>
              </button>
            </div>
          </form>
        )}

        {/* ================= OPTION 2: LOGIN WITH PASSWORD ================= */}
        {mode === "PASSWORD" && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) clearMessages();
                  }}
                  placeholder="owner@mybusiness.com"
                  required
                  autoFocus
                  className="w-full pl-9 pr-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) clearMessages();
                  }}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-9 pr-10 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign In with Password"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Footer: Link to Signup */}
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
