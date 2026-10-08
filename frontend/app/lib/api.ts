export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

export type ApiResult<T> = {
  data?: T;
  error?: string;
  /** HTTP status. 0 = network failure / timeout (no response received). */
  status: number;
};

export async function downloadFile(endpoint: string, filename: string): Promise<void> {
  const token = typeof window !== "undefined" ? localStorage.getItem("gstmitra_token") : null;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const message = contentType.includes("application/json")
      ? (await response.json()).error
      : `Download failed (${response.status}).`;
    throw new Error(message || `Download failed (${response.status}).`);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const token = typeof window !== "undefined" ? localStorage.getItem("gstmitra_token") : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // Only send Content-Type when there is a body (keeps GET requests simpler).
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(15000),
    });

    if (response.status === 401) {
      // Session expired -> go to login. On the login page itself a 401 just means
      // "wrong password", so fall through and return the server's message.
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        localStorage.removeItem("gstmitra_token");
        window.location.href = "/login";
        return { error: "Session expired. Please log in again.", status: 401 };
      }
    }

    // Guard against non-JSON responses (e.g. HTML 404 pages)
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return {
        error: `Server returned non-JSON response (${response.status}). Is the backend running?`,
        status: response.status,
      };
    }

    const json = await response.json();

    if (!response.ok) {
      return {
        error: json.error || `Request failed with status ${response.status}`,
        status: response.status,
      };
    }

    return { data: json, status: response.status };
  } catch (err: any) {
    console.error("API error:", err);
    if (err?.name === "TimeoutError") {
      return { error: "The server took too long to respond. Please try again.", status: 0 };
    }
    return { error: "Failed to connect to GSTMitra server. Please check connection.", status: 0 };
  }
}