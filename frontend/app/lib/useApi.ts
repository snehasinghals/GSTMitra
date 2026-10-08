"use client";

import useSWR, { KeyedMutator } from "swr";
import { apiFetch } from "./api";
import { useAuth } from "../context/AuthContext";

async function fetcher<T>(key: [string, string]): Promise<T> {
  const [path] = key;
  const { data, error } = await apiFetch<T>(path);
  if (error || data === undefined) throw new Error(error || "No data returned");
  return data;
}

export interface UseApiResult<T> {
  data: T | undefined;
  /** Set when the request (or the initial login/context fetch) failed. */
  error: Error | undefined;
  /** true ONLY while there is nothing to show yet (first visit). Revisits show cached data instantly. */
  loading: boolean;
  /** true while a silent background refresh is running. */
  refreshing: boolean;
  mutate: KeyedMutator<T>;
}

/**
 * Stale-while-revalidate data hook.
 * - Cached data shows instantly when you come back to a page, then refreshes silently.
 * - Cache key includes the business id, so one account never sees another account's cached data.
 * - Waits for AuthContext before fetching, so `loading` stays true until we truly know the answer.
 */
export function useApi<T>(path: string): UseApiResult<T> {
  const { business, loading: authLoading, authError } = useAuth();

  const key: [string, string] | null = business?.id ? [path, business.id] : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<T, Error>(
    key,
    (k) => fetcher<T>(k as [string, string]),
    {
      keepPreviousData: true,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }
  );

  // If /auth/me itself failed (server down), surface that instead of a fake "empty" state.
  const effectiveError = error ?? (authError && !business ? new Error(authError) : undefined);

  return {
    data,
    error: effectiveError,
    loading: authLoading || isLoading,
    refreshing: isValidating,
    mutate,
  };
}