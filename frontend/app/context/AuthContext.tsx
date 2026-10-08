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

interface AuthContextType {
  user: User | null;
  business: Business | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, name: string, businessName: string) => Promise<{ error?: string }>;
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
    } else if (error) {
      localStorage.removeItem("gstmitra_token");
      setToken(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCurrentContext();
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await apiFetch<{ token: string; user: User; business: Business }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (error) return { error };

    if (data) {
      localStorage.setItem("gstmitra_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setBusiness(data.business);
      return {};
    }
    return { error: "Unknown login error" };
  };

  const signup = async (email: string, password: string, name: string, businessName: string) => {
    const { data, error } = await apiFetch<{ token: string; user: User; business: Business }>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name, businessName }),
    });

    if (error) return { error };

    if (data) {
      localStorage.setItem("gstmitra_token", data.token);
      setToken(data.token);
      setUser(data.user);
      setBusiness(data.business);
      return {};
    }
    return { error: "Unknown signup error" };
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
        login,
        signup,
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
