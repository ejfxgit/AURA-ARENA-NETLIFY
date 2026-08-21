import { NextResponse } from "next/server";
import { z } from "zod";
import { getWalletAuth } from "@/lib/supabase/aura";
import { rateLimit } from "@/lib/api/rate-limit";
import { serviceErrorResponse } from "@/lib/api-error";
import { assetBySymbol } from "@/lib/market/adapter";
import { AgentDecisionStoreError } from "@/lib/supabase/agent-decisions";
import {
  readRosterDecisionStates,
  refreshRosterDecisions,
} from "@/lib/agents/decision-service";
import {
  CANONICAL_DECISION_HORIZON_MINUTES,
  CANONICAL_DECISION_SYMBOL,
} from "@/lib/agents/decisions";

export const dynamic = "force-dynamic";

/**
 * The canonical agent decisions the agent cards render.
 *
 * GET is free: one database query, no model requests, so a page view or a poll
 * costs nothing. It returns each agent's state as `ready`, `stale` or `missing` —
 * never a fabricated decision. A `missing` agent is one that has genuinely never
 * published a decision for this market and horizon.
 *
 * POST refreshes agents whose decision is missing or past its TTL, which is the
 * only path in the product that can bill a model request for a card. It is
 * therefore authenticated AND rate limited, and concurrent callers are
 * deduplicated inside the decision service.
 *
 * Performance statistics are deliberately absent from this response. They come
 * from the settled-battle aggregation behind /api/leaderboard, and duplicating
 * them here would create a second source for the same numbers.
 */

const querySchema = z.object({
  symbol: z.string().min(1).optional(),
  horizonMinutes: z.coerce.number().int().positive().optional(),
});

/** Refreshing the roster can issue one model request per agent, so keep it low. */
const REFRESH_LIMIT = 4;
const REFRESH_WINDOW_MS = 60_000;

function resolveTarget(symbol: string | undefined, horizonMinutes: number | undefined) {
  const requested = symbol?.toUpperCase() ?? CANONICAL_DECISION_SYMBOL;
  const def = assetBySymbol(requested);
  if (!def) return null;
  return {
    symbol: def.instId,
    horizonMinutes: horizonMinutes ?? CANONICAL_DECISION_HORIZON_MINUTES,
  };
}

/**
 * Reports a decision-store failure as what it actually is.
 *
 * The store already separates "the table is not there" from "the database
 * refused the query", and that distinction is the whole diagnostic value of the
 * error: one is fixed by applying a migration and will never succeed on retry,
 * the other is a transient outage worth retrying. Collapsing both into a generic
 * `database_unavailable` — as this route previously did — is what made a missing
 * migration surface as an unexplained 503.
 */
function decisionStoreFailure(error: unknown, scope: string, fallbackMessage: string) {
  if (error instanceof AgentDecisionStoreError) {
    const migration = error.kind === "migration_required";
    return serviceErrorResponse({
      error,
      scope,
      // The store's message names the migration to apply, so pass it through
      // instead of replacing it with a vaguer one.
      message: error.message,
      kind: migration ? "migration_required" : "database_unavailable",
      // A missing table does not heal on its own; a client retry loop cannot fix
      // it and should not be invited.
      retryable: !migration,
    });
  }
  return serviceErrorResponse({
    error,
    scope,
    message: fallbackMessage,
    kind: "database_unavailable",
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    symbol: url.searchParams.get("symbol") ?? undefined,
    horizonMinutes: url.searchParams.get("horizonMinutes") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision request" }, { status: 400 });
  }
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const target = resolveTarget(parsed.data.symbol, parsed.data.horizonMinutes);
  if (!target) return NextResponse.json({ error: "Unknown market" }, { status: 404 });

  try {
    const decisions = await readRosterDecisionStates(
      auth.supabase,
      target.symbol,
      target.horizonMinutes,
    );
    return NextResponse.json({ ...target, decisions });
  } catch (error) {
    return decisionStoreFailure(
      error,
      "GET /api/agents/decisions",
      "Unable to read agent decisions",
    );
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = querySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision request" }, { status: 400 });
  }
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const limit = rateLimit(`agent-decisions:${auth.user.id}`, REFRESH_LIMIT, REFRESH_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many decision refreshes. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const target = resolveTarget(parsed.data.symbol, parsed.data.horizonMinutes);
  if (!target) return NextResponse.json({ error: "Unknown market" }, { status: 404 });

  try {
    const results = await refreshRosterDecisions(
      auth.supabase,
      target.symbol,
      target.horizonMinutes,
    );
    // Per-agent failures are reported alongside the agents that succeeded, so one
    // model outage does not blank the whole roster.
    const decisions = Object.fromEntries(results.map((row) => [row.agentId, row.state]));
    const errors = Object.fromEntries(
      results.filter((row) => row.error).map((row) => [row.agentId, row.error]),
    );
    return NextResponse.json({ ...target, decisions, errors });
  } catch (error) {
    return decisionStoreFailure(
      error,
      "POST /api/agents/decisions",
      "Unable to refresh agent decisions",
    );
  }
}
