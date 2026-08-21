// Simple in-memory rate limiter (per key sliding window).
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false; // blocked
  }
  arr.push(now);
  hits.set(key, arr);
  return true; // allowed
}
