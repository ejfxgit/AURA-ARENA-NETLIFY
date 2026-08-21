// Per-caller request limiting for endpoints that cost money to serve.
//
// A model request is billable, so any route that can trigger one must not be an
// open tap. This is a fixed-window counter keyed by caller identity.
//
// Deliberately in-process: it needs no infrastructure and it bounds the common
// case (one client refreshing in a loop, or a page mounting repeatedly). On
// serverless the window is per instance rather than global, so it is a guard
// rather than a hard quota — the TTL on persisted decisions is what actually
// bounds total model spend, and this limit protects the path to it.

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Stops the map growing without bound in a long-lived process. */
function evictExpired(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available in the current window. */
  remaining: number;
  /** Seconds until the window resets. Suitable for a Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Counts one request against `key` and reports whether it may proceed.
 *
 * Call this once per request, after authentication, keyed by the authenticated
 * user id — never by IP alone, which is shared behind NAT and spoofable.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (windows.size > 500) evictExpired(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }
  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds };
}
