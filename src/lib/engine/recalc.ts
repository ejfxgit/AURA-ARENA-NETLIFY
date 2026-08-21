import type { Direction, Factor, FactorName } from "../types";
import { clamp } from "../utils";

// ---------------------------------------------------------------------------
// Deterministic conviction / direction math.
// Factor.score = how strongly that factor supports the agent's directional
// stance (0-100, 50 = neutral). Conviction = confidence = the weighted average
// of the ELIGIBLE factors only (available + directional), with their weights
// renormalized. Unavailable and non-directional factors are displayed as
// evidence but never weighed — see directionalConviction().
// ---------------------------------------------------------------------------

export function normalizeWeights(factors: Factor[]): Factor[] {
  const total = factors.reduce((s, f) => s + f.weight, 0) || 1;
  return factors.map((f) => ({ ...f, weight: f.weight / total }));
}

/** Neutral conviction. Only ever used as a degenerate-input guard, never shown. */
const NEUTRAL_CONVICTION = 50;

/**
 * The factors that may legitimately move conviction: measured, directional, and
 * carrying weight. Everything else is evidence to display, not evidence to
 * weigh.
 */
export function eligibleFactors(factors: Factor[]): Factor[] {
  return factors.filter((f) => f.available && f.directional && f.weight > 0);
}

/**
 * Conviction (0-100) from available directional evidence ONLY, or null when
 * there is none.
 *
 * Weights are renormalized across the eligible factors so they sum to 1, which
 * is what makes the result "only available evidence": an unavailable factor
 * contributes no score AND surrenders its weight, rather than contributing the
 * neutral midpoint and quietly dragging conviction toward WAIT.
 *
 * Returns null rather than 50 when nothing is eligible. A fabricated midpoint
 * would be indistinguishable from a real neutral reading, so the caller is made
 * to handle the absence explicitly.
 */
export function directionalConviction(factors: Factor[]): number | null {
  const eligible = eligibleFactors(factors);
  const total = eligible.reduce((sum, f) => sum + f.weight, 0);
  if (eligible.length === 0 || total <= 0) return null;
  return eligible.reduce((sum, f) => sum + f.score * (f.weight / total), 0);
}

/**
 * Conviction for the challenge recalculation pipeline, which needs a number.
 *
 * Identical to directionalConviction(). The neutral fallback is unreachable for
 * real factor sets — momentum and volume are always measured — and exists only
 * so recalculate() is total. It is never used to present a signal to a user;
 * surfaces that must distinguish "no data" call directionalConviction().
 */
export function weightedScore(factors: Factor[]): number {
  return directionalConviction(factors) ?? NEUTRAL_CONVICTION;
}

// Conviction (0-100) → confidence in the stance.
export function convictionToConfidence(conviction: number): number {
  return Math.round(clamp(conviction, 0, 100));
}

// Map a directional stance + conviction to an actual position.
export function classifyDirection(
  stance: Exclude<Direction, "WAIT">,
  conviction: number,
): Direction {
  if (conviction >= 60) return stance;
  if (conviction >= 45) return "WAIT";
  return stance === "LONG" ? "SHORT" : "LONG";
}

export function opposite(d: Direction): Direction {
  if (d === "LONG") return "SHORT";
  if (d === "SHORT") return "LONG";
  return "WAIT";
}

// The stance is the underlying directional hypothesis, independent of whether
// current conviction is high enough to act on it.
export function stanceOf(direction: Direction): Exclude<Direction, "WAIT"> {
  return direction === "SHORT" ? "SHORT" : "LONG";
}

export interface RecalcInput {
  factors: Factor[];
  stance: Exclude<Direction, "WAIT">;
  attackedFactor: FactorName;
  challengeValidity: number; // 0-1
  evidenceQuality: number; // 0-100 (quality of the attacked signal's data)
  classify?: (stance: Exclude<Direction, "WAIT">, conviction: number) => Direction;
}

export interface RecalcResult {
  oldWeights: Factor[];
  newWeights: Factor[];
  oldConfidence: number;
  newConfidence: number;
  oldDirection: Direction;
  newDirection: Direction;
  reductionFraction: number;
  materiallyValid: boolean;
}

// Core deterministic recalculation. No randomness, no hardcoded outcomes.
export function recalculate(input: RecalcInput): RecalcResult {
  const { stance, attackedFactor, challengeValidity, evidenceQuality } = input;
  const classify = input.classify ?? classifyDirection;
  const oldWeights = normalizeWeights(input.factors);

  const oldConviction = weightedScore(oldWeights);
  const oldConfidence = convictionToConfidence(oldConviction);
  const oldDirection = classify(stance, oldConviction);

  // How much of the attacked factor's weight to strip:
  // valid challenges + low-quality underlying data => larger reduction.
  const reductionFraction = clamp(
    challengeValidity * (1 - evidenceQuality / 100),
    0,
    0.9,
  );

  const working = oldWeights.map((f) => ({ ...f }));
  const attacked = working.find((f) => f.name === attackedFactor);

  let newWeights = working;
  if (attacked) {
    const oldW = attacked.weight;
    const newW = oldW * (1 - reductionFraction);
    const removed = oldW - newW;
    attacked.weight = newW;

    // Penalize the attacked factor's score toward neutral (50): an unreliable
    // signal loses persuasive power.
    attacked.score = attacked.score + (50 - attacked.score) * reductionFraction;

    // Redistribute removed weight across the other factors, proportional to
    // their existing weight.
    const others = working.filter((f) => f.name !== attackedFactor);
    const otherTotal = others.reduce((s, f) => s + f.weight, 0);
    if (otherTotal > 0) {
      for (const f of others) {
        f.weight += removed * (f.weight / otherTotal);
      }
    }
    newWeights = normalizeWeights(working);
  }

  const newConviction = weightedScore(newWeights);
  const newConfidence = convictionToConfidence(newConviction);
  const newDirection = classify(stance, newConviction);

  const materiallyValid =
    challengeValidity >= 0.45 &&
    (Math.abs(oldConfidence - newConfidence) >= 3 ||
      oldDirection !== newDirection);

  return {
    oldWeights,
    newWeights,
    oldConfidence,
    newConfidence,
    oldDirection,
    newDirection,
    reductionFraction,
    materiallyValid,
  };
}

export const FACTOR_LABELS: Record<FactorName, string> = {
  momentum: "Momentum",
  volume: "Volume",
  social: "Social",
  whale_activity: "Whale activity",
  liquidity: "Liquidity",
  volatility: "Volatility",
};
