"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HealthCheckStatus } from "../components/HealthCheckBanner";
import type { HealthCheckGateDialogProps } from "../components/HealthCheckGateDialog";

type HealthCheckState = {
  status: HealthCheckStatus | null;
  errors: number;
  warnings: number;
};

type DialogState = HealthCheckGateDialogProps["state"];

// The banner gives up after 8 seconds, so stop waiting a little after that.
const RESULT_TIMEOUT_MS = 10_000;

export function useHealthCheckGate(healthCheck: HealthCheckState) {
  const [runToken, setRunToken] = useState(0);
  const pendingAction = useRef<(() => void) | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [waitingForResult, setWaitingForResult] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>("not_run");

  const guard = useCallback(
    (action: () => void) => {
      switch (healthCheck.status) {
        case "ok":
        case "empty":
          action();
          return;
        case "error":
          pendingAction.current = action;
          setDialogState("problems");
          setDialogOpen(true);
          return;
        case "warning":
          pendingAction.current = action;
          setDialogState("warnings");
          setDialogOpen(true);
          return;
        case null:
          pendingAction.current = action;
          setDialogState("not_run");
          setDialogOpen(true);
          return;
      }
    },
    [healthCheck.status]
  );

  const onRunCheck = useCallback(() => {
    setWaitingForResult(true);
    setRunToken((token) => token + 1);
  }, []);

  const onViewIssues = useCallback(() => {
    pendingAction.current = null;
    setWaitingForResult(false);
    setDialogOpen(false);
    const section = document.getElementById("health-check-section");
    if (!section) return;
    const details = section.querySelector("details");
    if (details) details.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Run the pending action once. The ref is cleared first, so it can never run twice.
  const runPendingAction = useCallback(() => {
    const action = pendingAction.current;
    pendingAction.current = null;
    setWaitingForResult(false);
    setDialogOpen(false);
    action?.();
  }, []);

  const onSkip = runPendingAction;
  const onContinue = runPendingAction;

  const onClose = useCallback(() => {
    pendingAction.current = null;
    setWaitingForResult(false);
    setDialogOpen(false);
  }, []);

  const reset = useCallback(() => {
    pendingAction.current = null;
    setDialogOpen(false);
    setWaitingForResult(false);
    setRunToken(0);
    setDialogState("not_run");
  }, []);

  // A new result arrived after the user ran the check from the popup.
  useEffect(() => {
    if (!waitingForResult || healthCheck.status === null) return;
    const timeout = window.setTimeout(() => {
      setWaitingForResult(false);
      if (healthCheck.status === "empty") {
        runPendingAction();
        return;
      }
      if (healthCheck.status === "ok") {
        // Show "No problems found"; the dialog calls onContinue after its countdown.
        setDialogState("ok");
        return;
      }
      setDialogState(healthCheck.status === "error" ? "problems" : "warnings");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [healthCheck.status, waitingForResult, runPendingAction]);

  // Safety net: if the check fails (network error or timeout) the banner reports null
  // forever, so go back to the first prompt instead of spinning.
  useEffect(() => {
    if (!waitingForResult) return;
    const timeout = window.setTimeout(() => {
      setWaitingForResult(false);
      setDialogState("not_run");
    }, RESULT_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [waitingForResult, runToken]);

  const dialogProps: HealthCheckGateDialogProps = {
    open: dialogOpen,
    state: waitingForResult ? "running" : dialogState,
    errors: healthCheck.errors,
    warnings: healthCheck.warnings,
    onRunCheck,
    onViewIssues,
    onSkip,
    onContinue,
    onClose,
  };

  return { runToken, guard, dialogProps, reset };
}