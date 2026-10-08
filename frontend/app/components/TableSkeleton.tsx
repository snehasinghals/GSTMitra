"use client";

import React from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-8 bg-slate-100 rounded-lg" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 bg-slate-100/70 rounded-lg" />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-200 animate-pulse ${className}`} />;
}

export function TableError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="p-12 text-center space-y-3">
      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
      <p className="text-sm font-bold text-slate-700">Couldn&apos;t load your data</p>
      <p className="text-xs text-slate-500">{message || "Please check your connection and try again."}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
      >
        <RotateCw className="w-3.5 h-3.5" />
        Retry
      </button>
    </div>
  );
}