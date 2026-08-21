import type { Evidence, EvidenceType, FactorName, VerificationDetail } from "../types";
import { uid } from "../utils";

// Evidence metadata for the factor model.
//
// Nothing in this module invents a measurement. A factor either has a real data
// source wired up — in which case its evidence is marked available and sourced —
// or it does not, in which case it is reported unavailable and contributes zero
// to the signal. There is no seeded jitter and no randomised availability.

interface FactorProfile {
  // integrity: how trustworthy this factor's methodology is (0-100). This is a
  // FIXED, declared property of the method — not a measurement of live data, and
  // not randomised per asset.
  baseIntegrity: number;
  type: EvidenceType;
  source: string;
  title: (asset: string) => string;
  /**
   * Whether a real data source is actually wired up for this factor.
   *
   * false means AURA has no feed for it, so the factor reports itself as
   * unavailable and contributes zero signal. It is never given an invented
   * sentiment value to make the output look complete.
   */
  hasPublicSource: boolean;
}

const OKX_MARKET_SOURCE = "OKX Exchange public market data (api/v5)";
const OKX_DOCS_URL = "https://www.okx.com/docs-v5/en/";

const FACTOR_PROFILES: Record<FactorName, FactorProfile> = {
  momentum: {
    baseIntegrity: 82,
    type: "MARKET",
    source: OKX_MARKET_SOURCE,
    title: (a) => `${a} price momentum from OKX candlesticks`,
    hasPublicSource: true,
  },
  volume: {
    baseIntegrity: 85,
    type: "MARKET",
    source: OKX_MARKET_SOURCE,
    title: (a) => `${a} 24h traded volume and volume delta`,
    hasPublicSource: true,
  },
  liquidity: {
    baseIntegrity: 78,
    type: "MARKET",
    source: OKX_MARKET_SOURCE,
    title: (a) => `${a} 24h quote volume as a liquidity proxy`,
    hasPublicSource: true,
  },
  volatility: {
    baseIntegrity: 80,
    type: "MARKET",
    source: "Realized volatility derived from OKX candles",
    title: (a) => `${a} realized volatility regime`,
    hasPublicSource: true,
  },
  // No on-chain indexer is connected for exchange-traded assets. The X Layer
  // token-list API covers X Layer contracts, not whale transfers on BTC or ETH,
  // so this factor stays honestly unavailable rather than guessing.
  whale_activity: {
    baseIntegrity: 58,
    type: "ONCHAIN",
    source: "Public on-chain transfers",
    title: (a) => `${a} large wallet transfer clustering`,
    hasPublicSource: false,
  },
  // No social feed is connected (no paid X API dependency).
  social: {
    baseIntegrity: 40,
    type: "SOCIAL",
    source: "Public social feeds",
    title: (a) => `${a} social mention volume & sentiment`,
    hasPublicSource: false,
  },
};

/**
 * Whether a real data source is wired up for this factor.
 *
 * Availability is a static property of the factor, not of the asset, so callers
 * that need it before they have an asset (the factor model) can read it here
 * rather than re-deriving it. This is the single source of truth: it reads the
 * same FACTOR_PROFILES entry that generateEvidenceForFactor() reports from.
 */
export function factorDataAvailable(factor: FactorName): boolean {
  return FACTOR_PROFILES[factor].hasPublicSource;
}

/**
 * Describes what AURA can and cannot measure for one factor.
 *
 * When no source is wired, the evidence is marked unavailable and its sentiment
 * is reported as exactly neutral (50). computeSignals() then contributes zero
 * for that factor — a fabricated sentiment would silently move the thesis
 * confidence, which is precisely what must never happen.
 */
export function generateEvidenceForFactor(asset: string, factor: FactorName): Evidence {
  const p = FACTOR_PROFILES[factor];
  const available = p.hasPublicSource;
  const integrity = p.baseIntegrity;
  return {
    id: uid("ev"),
    type: p.type,
    source: available ? p.source : "unavailable — no source connected",
    title: available ? p.title(asset) : `${asset} ${factor} signal unavailable`,
    url: available && p.type === "MARKET" ? OKX_DOCS_URL : null,
    timestamp: new Date().toISOString(),
    asset,
    quality_score: available ? integrity : 0,
    // 50 = neutral. Never a derived or randomised value.
    sentiment: 50,
    summary: available
      ? `${p.title(asset)} — methodology integrity ${integrity}/100.`
      : `No data source is connected for ${factor}. The factor is excluded from the signal rather than estimated.`,
    available,
  };
}

export function generateEvidence(asset: string): Evidence[] {
  return (Object.keys(FACTOR_PROFILES) as FactorName[]).map((f) =>
    generateEvidenceForFactor(asset, f),
  );
}

// -- challenge classification ----------------------------------------------

const FACTOR_KEYWORDS: Record<FactorName, string[]> = {
  social: ["social", "twitter", "x ", "bot", "bots", "account", "sentiment", "hype", "shill", "engagement"],
  momentum: ["momentum", "trend", "breakout", "continuation", "rally", "pump"],
  volume: ["volume", "liquidity dried", "thin volume", "fake volume", "wash"],
  whale_activity: ["whale", "wallet", "large holder", "smart money", "on-chain", "onchain", "transfer"],
  liquidity: ["liquidity", "order book", "depth", "spread", "slippage"],
  volatility: ["volatility", "vol ", "risk", "variance", "swing"],
};

export function classifyChallenge(message: string): FactorName {
  const m = message.toLowerCase();
  let best: FactorName = "social";
  let bestHits = 0;
  for (const [factor, words] of Object.entries(FACTOR_KEYWORDS) as [FactorName, string[]][]) {
    const hits = words.reduce((s, w) => s + (m.includes(w) ? 1 : 0), 0);
    if (hits > bestHits) {
      bestHits = hits;
      best = factor;
    }
  }
  return best;
}

// Words signalling the user is asserting the factor is weak/unreliable.
const WEAKNESS_WORDS = [
  "inflated", "fake", "bot", "bots", "low quality", "low-quality", "unreliable",
  "manipulated", "overstated", "wash", "thin", "dried", "weak", "exhausted",
  "overextended", "trap", "not real", "misleading", "noise", "hype",
];

export interface ChallengeEvaluation {
  factor: FactorName;
  challengeValidity: number; // 0-1
  evidenceQuality: number; // 0-100 (integrity of attacked signal's data)
  verification: VerificationDetail[];
  evidence: Evidence;
}

// Deterministic evaluation: compares the challenge claim against the factor's
// real data integrity. Attacking a genuinely weak signal => high validity.
export function evaluateChallenge(asset: string, message: string): ChallengeEvaluation {
  const factor = classifyChallenge(message);
  const evidence = generateEvidenceForFactor(asset, factor);
  const integrity = evidence.available ? evidence.quality_score : 20;

  const m = message.toLowerCase();
  const asserts = WEAKNESS_WORDS.some((w) => m.includes(w));
  // Claim strength: an on-point weakness assertion boosts how much the
  // challenge can matter; a vague claim is discounted.
  const claimStrength = asserts ? 1 : 0.55;

  // The lower the real integrity, the more valid a weakness challenge is.
  const validity = Math.max(
    0,
    Math.min(1, ((100 - integrity) / 100) * claimStrength * 1.35),
  );

  const verification: VerificationDetail[] = [];
  if (!evidence.available) {
    // No feed is connected for this factor, so there is nothing to have scanned.
    // Reporting a count here — "8,000 social accounts analyzed" — would be a
    // fabricated measurement.
    verification.push(
      { label: "Data source", value: "No source connected" },
      { label: "Measured evidence", value: "None available" },
      { label: "Assumed integrity", value: `${integrity}/100 (methodology floor)` },
    );
  } else {
    verification.push(
      { label: "Data source", value: evidence.source },
      { label: "Signal integrity", value: `${integrity}/100` },
      { label: "Evidence quality", value: `${integrity}/100` },
    );
  }

  return {
    factor,
    challengeValidity: Number(validity.toFixed(3)),
    evidenceQuality: integrity,
    verification,
    evidence,
  };
}
