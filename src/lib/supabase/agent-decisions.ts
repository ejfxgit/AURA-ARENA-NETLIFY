import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { AgentDecision, AgentId, Direction, Thesis } from "../types";
import { getSupabaseAdmin } from "./server";

// Persistence for public.agent_decisions — the canonical current decision for
// each built-in agent in each market.
//
// This module only reads and writes. It does not decide when a decision is
// stale, does not call a model, and never invents a decision: if a row is
// absent, callers are handed `null` and must present that as "no decision"
// rather than substituting one. Freshness policy and generation live above this
// layer so there is exactly one place that can cause a model request.
//
// Reads go through the caller's own client (the table is world-readable).
// Writes go through the service role, because there is deliberately no client
// write policy — a decision must only ever originate from the server that
// obtained it from the model.

/** Shape of a public.agent_decisions row as PostgREST returns it. */
interface AgentDecisionRow {
  agent_id: string;
  symbol: string;
  decision: string;
  confidence: number;
  horizon_minutes: number;
  // numeric(24,8) arrives as a string from PostgREST.
  market_price: number | string;
  reasoning: string;
  thesis: Thesis;
  model: string;
  updated_at: string;
}

const SELECTED_COLUMNS =
  "agent_id, symbol, decision, confidence, horizon_minutes, market_price, reasoning, thesis, model, updated_at";

export type AgentDecisionStoreKind = "not_configured" | "migration_required" | "unavailable";

/**
 * A decision could not be read or written.
 *
 * Throws rather than resolving to null, because "this agent has no decision" and
 * "the decision store is unreachable" are different facts and the UI must not
 * report an outage as an agent having nothing to say.
 */
export class AgentDecisionStoreError extends Error {
  constructor(message: string, readonly kind: AgentDecisionStoreKind) {
    super(message);
    this.name = "AgentDecisionStoreError";
  }
}

/** Distinguishes a missing migration from a live database refusing the query. */
function storeError(error: PostgrestError, scope: string): AgentDecisionStoreError {
  // 42P01 undefined_table, PGRST205 unknown relation in the PostgREST schema cache.
  if (error.code === "42P01" || error.code === "PGRST205") {
    return new AgentDecisionStoreError(
      "The agent_decisions table is missing. Apply supabase/migrations/202608230001_agent_decisions.sql.",
      "migration_required",
    );
  }
  console.error(`[agent-decisions] ${scope} failed`, error);
  return new AgentDecisionStoreError("Unable to read agent decisions", "unavailable");
}

/**
 * Maps a row to the domain type, or null when the row cannot be trusted.
 *
 * The database constrains `decision` to LONG/SHORT/WAIT, so a value outside that
 * set means the row predates the constraint or was written out of band. It is
 * dropped rather than coerced: coercing an unknown value to WAIT would
 * manufacture the exact fake decision this system exists to avoid.
 */
function decisionFromRow(row: AgentDecisionRow): AgentDecision | null {
  const decision = row.decision as Direction;
  if (decision !== "LONG" && decision !== "SHORT" && decision !== "WAIT") {
    console.error("[agent-decisions] dropping row with unrecognised decision", {
      agentId: row.agent_id,
      symbol: row.symbol,
      decision: row.decision,
    });
    return null;
  }
  const marketPrice = Number(row.market_price);
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
    console.error("[agent-decisions] dropping row with unusable market price", {
      agentId: row.agent_id,
      symbol: row.symbol,
    });
    return null;
  }
  return {
    agentId: row.agent_id as AgentId,
    symbol: row.symbol,
    decision,
    confidence: row.confidence,
    horizonMinutes: row.horizon_minutes,
    marketPrice,
    reasoning: row.reasoning,
    thesis: row.thesis,
    model: row.model,
    decidedAt: row.updated_at,
  };
}

/**
 * The stored decision for one agent, market and horizon, or null when there is
 * none.
 *
 * Null means exactly "this agent has not published a decision for this market and
 * horizon". It is not a signal to invent one.
 */
export async function readAgentDecision(
  supabase: SupabaseClient,
  agentId: AgentId,
  symbol: string,
  horizonMinutes: number,
): Promise<AgentDecision | null> {
  const { data, error } = await supabase
    .from("agent_decisions")
    .select(SELECTED_COLUMNS)
    .eq("agent_id", agentId)
    .eq("symbol", symbol)
    .eq("horizon_minutes", horizonMinutes)
    .maybeSingle();
  if (error) throw storeError(error, `readAgentDecision ${agentId}/${symbol}/${horizonMinutes}`);
  if (!data) return null;
  return decisionFromRow(data as unknown as AgentDecisionRow);
}

/**
 * Every stored decision for one market and horizon, keyed by agent id.
 *
 * One query for the whole roster: the agents page renders six cards, and six
 * round trips to render one grid is a cost the page pays on every view. Agents
 * with no stored decision are simply absent from the map — the caller reports
 * that as "no decision", never as a default.
 */
export async function readAgentDecisionsForSymbol(
  supabase: SupabaseClient,
  symbol: string,
  horizonMinutes: number,
): Promise<Map<AgentId, AgentDecision>> {
  const { data, error } = await supabase
    .from("agent_decisions")
    .select(SELECTED_COLUMNS)
    .eq("symbol", symbol)
    .eq("horizon_minutes", horizonMinutes);
  if (error) throw storeError(error, `readAgentDecisionsForSymbol ${symbol}/${horizonMinutes}`);
  const byAgent = new Map<AgentId, AgentDecision>();
  for (const row of (data ?? []) as unknown as AgentDecisionRow[]) {
    const decision = decisionFromRow(row);
    if (decision) byAgent.set(decision.agentId, decision);
  }
  return byAgent;
}

/** A decision the server has just obtained from the model and validated. */
export interface AgentDecisionWrite {
  agentId: AgentId;
  symbol: string;
  decision: Direction;
  confidence: number;
  horizonMinutes: number;
  marketPrice: number;
  reasoning: string;
  thesis: Thesis;
  model: string;
}

/**
 * Stores a freshly produced decision, replacing that agent's previous one for
 * the same market.
 *
 * Uses the service role because the table has no client write policy. Callers
 * must only reach this after a model returned a valid, normalized decision —
 * there is no code path that writes a decision on failure, which is what keeps a
 * model outage from ever being recorded as WAIT.
 *
 * `updated_at` is deliberately NOT sent. On insert the column default applies;
 * on conflict the upsert performs an UPDATE, which fires the
 * agent_decisions_set_updated_at trigger. Either way the decision time comes
 * from the database clock, so it cannot be backdated by a caller to make a stale
 * decision look fresh. The returned record carries the timestamp the database
 * assigned.
 */
export async function writeAgentDecision(write: AgentDecisionWrite): Promise<AgentDecision> {
  const admin = getSupabaseAdmin();
  const payload = {
    agent_id: write.agentId,
    symbol: write.symbol,
    decision: write.decision,
    confidence: Math.round(write.confidence),
    horizon_minutes: write.horizonMinutes,
    market_price: write.marketPrice,
    reasoning: write.reasoning,
    thesis: write.thesis,
    model: write.model,
  };

  // Look up by (agent_id, symbol) — exactly the columns covered by the unique
  // constraint agent_decisions_unique_agent_symbol. Do NOT include horizon_minutes
  // in this check: the constraint does not cover it, so matching on all three
  // columns can miss an existing row and fall through to a duplicate INSERT
  // (PostgreSQL error 23505).
  const { data: existing, error: readErr } = await admin
    .from("agent_decisions")
    .select("id")
    .eq("agent_id", write.agentId)
    .eq("symbol", write.symbol)
    .maybeSingle();
  if (readErr) throw storeError(readErr, `writeAgentDecision read ${write.agentId}/${write.symbol}`);

  let data: AgentDecisionRow | null = null;
  if (existing) {
    // Row exists — update it in place. The agent_decisions_set_updated_at trigger
    // fires on UPDATE and sets updated_at from the database clock, so the
    // decision time cannot be backdated by any caller.
    const { data: updated, error: updateErr } = await admin
      .from("agent_decisions")
      .update(payload)
      .eq("id", existing.id)
      .select(SELECTED_COLUMNS)
      .single();
    if (updateErr) throw storeError(updateErr, `writeAgentDecision update ${write.agentId}/${write.symbol}`);
    data = updated as unknown as AgentDecisionRow;
  } else {
    // No row yet — insert. created_at/updated_at come from column defaults.
    const { data: inserted, error: insertErr } = await admin
      .from("agent_decisions")
      .insert(payload)
      .select(SELECTED_COLUMNS)
      .single();
    if (insertErr) throw storeError(insertErr, `writeAgentDecision insert ${write.agentId}/${write.symbol}`);
    data = inserted as unknown as AgentDecisionRow;
  }

  if (!data) {
    throw new AgentDecisionStoreError(
      "The stored decision could not be read back",
      "unavailable",
    );
  }
  const stored = decisionFromRow(data);
  if (!stored) {
    throw new AgentDecisionStoreError(
      "The stored decision could not be read back",
      "unavailable",
    );
  }
  return stored;
}

