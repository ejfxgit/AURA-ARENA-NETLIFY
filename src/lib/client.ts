"use client";

import { getSupabaseBrowserClient } from "./supabase/browser";

// Client-side identity + tiny fetch helpers. The demo user id lives in
// localStorage so the same browser keeps its demo account & history.

const UID_KEY = "aura_uid";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * The parsed error response, so callers can read structured details such as
     * which environment variables a route reported as missing. Route handlers
     * only ever put variable NAMES here, never values.
     */
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getUserId(): string {
  if (typeof window === "undefined") return "guest";
  let id = localStorage.getItem(UID_KEY);
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(UID_KEY, id);
  }
  return id;
}

export function setUserId(id: string): void {
  if (typeof window !== "undefined" && id) localStorage.setItem(UID_KEY, id);
}

export async function api<T>(
  path: string,
  opts?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<T> {
  const supabase = getSupabaseBrowserClient();
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const headers = {
    ...(opts?.body ? { "Content-Type": "application/json" } : {}),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...opts?.headers,
  };
  const res = await fetch(path, {
    method: opts?.method || "GET",
    headers: Object.keys(headers).length ? headers : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Routes report failures either as { error: "text" } or as the market
    // routes' richer { error: { message, kind, ... } }.
    const payload = data as { error?: string | { message?: string } };
    const message =
      typeof payload.error === "string"
        ? payload.error
        : payload.error?.message || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}
