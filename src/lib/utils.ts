import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtUsd(n: number, opts?: { sign?: boolean; dp?: number }): string {
  const dp = opts?.dp ?? (Math.abs(n) > 0 && Math.abs(n) < 1 ? 4 : 2);
  const s = n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  const prefix = opts?.sign && n > 0 ? "+$" : n < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(n) === n ? s : s.replace("-", "")}`;
}

export function fmtPct(n: number, sign = true): string {
  const s = n.toFixed(2);
  return `${sign && n > 0 ? "+" : ""}${s}%`;
}

export function fmtCompact(n: number): string {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function shortHash(hash: string | null | undefined, chars = 6): string {
  if (!hash) return "—";
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function directionColor(d: string): string {
  if (d === "LONG") return "text-aura-long";
  if (d === "SHORT") return "text-aura-short";
  return "text-aura-wait";
}

export function pnlColor(n: number): string {
  if (n > 0) return "text-aura-long";
  if (n < 0) return "text-aura-short";
  return "text-white/60";
}

export function uid(prefix = ""): string {
  const s =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${s}` : s;
}

// -- null-safe formatters ---------------------------------------------------
//
// A market value the upstream API did not supply is null, and must render as an
// explicit dash. Coercing it to 0 would display a fabricated number.

export const NA = "—";

/**
 * Price formatter that keeps precision on low-priced assets. Crypto spans many
 * orders of magnitude, so a fixed 2dp would show sub-cent tokens as "$0.00".
 */
export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  const abs = Math.abs(n);
  const dp = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: dp })}`;
}

export function fmtPctOrNa(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return fmtPct(n);
}

export function fmtCompactOrNa(n: number | null | undefined, prefix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return `${prefix}${fmtCompact(n)}`;
}

/** Colour for a possibly-unknown delta. Unknown is neutral, never green. */
export function pnlColorOrNa(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "text-white/40";
  return pnlColor(n);
}

/**
 * Renders a market identifier as its real traded pair.
 *
 * Accepts an OKX instrument id ("BTC-USDT") or a bare base currency ("BTC").
 * The quote currency is shown only when it is actually part of the identifier,
 * so a label can never claim a quote the price did not come from.
 */
export function formatPair(asset: string | null | undefined): string {
  if (!asset) return NA;
  const [base, quote] = asset.toUpperCase().split("-");
  if (!base) return NA;
  return quote ? `${base} / ${quote}` : base;
}

/** "3s ago" / "2m ago" from an ISO timestamp. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return NA;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return NA;
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
