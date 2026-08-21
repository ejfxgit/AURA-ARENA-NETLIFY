import type { AgentDecision, AgentDecisionState } from "../types";
import { DEFAULT_BATTLE_DURATION_SECONDS } from "../battle/timing";

// Freshness policy for persisted agent decisions.
//
// Pure and shared: the API route, the arena UI and the battle route all decide
// "is this decision still current?" with the same function, so a card cannot
// claim a decision is live while the battle route considers it stale.

/**
 * The market the agent cards publish a decision for.
 *
 * Cards need ONE market so the roster costs a bounded number of model requests
 * per refresh window rather than one per market anyone happens to view. Battles
 * are not restricted to it — a battle asks for a decision on its own market, via
 * the same store and the same service.
 */
export const CANONICAL_DECISION_SYMBOL = "BTC-USDT";

/**
 * The horizon the cards publish, in minutes.
 *
 * Matches the default battle duration so the decision a card shows is directly
 * usable by the battle a user is most likely to start from it.
 */
export const CANONICAL_DECISION_HORIZON_MINUTES = DEFAULT_BATTLE_DURATION_SECONDS / 60;

/**
 * How long a decision stays current.
 *
 * Ten minutes is deliberately longer than the 5-minute canonical horizon: it
 * bounds cost to at most one model request per agent per window across the whole
 * platform, and a decision that has just expired is still shown — labelled with
 * its real age — rather than being replaced by a placeholder.
 */
export const DECISION_TTL_MS = 10 * 60 * 1000;

/** Age of a decision in milliseconds, or null when its timestamp is unusable. */
export function decisionAgeMs(decision: AgentDecision, now = Date.now()): number | null {
  const decidedAt = new Date(decision.decidedAt).getTime();
  if (!Number.isFinite(decidedAt)) return null;
  return Math.max(0, now - decidedAt);
}

/** True when this decision is older than the refresh window. */
export function isDecisionStale(decision: AgentDecision, now = Date.now()): boolean {
  const age = decisionAgeMs(decision, now);
  // An unreadable timestamp cannot be shown to be fresh, so it counts as stale.
  if (age === null) return true;
  return age > DECISION_TTL_MS;
}

/**
 * Classifies what a surface knows, from a possibly-absent stored decision.
 *
 * `stale` deliberately keeps carrying the decision: the product shows the last
 * real decision with its real age rather than hiding it, which is honest, while
 * still never claiming it is current.
 */
export function decisionState(
  decision: AgentDecision | null,
  now = Date.now(),
): AgentDecisionState {
  if (!decision) return { status: "missing" };
  return isDecisionStale(decision, now)
    ? { status: "stale", decision }
    : { status: "ready", decision };
}

/** Compact relative age for the UI, e.g. "12s ago" / "4 min ago". */
export function formatDecisionAge(decision: AgentDecision, now = Date.now()): string {
  const age = decisionAgeMs(decision, now);
  if (age === null) return "unknown";
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
