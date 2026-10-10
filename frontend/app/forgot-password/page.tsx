"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "../lib/api";
import {
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";

type Step = "EMAIL" | "OTP" | "PASSWORD" | "SUCCESS";

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>("EMAIL");

  // Form states
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Password UI
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Countdown timer for 60-second resend
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Status & loading
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Timer effect for resend cooldown
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

  // Step 1: Send reset OTP
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await apiFetch<{ success?: boolean; message?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error);
    } else {
      setSuccessMsg(data?.message || "If this email is registered, we sent an OTP.");
      setStep("OTP");
      setCountdown(60);
      setCanResend(false);
      setOtpCode("");
    }
  };

  // Step 2: Verify reset OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setErrorMsg("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await apiFetch<{
      success?: boolean;
      message?: string;
      resetToken?: string;
      attemptsLeft?: number;
    }>("/auth/verify-reset-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp: otpCode.trim() }),
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error);
    } else if (data?.resetToken) {
      setResetToken(data.resetToken);
      setStep("PASSWORD");
      setSuccessMsg("Code verified! Please create your new password.");
    } else {
      setErrorMsg("Failed to verify code. Please try again.");
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (!canResend || resending) return;

    setResending(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await apiFetch<{
      success?: boolean;
      message?: string;
      secondsLeft?: number;
    }>("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email, purpose: "RESET_PASSWORD" }),
    });

    setResending(false);

    if (error) {
      setErrorMsg(error);
      if (data?.secondsLeft) {
        setCountdown(data.secondsLeft);
        setCanResend(false);
      }
    } else {
      setSuccessMsg("A new verification code has been sent to your email!");
      setCountdown(60);
      setCanResend(false);
      setOtpCode("");
    }
  };

  // Password strength hint calculation
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { label: "", color: "bg-slate-200", percent: 0 };
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (/[a-zA-Z]/.test(pwd)) score += 1;
    if (/\d/.test(pwd)) score += 1;
    if (/[^a-zA-Z0-9]/.test(pwd)) score += 1;

    if (score <= 1) return { label: "Weak (needs 8+ chars & numbers)", color: "bg-red-500", percent: 33 };
    if (score <= 3) return { label: "Moderate (good)", color: "bg-amber-500", percent: 66 };
    return { label: "Strong", color: "bg-emerald-500", percent: 100 };
  };

  const strength = getPasswordStrength(newPassword);

  // Step 3: Reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setErrorMsg("Password must contain both letters and numbers.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please check and try again.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    const { data, error } = await apiFetch<{ success?: boolean; message?: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        email,
        resetToken,
        newPassword,
      }),
    });

    setLoading(false);

    if (error) {
      setErrorMsg(error);
    } else {
      setStep("SUCCESS");
      setSuccessMsg(data?.message || "Password changed successfully! Redirecting to login...");
      setTimeout(() => {
        router.push("/login");
      }, 2500);
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
            {step === "EMAIL" && "Reset Your Password"}
            {step === "OTP" && "Enter Verification Code"}
            {step === "PASSWORD" && "Create New Password"}
            {step === "SUCCESS" && "Password Reset Complete"}
          </h1>
          <p className="text-xs text-slate-500">
            {step === "EMAIL" && "Enter your registered email address to receive a verification code."}
            {step === "OTP" && `We sent a 6-digit code to ${email}`}
            {step === "PASSWORD" && "Choose a strong password with at least 8 characters and numbers."}
            {step === "SUCCESS" && "Your password has been updated. You can now log in securely."}
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

        {/* ================= STEP 1: ENTER EMAIL ================= */}
        {step === "EMAIL" && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
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
                  autoFocus
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {loading ? "Sending Code..." : "Send Verification Code"}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-center pt-2 border-t border-slate-100 text-xs">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </Link>
            </div>
          </form>
        )}

        {/* ================= STEP 2: ENTER OTP ================= */}
        {step === "OTP" && (
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
              {loading ? "Verifying..." : "Verify Code"}
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
                  setStep("EMAIL");
                  setErrorMsg("");
                  setSuccessMsg("");
                  setOtpCode("");
                }}
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change email</span>
              </button>
            </div>
          </form>
        )}

        {/* ================= STEP 3: CREATE NEW PASSWORD ================= */}
        {step === "PASSWORD" && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">New Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters (letters & numbers)"
                  required
                  autoFocus
                  minLength={8}
                  className="w-full pl-9 pr-10 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${strength.color}`}
                      style={{ width: `${strength.percent}%` }}
                    />
                  </div>
                  <p className="text-3xs text-slate-500">{strength.label}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={8}
                  className="w-full pl-9 pr-10 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !newPassword || !confirmPassword}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {loading ? "Updating Password..." : "Set New Password"}
              <ShieldCheck className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ================= STEP 4: SUCCESS ================= */}
        {step === "SUCCESS" && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-800">
              Your password has been changed successfully.
            </p>
            <p className="text-xs text-slate-500">
              Redirecting you to the sign-in page...
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md transition-all"
            >
              <span>Go to Sign In Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

