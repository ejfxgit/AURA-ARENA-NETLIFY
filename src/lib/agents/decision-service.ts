import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentDecision, AgentDecisionState, AgentId } from "../types";
import { AGENT_LIST } from "../agents";
import { assetBySymbol, getSnapshot, getCandles } from "../market/adapter";
import { generateThesis } from "../ai/thesis";
import {
  readAgentDecision,
  readAgentDecisionsForSymbol,
  writeAgentDecision,
} from "../supabase/agent-decisions";
import { decisionState, isDecisionStale } from "./decisions";

// Generation and refresh for canonical agent decisions.
//
// This is the ONLY module that may cause a model request for an agent decision.
// Everything else reads what is stored. That is what keeps the agent card, the
// battle route and the settlement record showing one decision instead of three.
//
// The pipeline, in order:
//
//   AURA agent (roster identity + strategy)
//     -> generateThesis()  — builds the agent-specific briefing, calls the model
//     -> requestDecision() — normalizes the model's word to LONG/SHORT/WAIT
//     -> writeAgentDecision()            — persists it
//     -> readAgentDecision*()            — every surface reads from here
//
// A failure anywhere in that chain propagates. Nothing in this module writes a
// decision on failure, so a model outage, a timeout or an unparseable response
// can never be recorded — and therefore never displayed — as an agent choosing
// to WAIT. WAIT is stored only when the model actually returned it.

/**
 * In-flight generations, keyed by agent/symbol/horizon.
 *
 * Six cards refreshing at once, or several users viewing the same page, must not
 * each bill a model request for the same question. Concurrent callers await the
 * same promise and the second one costs nothing.
 *
 * Per-instance by nature. On serverless that means one in-flight request per
 * instance rather than globally, which is why the TTL check against the shared
 * database — not this map — is the real cost bound.
 */
const inFlight = new Map<string, Promise<AgentDecision>>();

function key(agentId: AgentId, symbol: string, horizonMinutes: number): string {
  return `${agentId}:${symbol}:${horizonMinutes}`;
}

/**
 * Asks the agent to decide, then persists the result.
 *
 * Deliberately has no try/catch: an AiError or a market outage must reach the
 * caller so it can report an unavailable decision. Swallowing it here is exactly
 * how a fabricated WAIT would get written.
 */
async function generateAndStore(
  agentId: AgentId,
  symbol: string,
  horizonMinutes: number,
): Promise<AgentDecision> {
  const def = assetBySymbol(symbol);
  if (!def) throw new Error(`Unknown market ${symbol}`);

  // Real OKX state only. If the feed is unavailable the decision is not made at
  // all, because a decision attributed to an invented price is worthless.
  const [snapshot, candles] = await Promise.all([getSnapshot(def), getCandles(def, 100)]);

  // The agent-specific briefing (identity, personality, voice, strategy,
  // specialty, focus) is built inside generateThesis from the roster entry, so
  // the six agents ask the model six different questions.
  const thesis = await generateThesis(agentId, snapshot, candles, horizonMinutes);

  return writeAgentDecision({
    agentId,
    symbol: def.instId,
    decision: thesis.direction,
    confidence: thesis.confidence,
    horizonMinutes,
    marketPrice: snapshot.price,
    reasoning: thesis.summary,
    thesis,
    model: thesis.decision?.model ?? "unknown",
  });
}

/**
 * The current decision for one agent, refreshing it only when it is missing or
 * past its TTL.
 *
 * Returns the persisted record, which is the same row every other surface reads.
 * Throws when no valid decision could be obtained — the caller decides how to
 * present that, and must not substitute one.
 */
export async function ensureAgentDecision(
  supabase: SupabaseClient,
  agentId: AgentId,
  symbol: string,
  horizonMinutes: number,
): Promise<AgentDecision> {
  const stored = await readAgentDecision(supabase, agentId, symbol, horizonMinutes);
  if (stored && !isDecisionStale(stored)) return stored;

  const cacheKey = key(agentId, symbol, horizonMinutes);
  const running = inFlight.get(cacheKey);
  if (running) return running;

  const pending = generateAndStore(agentId, symbol, horizonMinutes).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, pending);
  return pending;
}

/**
 * Reads the whole roster's decisions for one market without generating anything.
 *
 * Cheap and always safe to call on a page view: one query, no model requests. An
 * agent with nothing stored comes back as `missing`, and a decision past its TTL
 * comes back as `stale` while still carrying its last real value so the UI can
 * show it with its true age.
 */
export async function readRosterDecisionStates(
  supabase: SupabaseClient,
  symbol: string,
  horizonMinutes: number,
): Promise<Record<AgentId, AgentDecisionState>> {
  const byAgent = await readAgentDecisionsForSymbol(supabase, symbol, horizonMinutes);
  const now = Date.now();
  const states = {} as Record<AgentId, AgentDecisionState>;
  for (const agent of AGENT_LIST) {
    states[agent.id] = decisionState(byAgent.get(agent.id) ?? null, now);
  }
  return states;
}

/** One agent's refresh outcome. A failure is reported, never turned into WAIT. */
export interface RosterRefreshResult {
  agentId: AgentId;
  state: AgentDecisionState;
  /** Why this agent has no current decision, when it does not. */
  error: string | null;
}

/**
 * Brings every agent's decision up to date for one market.
 *
 * Agents are refreshed concurrently and independently: one agent's model failure
 * leaves the others' decisions intact and is reported against that agent alone,
 * rather than failing the whole roster. Agents already inside the TTL are not
 * re-requested, so a second caller in the same window costs nothing.
 */
export async function refreshRosterDecisions(
  supabase: SupabaseClient,
  symbol: string,
  horizonMinutes: number,
): Promise<RosterRefreshResult[]> {
  return Promise.all(
    AGENT_LIST.map(async (agent): Promise<RosterRefreshResult> => {
      try {
        const decision = await ensureAgentDecision(supabase, agent.id, symbol, horizonMinutes);
        return { agentId: agent.id, state: decisionState(decision), error: null };
      } catch (error) {
        // Kept per-agent and surfaced as an explicit absence. The previous
        // decision, if any, is still returned by the read below.
        const message = error instanceof Error ? error.message : "Decision unavailable";
        console.error(`[agent-decisions] refresh failed for ${agent.id}/${symbol}`, error);
        const stored = await readAgentDecision(supabase, agent.id, symbol, horizonMinutes).catch(
          () => null,
        );
        return { agentId: agent.id, state: decisionState(stored), error: message };
      }
    }),
  );
}
