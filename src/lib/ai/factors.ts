import type { Agent, Candle, Factor, FactorName, MarketSnapshot } from "../types";
import { clamp } from "../utils";
import { generateEvidence, factorDataAvailable } from "../evidence/engine";

// Per-factor "bullishness" in [-1, 1] derived from market + evidence data.
export interface MarketSignals {
  momentum: number;
  volume: number;
  social: number;
  whale_activity: number;
  liquidity: number;
  volatility: number;
}

export function computeSignals(
  snapshot: MarketSnapshot,
  candles: Candle[],
): MarketSignals {
  const closes = candles.map((c) => c.close);
  const n = closes.length;
  // OKX reports no 24h change when it cannot be computed. Treat that as no
  // signal (0 = neutral) rather than substituting an assumed move.
  const change24h = snapshot.change24h ?? 0;

  // momentum: recent return over last ~15 candles
  let momentum = 0;
  if (n > 16) {
    const recent = closes[n - 1];
    const prior = closes[n - 16];
    momentum = clamp(((recent - prior) / prior) * 25, -1, 1);
  } else {
    momentum = clamp(change24h / 8, -1, 1);
  }

  // volume: recent vs earlier average
  let volume = 0;
  if (n > 20) {
    const half = Math.floor(n / 2);
    const early = candles.slice(0, half).reduce((s, c) => s + c.volume, 0) / half;
    const late = candles.slice(half).reduce((s, c) => s + c.volume, 0) / (n - half);
    volume = clamp((late - early) / (early || 1), -1, 1);
  } else {
    volume = clamp(change24h / 10, -1, 1);
  }

  // liquidity: bounded proxy from 24h volume magnitude
  const liquidity = clamp(Math.log10(snapshot.volume24h + 1) / 11 - 0.3, -1, 1);

  // Realized volatility is directional only through the measured price move:
  // volatility increases conviction in the prevailing move, not a fabricated side.
  let volatility = 0;
  if (n > 2) {
    const returns = closes.slice(1).map((close, index) => (close - closes[index]) / (closes[index] || 1));
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
    const realized = Math.sqrt(variance) * 100;
    volatility = clamp(realized * 8 * (momentum >= 0 ? 1 : -1), -1, 1);
  }

  // social / whale: derived from evidence sentiment (50 = neutral)
  const ev = generateEvidence(snapshot.symbol);
  const socialEv = ev.find((e) => e.type === "SOCIAL");
  const whaleEv = ev.find((e) => e.type === "ONCHAIN");
  const social = socialEv?.available ? clamp((socialEv.sentiment - 50) / 40, -1, 1) : 0;
  const whale_activity = whaleEv?.available ? clamp((whaleEv.sentiment - 50) / 40, -1, 1) : 0;

  return { momentum, volume, social, whale_activity, liquidity, volatility };
}

export const AGENT_WEIGHTS: Record<Agent["id"], Record<FactorName, number>> = {
  volt: { momentum: 0.32, volume: 0.25, social: 0.12, whale_activity: 0.11, liquidity: 0.2, volatility: 0 },
  mira: { momentum: 0.12, volume: 0.14, social: 0.36, whale_activity: 0.1, liquidity: 0.28, volatility: 0 },
  quanta: { momentum: 0.2, volume: 0.25, social: 0.1, whale_activity: 0.2, liquidity: 0.25, volatility: 0 },
  nova: { momentum: 0.15, volume: 0.13, social: 0.12, whale_activity: 0.38, liquidity: 0.22, volatility: 0 },
  atlas: { momentum: 0.1, volume: 0.3, social: 0.08, whale_activity: 0.17, liquidity: 0.35, volatility: 0 },
  rift: { momentum: 0.28, volume: 0.22, social: 0.18, whale_activity: 0.1, liquidity: 0.22, volatility: 0 },
};

const STANDARD_FACTORS: FactorName[] = [
  "momentum",
  "volume",
  "social",
  "whale_activity",
  "liquidity",
];

/**
 * The factors that carry a direction.
 *
 * `liquidity` is deliberately absent. It is computed from 24h volume magnitude
 * (see computeSignals) and is therefore always positive for any real market — a
 * deep book is neither bullish nor bearish. It stays in STANDARD_FACTORS so it
 * is still shown as evidence, but it is excluded from directional conviction.
 */
export const DIRECTIONAL_FACTORS: FactorName[] = [
  "momentum",
  "volume",
  "social",
  "whale_activity",
];

// Convert bullishness signal to a 0-100 score supporting the agent's stance.
function scoreForStance(signal: number, stanceSign: number): number {
  return Math.round(clamp(50 + stanceSign * signal * 48, 2, 98));
}

export interface BuiltFactors {
  factors: Factor[];
  stance: "LONG" | "SHORT";
}

export function buildFactors(agent: Agent, signals: MarketSignals): BuiltFactors {
  // Stance is a SIGN test, so the unavailable terms below are genuinely
  // harmless here: they contribute exactly 0 to a sum. That is not true of the
  // weighted mean that produces conviction, where an unavailable factor would
  // contribute 50 — which is why availability is carried on each factor and
  // applied by directionalConviction() rather than being handled here.
  // VOLT is the continuation specialist; other minds follow the measured net signal.
  const net =
    signals.momentum * 0.4 +
    signals.volume * 0.25 +
    signals.whale_activity * 0.2 +
    signals.social * 0.15;
  let stance: "LONG" | "SHORT";
  if (agent.id === "volt") stance = "LONG";
  else stance = net >= 0 ? "LONG" : "SHORT";

  const stanceSign = stance === "LONG" ? 1 : -1;
  const weights = AGENT_WEIGHTS[agent.id];

  const factors: Factor[] = STANDARD_FACTORS.map((name) => {
    const directional = DIRECTIONAL_FACTORS.includes(name);
    const available = factorDataAvailable(name);
    return {
      name,
      // A factor with no source has no measurement to score. It reports the
      // neutral midpoint so the factor bars can still render the row, and
      // `available: false` keeps it out of the conviction maths entirely.
      score: available
        ? scoreForStance(signals[name as keyof MarketSignals], stanceSign)
        : 50,
      weight: weights[name],
      available,
      directional,
    };
  });

  return { factors, stance };
}
