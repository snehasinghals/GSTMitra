"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../lib/api";
import {
  User,
  MapPin,
  Phone,
  CreditCard,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

export default function ProfilePage() {
  const { user, updateUserState, loading } = useAuth();

  // Form states
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [pan, setPan] = useState("");

  // Validation errors
  const [panError, setPanError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Status
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState(false);

  // Password reset modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdStep, setPwdStep] = useState<"REQUEST_OTP" | "ENTER_OTP" | "NEW_PASSWORD">("REQUEST_OTP");
  const [pwdOtp, setPwdOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");

  // Load existing profile values
  useEffect(() => {
    if (user) {
      if (user.name) setName(user.name);
      if (user.address) setAddress(user.address);
      if (user.phone) setPhone(user.phone);
      if (user.pan) setPan(user.pan);
    }
  }, [user]);

  // Copy Mitra ID
  const handleCopyMitraId = async () => {
    if (user?.mitraId) {
      try {
        await navigator.clipboard.writeText(user.mitraId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  // PAN validation: 5 uppercase letters, 4 digits, 1 uppercase letter
  const validatePan = (val: string): boolean => {
    if (!val || val.trim() === "") {
      setPanError("");
      return true;
    }
    const clean = val.trim().toUpperCase();
    const regex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!regex.test(clean)) {
      setPanError("PAN must be 5 letters, 4 numbers, 1 letter (e.g. ABCDE1234F)");
      return false;
    }
    setPanError("");
    return true;
  };

  // Phone validation: 10-digit Indian mobile
  const validatePhone = (val: string): boolean => {
    if (!val || val.trim() === "") {
      setPhoneError("");
      return true;
    }
    const clean = val.trim().replace(/\s+/g, "");
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setPhoneError("Phone must be a 10-digit Indian mobile number (starts with 6-9)");
      return false;
    }
    setPhoneError("");
    return true;
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError("");
    setSaveSuccess("");

    if (!name.trim()) {
      setSaveError("Name is required.");
      return;
    }

    if (phone && !validatePhone(phone)) return;
    if (pan && !validatePan(pan)) return;

    setSaving(true);
    const { data, error } = await apiFetch<{ message: string; user: any }>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        address: address.trim(),
        phone: phone.trim().replace(/\s+/g, ""),
        pan: pan ? pan.trim().toUpperCase() : null,
      }),
    });
    setSaving(false);

    if (error) {
      setSaveError(error);
    } else if (data?.user) {
      updateUserState(data.user);
      setSaveSuccess("Profile saved successfully!");
      setTimeout(() => setSaveSuccess(""), 4000);
    }
  };

  // ------------------- Password Reset via OTP -------------------
  const handleRequestPasswordOtp = async () => {
    if (!user?.email) return;
    setPwdLoading(true);
    setPwdError("");
    setPwdSuccess("");

    const { data, error } = await apiFetch<any>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: user.email }),
    });
    setPwdLoading(false);

    if (error) {
      setPwdError(error);
    } else {
      setPwdStep("ENTER_OTP");
      setPwdSuccess("Verification code sent to your email.");
    }
  };

  const handleVerifyPasswordOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || pwdOtp.trim().length !== 6) {
      setPwdError("Please enter the 6-digit code.");
      return;
    }
    setPwdLoading(true);
    setPwdError("");
    setPwdSuccess("");

    const { data, error } = await apiFetch<any>("/auth/verify-reset-otp", {
      method: "POST",
      body: JSON.stringify({ email: user.email, otp: pwdOtp.trim() }),
    });
    setPwdLoading(false);

    if (error) {
      setPwdError(error);
    } else if (data?.resetToken) {
      setResetToken(data.resetToken);
      setPwdStep("NEW_PASSWORD");
      setPwdSuccess("Code verified! Set your new password.");
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setPwdError("Password must be at least 8 characters with letters & numbers.");
      return;
    }
    setPwdLoading(true);
    setPwdError("");
    setPwdSuccess("");

    const { data, error } = await apiFetch<any>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        email: user?.email,
        resetToken,
        newPassword,
      }),
    });
    setPwdLoading(false);

    if (error) {
      setPwdError(error);
    } else {
      setPwdSuccess("Password updated successfully!");
      setTimeout(() => {
        setShowPasswordModal(false);
        setPwdStep("REQUEST_OTP");
        setPwdOtp("");
        setNewPassword("");
        setPwdSuccess("");
      }, 2000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn py-2 sm:py-4">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">Your Profile</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage your personal details and account security</p>
      </div>

      {/* Profile Form Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-6">
        {saveError && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}

        {saveSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          {/* Mitra ID (Read-only) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Mitra ID</label>
              <span className="text-3xs text-slate-400 font-medium">Unique • Never changes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  value={loading ? "Loading..." : user?.mitraId || "Mitra ID not created yet"}
                  readOnly
                  disabled
                  className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-700 bg-slate-50 select-all cursor-not-allowed"
                />
              </div>
              <button
                type="button"
                onClick={handleCopyMitraId}
                disabled={!user?.mitraId}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5"
                title="Copy Mitra ID"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>

          {/* Email (Read-only) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                value={user?.email || ""}
                readOnly
                disabled
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 bg-slate-50 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Full Name (Required) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ramesh Kumar"
                required
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Phone (10 digits) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <span className="absolute left-9 top-3 text-sm text-slate-500 select-none">+91</span>
              <input
                type="tel"
                value={phone}
                maxLength={10}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                  setPhone(val);
                  validatePhone(val);
                }}
                placeholder="9876543210"
                className="w-full pl-16 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {phoneError && <p className="text-3xs text-red-600 mt-1">{phoneError}</p>}
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Address</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop 4, MG Road, Mumbai, Maharashtra"
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* PAN (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">PAN Card Number</label>
              <span className="text-3xs text-slate-400">Optional</span>
            </div>
            <div className="relative">
              <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={pan}
                maxLength={10}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setPan(val);
                  validatePan(val);
                }}
                placeholder="ABCDE1234F"
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-300 rounded-xl text-sm font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {panError && <p className="text-3xs text-red-600 mt-1">{panError}</p>}
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || Boolean(panError) || Boolean(phoneError)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-md transition-all disabled:opacity-50"
            >
              {saving ? "Saving Changes..." : "Save Profile Details"}
            </button>
          </div>
        </form>
      </div>

      {/* Password Management Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 sm:p-8 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600" />
              <span>Password & Security</span>
            </h2>
            <p className="text-xs text-slate-500">
              Set or update your account password for faster login
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowPasswordModal(true);
              setPwdStep("REQUEST_OTP");
              setPwdError("");
              setPwdSuccess("");
            }}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
          >
            Set / Change Password
          </button>
        </div>
      </div>

      {/* ================= PASSWORD CHANGE MODAL ================= */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200 animate-scale-up">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-900">Set or Change Password</h3>
              <p className="text-xs text-slate-500">
                Verified via OTP sent to {user?.email}
              </p>
            </div>

            {pwdError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl">
                {pwdSuccess}
              </div>
            )}

            {pwdStep === "REQUEST_OTP" && (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed text-center">
                  To keep your account secure, we will send a 6-digit verification code to your email.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestPasswordOtp}
                    disabled={pwdLoading}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow transition-all"
                  >
                    {pwdLoading ? "Sending Code..." : "Send Verification Code"}
                  </button>
                </div>
              </div>
            )}

            {pwdStep === "ENTER_OTP" && (
              <form onSubmit={handleVerifyPasswordOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 text-center">
                    Enter 6-Digit Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={pwdOtp}
                    onChange={(e) => setPwdOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="······"
                    required
                    autoFocus
                    className="w-full text-center tracking-[10px] font-mono text-2xl font-bold py-2.5 border-2 border-blue-500/50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPwdStep("REQUEST_OTP")}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={pwdLoading || pwdOtp.length !== 6}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow transition-all"
                  >
                    {pwdLoading ? "Verifying..." : "Verify Code"}
                  </button>
                </div>
              </form>
            )}

            {pwdStep === "NEW_PASSWORD" && (
              <form onSubmit={handleSetNewPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswordText ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters (letters & numbers)"
                      required
                      autoFocus
                      minLength={8}
                      className="w-full pl-3.5 pr-10 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-3xs text-slate-400 mt-1">
                    Minimum 8 characters, must include both letters and numbers.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pwdLoading || newPassword.length < 8}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition-all"
                  >
                    {pwdLoading ? "Updating..." : "Save New Password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

