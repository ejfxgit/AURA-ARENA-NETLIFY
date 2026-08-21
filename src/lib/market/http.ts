// Shared HTTP helpers for the market routes.
//
// One rule: an upstream failure becomes a real error response. It is never
// converted into a 200 carrying invented market values.

import { NextResponse } from "next/server";
import { MarketDataError, type MarketErrorKind } from "./okx-types";

export interface MarketErrorBody {
  error: { kind: MarketErrorKind; message: string; upstreamCode?: string };
  fetchedAt: string;
}

/**
 * Maps a thrown error to a JSON response with a truthful status code.
 *
 * Only MarketDataError messages are forwarded, because those are written for
 * users and contain no credentials. Anything else is logged server-side and
 * reported generically so an unexpected exception cannot leak internals.
 */
export function marketErrorResponse(error: unknown, scope: string): NextResponse<MarketErrorBody> {
  const fetchedAt = new Date().toISOString();

  if (error instanceof MarketDataError) {
    console.error(`[markets] ${scope} failed: ${error.kind} — ${error.message}`);
    return NextResponse.json(
      {
        error: { kind: error.kind, message: error.message, upstreamCode: error.upstreamCode },
        fetchedAt,
      },
      { status: error.status },
    );
  }

  console.error(`[markets] ${scope} unexpected failure`, error);
  return NextResponse.json(
    {
      error: {
        kind: "unknown_instrument" as MarketErrorKind,
        message: "Market data unavailable.",
      },
      fetchedAt,
    },
    { status: 503 },
  );
}

/** Parses a bounded positive integer query parameter. */
export function intParam(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = params.get(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
