// Shared HTTP helper for the AI routes, mirroring lib/market/http.ts.
//
// One rule, the same as the market layer's: a failure to obtain a real decision
// becomes a real error response. It is never converted into a 200 carrying an
// invented direction, confidence or reasoning.

import { NextResponse } from "next/server";
import { AiError, type AiFailureKind } from "./openrouter";

export interface AiErrorBody {
  error: { kind: AiFailureKind; message: string };
  fetchedAt: string;
}

/**
 * Maps an AiError to a JSON response, or returns null when the error is not an
 * AI failure so the caller can fall through to its own handling (typically
 * marketErrorResponse).
 *
 * AI_UNAVAILABLE is 503 — the dependency could not be reached, retrying may work.
 * INVALID_AI_RESPONSE is 502 — the dependency answered with something unusable.
 * The two are deliberately distinguishable by both status and kind.
 */
export function aiErrorResponse(error: unknown, scope: string): NextResponse<AiErrorBody> | null {
  if (!(error instanceof AiError)) return null;
  console.error(`[ai] ${scope} failed: ${error.kind} — ${error.message}`);
  return NextResponse.json(
    {
      error: { kind: error.kind, message: error.message },
      fetchedAt: new Date().toISOString(),
    },
    { status: error.kind === "AI_UNAVAILABLE" ? 503 : 502 },
  );
}
