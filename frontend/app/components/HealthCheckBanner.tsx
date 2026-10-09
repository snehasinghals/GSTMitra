"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleHelp, LoaderCircle, RotateCw, ShieldAlert } from "lucide-react";
import { apiFetch } from "../lib/api";

export type HealthCheckScope = "all" | "sales" | "purchase";
export type HealthCheckStatus = "empty" | "ok" | "warning" | "error";

type HealthCheckIssue = {
  id: string;
  severity: "error" | "warning";
  scope: "sales" | "purchase";
  title: string;
  explanation: string;
  howToFix: string;
  recordType: "invoice" | "bill";
  recordId: string;
  recordLabel: string;
  fixUrl: string;
};

type HealthCheckResult = {
  status: HealthCheckStatus;
  month: string;
  checkedAt: string;
  counts: { invoices: number; bills: number; errors: number; warnings: number };
  issueTotals: Record<"sales" | "purchase", { errors: number; warnings: number }>;
  issues: HealthCheckIssue[];
};

type Props = {
  scope: HealthCheckScope;
  month: string;
  variant: "compact" | "full" | "gate";
  autoRun?: boolean;
  onResult?: (
    status: HealthCheckStatus | null,
    counts?: { errors: number; warnings: number }
  ) => void;
};

const statusStyles: Record<HealthCheckStatus, { className: string }> = {
  empty: { className: "border-slate-300 bg-slate-50 text-slate-800" },
  ok: { className: "border-emerald-300 bg-emerald-50 text-emerald-950" },
  warning: { className: "border-amber-300 bg-amber-50 text-amber-950" },
  error: { className: "border-red-300 bg-red-50 text-red-950" },
};

function monthLabel(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(year, number - 1, 1));
}

function timeAgo(checkedAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(checkedAt).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 min ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

function relevantIssueCounts(result: HealthCheckResult, scope: HealthCheckScope) {
  if (scope === "all") return result.counts;
  return result.issueTotals[scope];
}

export default function HealthCheckBanner({ scope, month, variant, onResult, autoRun = true }: Props) {
  const [result, setResult] = useState<HealthCheckResult | null>(null);
  const [requestState, setRequestState] = useState<"idle" | "loading" | "ready" | "failed">(
    autoRun ? "loading" : "idle"
  );
  const [now, setNow] = useState(0);
  const requestId = useRef(0);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const runCheck = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setRequestState("loading");
    setResult(null);
    onResultRef.current?.(null);

    const response = await apiFetch<HealthCheckResult>(
      `/health-check?month=${encodeURIComponent(month)}&scope=${scope}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (currentRequest !== requestId.current) return;
    if (response.error || !response.data) {
      setRequestState("failed");
      onResultRef.current?.(null);
      return;
    }

    setResult(response.data);
    setRequestState("ready");
    onResultRef.current?.(response.data.status, relevantIssueCounts(response.data, scope));
  }, [month, scope]);

  useEffect(() => {
    if (!autoRun) return;
    const timeout = window.setTimeout(() => void runCheck(), 0);
    return () => {
      window.clearTimeout(timeout);
      requestId.current += 1;
    };
  }, [autoRun, runCheck]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const style = result ? statusStyles[result.status] : statusStyles.empty;
  const issueTotals = result?.issueTotals ?? {
    sales: { errors: 0, warnings: 0 },
    purchase: { errors: 0, warnings: 0 },
  };
  const relevantTotals =
    scope === "all"
      ? { errors: issueTotals.sales.errors + issueTotals.purchase.errors, warnings: issueTotals.sales.warnings + issueTotals.purchase.warnings }
      : issueTotals[scope];
  const visibleIssues =
    result?.issues.filter((issue) => scope === "all" || issue.scope === scope) ?? [];
  const totalIssues = relevantTotals.errors + relevantTotals.warnings;
  const omittedIssues = Math.max(0, totalIssues - visibleIssues.length);
  const errorCount = relevantTotals.errors;
  const warningCount = relevantTotals.warnings;

  return (
    <section
      aria-label="Health check"
      className={`rounded-2xl border p-4 sm:p-5 ${style.className} ${variant === "gate" ? "rounded-xl" : ""}`}
    >
      <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {requestState === "loading" ? (
            <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
          ) : requestState === "failed" ? (
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : result?.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : result?.status === "error" ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : result?.status === "warning" ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <CircleHelp className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          )}

          <div className="min-w-0 space-y-1 text-sm">
            {requestState === "loading" && (
              <>
                <p className="font-semibold">Checking your data...</p>
                <div className="h-3 w-56 max-w-full animate-pulse rounded bg-slate-300/70" aria-label="Loading health check" />
              </>
            )}
            {requestState === "idle" && (
              <>
                <p className="font-semibold">Health check hasn&apos;t run yet.</p>
                <p>Run it when you&apos;re ready to review this period.</p>
              </>
            )}
            {requestState === "failed" && (
              <>
                <p className="font-semibold">Couldn&apos;t check right now.</p>
                <p>Please try again when your connection is available.</p>
              </>
            )}
            {requestState === "ready" && result?.status === "empty" && (
              <>
                <p className="font-semibold">Nothing to check yet.</p>
                <p>
                  {scope === "all"
                    ? "Add your first invoice or bill and we will check it for you."
                    : `Add your first ${scope === "purchase" ? "purchase bill" : "sales invoice"} and we will check it for you.`}
                </p>
              </>
            )}
            {requestState === "ready" && result?.status === "ok" && (
              <p className="font-semibold">All good for {monthLabel(month)}. Your data looks ready to file.</p>
            )}
            {requestState === "ready" && result?.status === "warning" && (
              <p className="font-semibold">{warningCount} {warningCount === 1 ? "thing" : "things"} to review — filing is allowed.</p>
            )}
            {requestState === "ready" && result?.status === "error" && (
              <p className="font-semibold">{errorCount} {errorCount === 1 ? "problem" : "problems"} to fix before filing.</p>
            )}
            {result?.checkedAt && requestState === "ready" && (
              <p className="text-sm text-slate-700">
                Last checked: {timeAgo(result.checkedAt, now || new Date(result.checkedAt).getTime())}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {result?.status === "empty" && requestState === "ready" && scope !== "purchase" && (
            <Link
              href="/sales?addInvoice=1"
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Add sales invoice
            </Link>
          )}
          {result?.status === "empty" && requestState === "ready" && scope !== "sales" && (
            <Link
              href="/purchases?addBill=1"
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Add purchase bill
            </Link>
          )}
          {variant === "compact" && requestState === "ready" && (
            <Link
              href="/gst-filing"
              className="inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-sm font-semibold underline underline-offset-2"
            >
              View details
            </Link>
          )}
          {requestState === "failed" && (
            <button
              type="button"
              onClick={() => void runCheck()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={requestState === "loading"}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
          >
            {requestState === "loading" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="h-4 w-4" aria-hidden="true" />
            )}
            {requestState === "loading"
              ? "Checking your data..."
              : result
                ? "Re-check"
                : "Run health check"}
          </button>
        </div>
      </div>

      {(variant === "full" || variant === "gate") && requestState === "ready" && result && result.status !== "empty" && (
        <details className="mt-4 border-t border-current/15 pt-3">
          <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold">
            {totalIssues ? "View check details" : "No problems were found"}
          </summary>
          {visibleIssues.length > 0 && (
            <div className="mt-2 space-y-3">
              {(["error", "warning"] as const).map((severity) => {
                const group = visibleIssues.filter((issue) => issue.severity === severity);
                if (!group.length) return null;
                return (
                  <div key={severity} className="space-y-2">
                    <h3 className="text-sm font-bold">
                      {severity === "error" ? "Problems to fix" : "Things to review"}
                    </h3>
                    {group.map((issue) => (
                      <article key={issue.id} className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900">
                        <h4 className="text-sm font-bold">{issue.title}</h4>
                        <p className="mt-1 text-sm">{issue.explanation}</p>
                        <p className="mt-1 text-sm"><span className="font-semibold">How to fix:</span> {issue.howToFix}</p>
                        <p className="mt-1 text-sm text-slate-700">
                          {issue.recordType === "invoice" ? "Invoice" : "Bill"}: {issue.recordLabel}
                        </p>
                        <Link
                          href={issue.fixUrl}
                          className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                        >
                          Fix this
                        </Link>
                      </article>
                    ))}
                  </div>
                );
              })}
              {omittedIssues > 0 && (
                <p className="text-sm font-semibold">and {omittedIssues} more {omittedIssues === 1 ? "issue" : "issues"}.</p>
              )}
            </div>
          )}
        </details>
      )}
    </section>
  );
}
