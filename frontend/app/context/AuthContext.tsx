"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { apiFetch } from "../lib/api";

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Business {
  id: string;
  name: string;
  tradeName?: string;
  gstin?: string;
  stateCode: string;
  stateName: string;
  businessType: string;
  turnoverRange: string;
  filingFrequency: string;
  registrationType: string;
  address?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
  bankIfsc?: string;
  isOnboarded: boolean;
}

interface AuthResponse {
  token?: string;
  user?: User;
  business?: Business;
  needsOtp?: boolean;
  email?: string;
  purpose?: "SIGNUP" | "LOGIN";
  message?: string;
  error?: string;
  attemptsLeft?: number;
  code?: string;
  secondsLeft?: number;
}

interface AuthContextType {
  user: User | null;
  business: Business | null;
  token: string | null;
  loading: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<AuthResponse>;
  signup: (email: string, password: string, name: string, businessName: string) => Promise<AuthResponse>;
  verifySignupOtp: (email: string, code: string) => Promise<AuthResponse>;
  verifyLoginOtp: (email: string, code: string) => Promise<AuthResponse>;
  resendOtp: (email: string, purpose: "SIGNUP" | "LOGIN") => Promise<AuthResponse>;
  logout: () => void;
  refreshContext: () => Promise<void>;
  updateBusinessState: (updated: Partial<Business>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchCurrentContext = async () => {
    const savedToken = typeof window !== "undefined" ? localStorage.getItem("gstmitra_token") : null;
    if (!savedToken) {
      setLoading(false);
      return;
    }
    setToken(savedToken);

    const { data, error } = await apiFetch<{ user: User; business: Business }>("/auth/me");
    if (data) {
      setUser(data.user);
      setBusiness(data.business);
      setAuthError(null);
    } else if (error) {
      setAuthError(error);
      localStorage.removeItem("gstmitra_token");
      setToken(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCurrentContext();
  }, []);

  const login = async (email: string, password: string): Promise<AuthResponse> => {
    const { data, error } = await apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (error) return { error };

    if (data?.needsOtp) {
      return data;
    }

    if (data?.token && data?.user) {
      localStorage.setItem("gstmitra_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setBusiness(data.business || null);
      return data;
    }

    return { error: data?.error || "Unknown login error" };
  };

  const signup = async (
    email: string,
    password: string,
    name: string,
    businessName: string
  ): Promise<AuthResponse> => {
    const { data, error } = await apiFetch<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name, businessName }),
    });

    if (error) return { error };

    if (data?.needsOtp) {
      return data;
    }

    if (data?.token && data?.user) {
      localStorage.setItem("gstmitra_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setBusiness(data.business || null);
      return data;
    }

    return { error: data?.error || "Unknown signup error" };
  };

  const verifySignupOtp = async (email: string, code: string): Promise<AuthResponse> => {
    const { data, error } = await apiFetch<AuthResponse>("/auth/verify-signup-otp", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });

    if (error) return { error };

    if (data?.token && data?.user) {
      localStorage.setItem("gstmitra_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setBusiness(data.business || null);
      return data;
    }

    return { error: data?.error || "Failed to verify signup code." };
  };

  const verifyLoginOtp = async (email: string, code: string): Promise<AuthResponse> => {
    const { data, error } = await apiFetch<AuthResponse>("/auth/verify-login-otp", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });

    if (error) return { error };

    if (data?.token && data?.user) {
      localStorage.setItem("gstmitra_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setBusiness(data.business || null);
      return data;
    }

    return { error: data?.error || "Failed to verify login code." };
  };

  const resendOtp = async (email: string, purpose: "SIGNUP" | "LOGIN"): Promise<AuthResponse> => {
    const { data, error } = await apiFetch<AuthResponse>("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email, purpose }),
    });

    if (error) return { error };
    return data || { error: "Failed to resend code" };
  };

  const logout = () => {
    localStorage.removeItem("gstmitra_token");
    setToken(null);
    setUser(null);
    setBusiness(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  const updateBusinessState = (updated: Partial<Business>) => {
    if (business) {
      setBusiness({ ...business, ...updated });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        business,
        token,
        loading,
        authError,
        login,
        signup,
        verifySignupOtp,
        verifyLoginOtp,
        resendOtp,
        logout,
        refreshContext: fetchCurrentContext,
        updateBusinessState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
