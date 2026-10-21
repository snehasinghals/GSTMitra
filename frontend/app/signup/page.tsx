"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  ArrowLeft,
  Lock,
  Mail,
  User,
  MapPin,
  Phone,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

type Screen = "EMAIL" | "OTP" | "PASSWORD" | "PROFILE" | "DONE";

export default function SignupPage() {
  const router = useRouter();
  const { sendSignupOtp, verifySignupOtpNew, completeSignup, resendOtp } = useAuth();

  // State across screens
  const [screen, setScreen] = useState<Screen>("EMAIL");
  const [email, setEmail] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [mitraId, setMitraId] = useState("");

  // Screen 1: email
  const [emailLoading, setEmailLoading] = useState(false);

  // Screen 2: OTP
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [resending, setResending] = useState(false);

  // Screen 3: password (optional)
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordChosen, setPasswordChosen] = useState<"SET" | "SKIP" | null>(null);

  // Screen 4: profile
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);

  // Feedback
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // OTP countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (screen === "OTP" && countdown > 0) {
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
    }
    return () => { if (timer) clearInterval(timer); };
  }, [screen, countdown]);

  const clearFeedback = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  // ---- SCREEN 1: Email → Send OTP ----
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    setEmailLoading(true);

    const res = await sendSignupOtp(email);
    setEmailLoading(false);

    if (res.error) {
      if ((res as any).code === "EMAIL_EXISTS") {
        // Show special message with login link
        setErrorMsg("__EMAIL_EXISTS__");
      } else {
        setErrorMsg(res.error);
      }
      return;
    }

    setScreen("OTP");
    setCountdown(60);
    setCanResend(false);
    setSuccessMsg("Code sent! Check your inbox or spam folder.");
  };

  // ---- SCREEN 2: OTP verify ----
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      setErrorMsg("Please enter the 6-digit code.");
      return;
    }
    clearFeedback();
    setOtpLoading(true);

    const res = await verifySignupOtpNew(email, otpCode.trim());
    setOtpLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
      return;
    }

    setSignupToken(res.signupToken || "");
    setScreen("PASSWORD");
    clearFeedback();
  };

  const handleResendOtp = async () => {
    if (!canResend || resending) return;
    setResending(true);
    clearFeedback();

    const res = await resendOtp(email, "SIGNUP");
    setResending(false);

    if (res.error) {
      setErrorMsg(res.error);
      if (res.secondsLeft) {
        setCountdown(res.secondsLeft);
        setCanResend(false);
      }
    } else {
      setSuccessMsg("New code sent!");
      setCountdown(60);
      setCanResend(false);
      setOtpCode("");
    }
  };

  // ---- SCREEN 3: Password choice ----
  const handlePasswordChoice = (choice: "SET" | "SKIP") => {
    clearFeedback();
    setPasswordChosen(choice);
    if (choice === "SKIP") {
      setPassword("");
      setScreen("PROFILE");
    }
  };

  const handleSetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    setScreen("PROFILE");
  };

  // ---- SCREEN 4: Profile + complete ----
  const handleCompleteSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    const cleanPhone = phone.trim().replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      setErrorMsg("Please enter a valid 10-digit Indian mobile number (starts with 6-9).");
      return;
    }

    setProfileLoading(true);
    const res = await completeSignup(
      signupToken,
      name.trim(),
      address.trim(),
      cleanPhone,
      passwordChosen === "SET" ? password : undefined
    );
    setProfileLoading(false);

    if (res.error) {
      setErrorMsg(res.error);
      return;
    }

    setMitraId(res.mitraId || "");
    setScreen("DONE");
  };

  // ---- RENDER ----

  const stepLabels: Record<Screen, string> = {
    EMAIL: "Enter Email",
    OTP: "Verify Email",
    PASSWORD: "Set Password",
    PROFILE: "Your Details",
    DONE: "Welcome!",
  };

  const stepOrder: Screen[] = ["EMAIL", "OTP", "PASSWORD", "PROFILE", "DONE"];
  const currentStep = stepOrder.indexOf(screen) + 1;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-5">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white font-extrabold text-2xl flex items-center justify-center mx-auto shadow-md">
            GM
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            {screen === "DONE" ? "Welcome to GSTMitra! 🎉" : "Create your free account"}
          </h1>
          {screen !== "DONE" && (
            <p className="text-xs text-slate-500">
              Step {currentStep} of 4 — {stepLabels[screen]}
            </p>
          )}
        </div>

        {/* Progress bar */}
        {screen !== "DONE" && (
          <div className="flex gap-1.5">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  s <= currentStep ? "bg-blue-600" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        )}

        {/* Feedback */}
        {errorMsg && errorMsg !== "__EMAIL_EXISTS__" && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            {errorMsg}
          </div>
        )}
        {errorMsg === "__EMAIL_EXISTS__" && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl font-medium space-y-2">
            <p>This email is already registered.</p>
            <Link href="/login" className="inline-block bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-blue-700 transition-all">
              Go to Login →
            </Link>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ======= SCREEN 1: EMAIL ======= */}
        {screen === "EMAIL" && (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) clearFeedback();
                  }}
                  placeholder="ramesh@mybusiness.com"
                  required
                  autoFocus
                  className="w-full pl-9 pr-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <p className="text-3xs text-slate-400 mt-1">
                We'll send a 6-digit code to verify your email.
              </p>
            </div>

            <button
              type="submit"
              disabled={emailLoading || !email}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {emailLoading ? "Sending code..." : "Send Verification Code"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ======= SCREEN 2: OTP ======= */}
        {screen === "OTP" && (
          <form onSubmit={handleVerifyOtp} className="space-y-5">
            <p className="text-xs text-slate-600 text-center">
              We sent a 6-digit code to <span className="font-semibold text-slate-800">{email}</span>
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2 text-center">
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otpCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setOtpCode(val);
                  if (errorMsg) clearFeedback();
                }}
                placeholder="······"
                autoFocus
                required
                className="w-full text-center tracking-[12px] font-mono text-2xl font-bold py-3 border-2 border-blue-500/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-600 focus:outline-none bg-blue-50/20"
              />
              <p className="text-3xs text-slate-400 text-center mt-1.5">
                Code expires in 10 minutes. Check spam if not found.
              </p>
            </div>

            <button
              type="submit"
              disabled={otpLoading || otpCode.length !== 6}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {otpLoading ? "Verifying..." : "Verify Code"}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={!canResend || resending}
                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-semibold disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resending ? "animate-spin" : ""}`} />
                {canResend ? "Resend code" : `Resend code (${countdown}s)`}
              </button>

              <button
                type="button"
                onClick={() => { setScreen("EMAIL"); clearFeedback(); setOtpCode(""); }}
                className="flex items-center gap-1 text-slate-500 hover:text-slate-800 font-medium"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change email
              </button>
            </div>
          </form>
        )}

        {/* ======= SCREEN 3: PASSWORD (OPTIONAL) ======= */}
        {screen === "PASSWORD" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
              <p className="font-semibold mb-0.5">Email verified ✓</p>
              <p>Do you want to set a password for faster login? You can skip and always use email OTP instead.</p>
            </div>

            {/* If user clicked "Set password", show the form */}
            {passwordChosen === "SET" ? (
              <form onSubmit={handleSetPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Choose a Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (errorMsg) clearFeedback(); }}
                      placeholder="At least 6 characters"
                      autoFocus
                      className="w-full pl-9 pr-10 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setPasswordChosen(null); clearFeedback(); }}
                    className="flex-1 py-3 border border-slate-300 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-50 transition-all"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={password.length < 6}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
                  >
                    Set Password
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handlePasswordChoice("SET")}
                  className="w-full flex items-center gap-3 border-2 border-blue-600 bg-blue-50 text-blue-900 font-semibold text-sm px-4 py-3.5 rounded-xl hover:bg-blue-100 transition-all"
                >
                  <Lock className="w-5 h-5 text-blue-600" />
                  <span className="text-left">
                    <span className="block font-bold">Set a password</span>
                    <span className="text-xs text-blue-700 font-normal">Login faster next time without OTP</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePasswordChoice("SKIP")}
                  className="w-full flex items-center gap-3 border border-slate-300 text-slate-700 font-semibold text-sm px-4 py-3.5 rounded-xl hover:bg-slate-50 transition-all"
                >
                  <ShieldCheck className="w-5 h-5 text-slate-500" />
                  <span className="text-left">
                    <span className="block font-bold">Skip for now</span>
                    <span className="text-xs text-slate-500 font-normal">Use email OTP every time you login</span>
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======= SCREEN 4: PROFILE ======= */}
        {screen === "PROFILE" && (
          <form onSubmit={handleCompleteSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errorMsg) clearFeedback(); }}
                  placeholder="Ramesh Kumar"
                  required
                  autoFocus
                  className="w-full pl-9 pr-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); if (errorMsg) clearFeedback(); }}
                  placeholder="123, MG Road, Mumbai, Maharashtra"
                  required
                  className="w-full pl-9 pr-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <span className="absolute left-9 top-3 text-sm text-slate-500 select-none">+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                    setPhone(val);
                    if (errorMsg) clearFeedback();
                  }}
                  placeholder="9876543210"
                  required
                  maxLength={10}
                  className="w-full pl-16 pr-3.5 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <p className="text-3xs text-slate-400 mt-1">
                10-digit Indian mobile number. This is only used as a contact number.
              </p>
            </div>

            <button
              type="submit"
              disabled={profileLoading || !name.trim() || !address.trim() || phone.length !== 10}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm disabled:opacity-50"
            >
              {profileLoading ? "Creating your account..." : "Create Account"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ======= SCREEN 5: DONE — show Mitra ID ======= */}
        {screen === "DONE" && (
          <div className="space-y-5 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-3">Your unique GSTMitra ID is:</p>
              <div className="bg-blue-50 border-2 border-blue-300 rounded-2xl py-4 px-6 inline-block">
                <span className="text-2xl font-extrabold text-blue-700 font-mono tracking-wide">
                  {mitraId}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
                Save this ID. You can share it with your CA or accountant to get help quickly.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push("/home")}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-md transition-all text-sm"
            >
              Continue to Home
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Bottom link to login */}
        {screen !== "DONE" && (
          <div className="text-center pt-2 border-t border-slate-200 text-xs text-slate-600">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-600 font-bold hover:underline">
              Sign In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
