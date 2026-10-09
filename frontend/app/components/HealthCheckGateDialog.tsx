"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

const AUTO_DOWNLOAD_SECONDS = 3;

export type HealthCheckGateDialogProps = {
  open: boolean;
  state: "not_run" | "running" | "ok" | "problems" | "warnings";
  errors: number;
  warnings: number;
  onRunCheck: () => void;
  onViewIssues: () => void;
  onSkip: () => void;
  onContinue: () => void;
  onClose: () => void;
};

// Mounted only while the dialog is in the "ok" state, so the countdown
// starts fresh every time and is cleaned up automatically on unmount
// (Cancel, Escape, overlay click, or Download now).
function AutoDownloadNotice({ onContinue }: { onContinue: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_DOWNLOAD_SECONDS);
  const onContinueRef = useRef(onContinue);
  const firedRef = useRef(false);

  useEffect(() => {
    onContinueRef.current = onContinue;
  }, [onContinue]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (secondsLeft > 0 || firedRef.current) return;
    firedRef.current = true;
    onContinueRef.current();
  }, [secondsLeft]);

  return (
    <div className="flex items-start gap-2" aria-live="polite">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <p className="text-sm text-slate-600">
        Your data looks ready to file. Your download will start in {secondsLeft}{" "}
        {secondsLeft === 1 ? "second" : "seconds"}.
      </p>
    </div>
  );
}

export default function HealthCheckGateDialog({
  open,
  state,
  errors,
  warnings,
  onRunCheck,
  onViewIssues,
  onSkip,
  onContinue,
  onClose,
}: HealthCheckGateDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const content = {
    not_run: {
      title: "Run the health check first?",
      description:
        "The health check looks for problems like missing GST numbers or wrong tax types before you download. It takes a few seconds.",
    },
    running: {
      title: "Checking your data...",
      description: null,
    },
    ok: {
      title: "No problems found",
      description: null,
    },
    problems: {
      title: "Problems found",
      description: `${errors} ${errors === 1 ? "problem needs" : "problems need"} fixing before you file.`,
    },
    warnings: {
      title: "Things to review",
      description: `${warnings} ${warnings === 1 ? "thing" : "things"} to review. Filing is allowed.`,
    },
  }[state];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="health-check-gate-title"
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-fadeIn"
      >
        <div className="space-y-2">
          <h2 id="health-check-gate-title" className="text-base font-bold text-slate-900">
            {content.title}
          </h2>
          {content.description && <p className="text-sm text-slate-600">{content.description}</p>}
          {state === "running" && (
            <div className="flex items-center gap-2 text-sm text-slate-600" role="status">
              <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
              <span>Please wait while we check your data.</span>
            </div>
          )}
          {state === "ok" && <AutoDownloadNotice onContinue={onContinue} />}
        </div>

        <div className="flex flex-col gap-2">
          {state === "not_run" && (
            <>
              <button
                type="button"
                onClick={onRunCheck}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                Run health check
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Skip for now and download
              </button>
            </>
          )}
          {state === "ok" && (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Download now
            </button>
          )}
          {state === "problems" && (
            <>
              <button
                type="button"
                onClick={onViewIssues}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                Review and fix
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Skip for now and download
              </button>
            </>
          )}
          {state === "warnings" && (
            <>
              <button
                type="button"
                onClick={onViewIssues}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
              >
                Review them
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Download anyway
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}