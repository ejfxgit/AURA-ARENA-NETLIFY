// Custom-agent strategy math. PURE and CLIENT-SAFE.
//
// Extracted from ./custom-thesis.ts so both sides can share ONE implementation:
//   * the server uses it to build the thesis persisted with a battle
//   * the browser uses it to recompute the same agent's live signal against the
//     live market stream (see lib/market/live-signal.ts)
//
// Keeping a single copy is the point. Two implementations of "confidence" would
// drift, and the agent panel would disagree with the stored battle for no
// visible reason.
//
// This module deliberately imports NO server dependency — no openrouter, no
// serverConfig, no node builtins — so it can be bundled for the browser.

import type {
  CustomAgent,
  CustomAgentBattleSnapshot,
  CustomAgentDecisionBehavior,
  CustomAgentInformationFocus,
  CustomAgentRiskStyle,
  CustomAgentSpecialty,
  CustomAgentTradingFocus,
  Direction,
  Factor,
  FactorName,
  RiskLevel,
} from "../types";
import type { MarketSignals } from "./factors";
import { DIRECTIONAL_FACTORS } from "./factors";
import { factorDataAvailable } from "../evidence/engine";
import { normalizeWeights } from "../engine/recalc";
import { clamp } from "../utils";

export const FACTORS: FactorName[] = [
  "momentum",
  "volume",
  "social",
  "whale_activity",
  "liquidity",
  "volatility",
];

export const SPECIALTY_WEIGHTS: Record<CustomAgentSpecialty, Record<FactorName, number>> = {
  MOMENTUM: { momentum: 0.31, volume: 0.24, social: 0.08, whale_activity: 0.08, liquidity: 0.18, volatility: 0.11 },
  NEWS_SENTIMENT: { momentum: 0.14, volume: 0.12, social: 0.34, whale_activity: 0.08, liquidity: 0.22, volatility: 0.1 },
  STATISTICAL: { momentum: 0.2, volume: 0.2, social: 0.08, whale_activity: 0.13, liquidity: 0.19, volatility: 0.2 },
  ONCHAIN: { momentum: 0.12, volume: 0.12, social: 0.07, whale_activity: 0.38, liquidity: 0.2, volatility: 0.11 },
  LIQUIDITY: { momentum: 0.1, volume: 0.24, social: 0.06, whale_activity: 0.14, liquidity: 0.36, volatility: 0.1 },
  ANOMALY: { momentum: 0.24, volume: 0.2, social: 0.11, whale_activity: 0.09, liquidity: 0.17, volatility: 0.19 },
};

const TRADING_BOOSTS: Record<CustomAgentTradingFocus, Partial<Record<FactorName, number>>> = {
  MOMENTUM: { momentum: 0.16 },
  TREND_FOLLOWING: { momentum: 0.13, volume: 0.04 },
  BREAKOUT: { momentum: 0.11, volume: 0.08, volatility: 0.05 },
  MEAN_REVERSION: { momentum: 0.14, volatility: 0.06 },
  SCALPING: { momentum: 0.08, liquidity: 0.09, volatility: 0.06 },
  SWING_TRADING: { momentum: 0.08, volume: 0.05, liquidity: 0.04 },
  VOLATILITY: { volatility: 0.16 },
  VOLUME: { volume: 0.16 },
  LIQUIDITY: { liquidity: 0.16 },
  ORDER_FLOW: { volume: 0.08, liquidity: 0.12 },
  WHALE_ACTIVITY: { whale_activity: 0.18 },
};

export const INFORMATION_FACTORS: Record<CustomAgentInformationFocus, FactorName | null> = {
  PRICE_ACTION: "momentum",
  MOMENTUM: "momentum",
  VOLUME: "volume",
  VOLATILITY: "volatility",
  LIQUIDITY: "liquidity",
  ORDER_BOOK: "liquidity",
  WHALE_ACTIVITY: "whale_activity",
  SOCIAL_SENTIMENT: "social",
  NEWS: null,
  MACRO_EVENTS: null,
  TECHNICAL_INDICATORS: "momentum",
  MARKET_STRUCTURE: "liquidity",
};

function addBoost(weights: Record<FactorName, number>, boost: Partial<Record<FactorName, number>>) {
  for (const [factor, value] of Object.entries(boost) as [FactorName, number][]) weights[factor] += value;
}

function instructionBoosts(instructions: string): Partial<Record<FactorName, number>> {
  const text = instructions.toLowerCase();
  const boosts: Partial<Record<FactorName, number>> = {};
  const add = (factor: FactorName, value = 0.08) => { boosts[factor] = (boosts[factor] ?? 0) + value; };
  if (/momentum|trend|breakout|price action|technical/.test(text)) add("momentum");
  if (/volume|order flow/.test(text)) add("volume");
  if (/liquidity|order book|market structure|depth|spread/.test(text)) add("liquidity");
  if (/volatility|scalp|quick/.test(text)) add("volatility");
  if (/whale|onchain|on-chain|wallet/.test(text)) add("whale_activity");
  if (/social|sentiment/.test(text)) add("social");
  return boosts;
}

export function decisionThreshold(
  riskStyle: CustomAgentRiskStyle,
  behaviors: CustomAgentDecisionBehavior[],
): number {
  let threshold = riskStyle === "CONSERVATIVE" ? 68 : riskStyle === "AGGRESSIVE" ? 54 : 60;
  if (behaviors.includes("HIGH_CONFIDENCE")) threshold += 7;
  if (behaviors.includes("TRADE_SELECTIVELY")) threshold += 4;
  if (behaviors.includes("WAIT_CONFIRMATION")) threshold += 5;
  if (behaviors.includes("TRADE_FREQUENTLY")) threshold -= 7;
  if (behaviors.includes("REACT_QUICKLY")) threshold -= 4;
  return clamp(threshold, 48, 80);
}

function configuredDirection(
  stance: Exclude<Direction, "WAIT">,
  conviction: number,
  riskStyle: CustomAgentRiskStyle,
  behaviors: CustomAgentDecisionBehavior[],
): Direction {
  const threshold = decisionThreshold(riskStyle, behaviors);
  if (conviction >= threshold) return stance;
  if (conviction >= threshold - 15) return "WAIT";
  return stance === "LONG" ? "SHORT" : "LONG";
}

export function customAgentDirectionForConviction(
  agent: CustomAgent | CustomAgentBattleSnapshot,
  stance: Exclude<Direction, "WAIT">,
  conviction: number,
): Direction {
  return configuredDirection(stance, conviction, agent.riskStyle, agent.decisionBehaviors);
}

export function configuredRiskLevel(riskStyle: CustomAgentRiskStyle): RiskLevel {
  if (riskStyle === "CONSERVATIVE") return "LOW";
  if (riskStyle === "AGGRESSIVE") return "HIGH";
  return "MEDIUM";
}

export function configuredWeights(
  agent: CustomAgent | CustomAgentBattleSnapshot,
): Record<FactorName, number> {
  const weights = { ...SPECIALTY_WEIGHTS[agent.tradingSpecialty] };
  agent.tradingFocus.forEach((focus) => addBoost(weights, TRADING_BOOSTS[focus]));
  agent.informationFocus.forEach((focus) => {
    const factor = INFORMATION_FACTORS[focus];
    if (factor) weights[factor] += 0.07;
  });
  if (agent.socialSentiment) weights.social += 0.09;
  if (agent.onchainActivity) weights.whale_activity += 0.08;
  if (agent.whaleMovements) weights.whale_activity += 0.1;
  addBoost(weights, instructionBoosts(agent.customInstructions));

  if (
    !agent.socialSentiment &&
    !agent.informationFocus.includes("SOCIAL_SENTIMENT") &&
    agent.newsPreference === "IGNORE"
  ) {
    weights.social = 0;
  }
  return weights;
}

export function buildConfiguredFactors(
  agent: CustomAgent | CustomAgentBattleSnapshot,
  signals: MarketSignals,
): { factors: Factor[]; stance: Exclude<Direction, "WAIT"> } {
  const weights = configuredWeights(agent);
  const meanReversion = agent.tradingFocus.includes("MEAN_REVERSION");
  const directionalScore = FACTORS.reduce((sum, name) => {
    const signal = name === "momentum" && meanReversion ? -signals[name] : signals[name];
    return sum + signal * weights[name];
  }, 0);
  const stance: Exclude<Direction, "WAIT"> = directionalScore >= 0 ? "LONG" : "SHORT";
  const stanceSign = stance === "LONG" ? 1 : -1;
  const factors = normalizeWeights(FACTORS.map((name) => {
    const signal = name === "momentum" && meanReversion ? -signals[name] : signals[name];
    const directional = DIRECTIONAL_FACTORS.includes(name);
    const available = factorDataAvailable(name);
    return {
      name,
      // Same rule as the built-in model: a factor with no connected source
      // reports the neutral midpoint for display and is excluded from
      // conviction by `available`, never weighed as if it were measured.
      score: available ? Math.round(clamp(50 + stanceSign * signal * 48, 2, 98)) : 50,
      weight: weights[name],
      available,
      directional,
    };
  }));
  return { factors, stance };
}
