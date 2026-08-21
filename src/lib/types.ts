// Core domain types for AURA Arena

export type Direction = "LONG" | "SHORT" | "WAIT";

/**
 * The canonical current decision for one built-in agent in one market.
 *
 * Mirrors public.agent_decisions. This is the single source of truth consumed by
 * the agent cards and snapshotted into a battle at creation, so a user's battle
 * is settled against the decision they were actually shown.
 *
 * There is no "unavailable" variant on purpose. Absence of a decision is
 * represented by the absence of a record — see AgentDecisionState — because a
 * placeholder WAIT would be indistinguishable from an agent that genuinely chose
 * to wait, which is the exact confusion this type exists to prevent.
 */
export interface AgentDecision {
  agentId: AgentId;
  /** OKX SPOT instrument id the decision was made about, e.g. "BTC-USDT". */
  symbol: string;
  decision: Direction;
  confidence: number;
  horizonMinutes: number;
  /** The live price the decision was made from. */
  marketPrice: number;
  /** The agent's own reasoning. Never generated anywhere but the model. */
  reasoning: string;
  /**
   * The full analysis the decision came from. A battle snapshots this so the
   * battle record and the agent card are provably the same decision, rather than
   * two independently rebuilt approximations of one.
   */
  thesis: Thesis;
  /** Internal provenance. Never surfaced as the decision-maker. */
  model: string;
  /** When the model produced this decision. Set by the database. */
  decidedAt: string;
}

/**
 * What a surface knows about an agent's current decision.
 *
 * `missing` and `stale` are distinct states and must stay distinct: one means
 * the agent has never published a decision for this market, the other means it
 * has but the decision is older than the refresh window. Neither may be
 * rendered as a decision.
 */
export type AgentDecisionState =
  | { status: "ready"; decision: AgentDecision }
  | { status: "stale"; decision: AgentDecision }
  | { status: "missing" };
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type AgentId = "volt" | "mira" | "quanta" | "nova" | "atlas" | "rift";
export type ArenaAgentId = AgentId | "custom";

export type FactorName =
  | "momentum"
  | "volume"
  | "social"
  | "whale_activity"
  | "liquidity"
  | "volatility";

export interface Factor {
  name: FactorName;
  /**
   * 0-100 support for the agent's directional stance (50 = neutral).
   *
   * Only meaningful when `available` is true. For an unavailable factor this
   * carries the neutral midpoint purely so the factor bars can render a row,
   * and it must never reach a weighted average — see `available`.
   */
  score: number;
  weight: number; // 0-1, all weights sum to 1
  /**
   * Whether a real data source is wired up for this factor.
   *
   * An unavailable factor is excluded from conviction entirely rather than
   * contributing its neutral midpoint. Including it looks harmless but is not:
   * in a weighted MEAN a score of 50 is not a zero contribution, it actively
   * pulls conviction toward the midpoint, and with the weights AURA assigns
   * that was enough to pin agents inside the WAIT band permanently.
   */
  available: boolean;
  /**
   * Whether this factor carries a direction at all.
   *
   * Liquidity is a magnitude derived from 24h volume: a deep market is neither
   * bullish nor bearish. It is displayed as evidence but never counted toward
   * LONG/SHORT, because multiplying a always-positive magnitude by the stance
   * sign rewards LONG and penalises SHORT for identical market conditions.
   */
  directional: boolean;
}

export type EvidenceType = "MARKET" | "NEWS" | "SOCIAL" | "ONCHAIN";

export interface Evidence {
  id: string;
  type: EvidenceType;
  source: string;
  title: string;
  url: string | null;
  timestamp: string;
  asset: string;
  quality_score: number; // 0-100
  sentiment: number; // 0-100 (50 = neutral)
  summary: string;
  available: boolean;
}

/**
 * One real article from a real feed.
 *
 * Every field is copied from the provider. Nothing here is ever synthesized: no
 * invented headline, no constructed URL, no assumed timestamp.
 */
export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string | null;
  /**
   * Only set when a provider actually publishes a sentiment field. RSS does not,
   * so it stays null and the model classifies impact itself — reported separately
   * as AI-derived rather than attributed to the outlet.
   */
  sentiment: NewsSentiment | null;
}

export type NewsSentiment = "BULLISH" | "BEARISH" | "NEUTRAL";

/**
 * AVAILABLE   - relevant articles were fetched.
 * NO_MATCHES  - feeds answered, nothing about this asset. Not a failure.
 * UNAVAILABLE - every configured feed failed. `reason` says why.
 */
export type NewsStatus = "AVAILABLE" | "NO_MATCHES" | "UNAVAILABLE";

export interface NewsContext {
  status: NewsStatus;
  items: NewsItem[];
  reason: string | null;
  sources: string[];
  fetchedAt: string;
}

/**
 * The parts of a decision that came from the model rather than from the market.
 *
 * Optional on Thesis because battles persisted before the decision moved to
 * OpenRouter have no such record, and backfilling one would invent it.
 */
export interface AiDecisionDetail {
  keyEvidence: string[];
  invalidation: string;
  /** AI-derived, never attributed to a news provider. Null when no news reached the model. */
  newsSentiment: NewsSentiment | null;
  model: string;
}

export interface Thesis {
  asset: string;
  agentId: ArenaAgentId;
  direction: Direction;
  confidence: number; // 0-100
  horizon_minutes: number;
  risk_level: RiskLevel;
  summary: string;
  factors: Factor[];
  evidence: Evidence[];
  generatedBy: "llm" | "deterministic";
  /** Present on every thesis produced since the decision moved to OpenRouter. */
  decision?: AiDecisionDetail;
  /** The news context the model actually received, including an unavailable state. */
  news?: NewsContext;
  createdAt: string;
}

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  description: string;
  /**
   * Legacy single-letter mark. Kept as the accessible text stand-in and as the
   * fallback for agents without art; `avatarImage` is what surfaces render.
   */
  avatar: string;
  /**
   * Public path to this agent's identity art under public/agents. Set here on
   * the roster so every surface (arena, battles, leaderboard, performance,
   * landing) shows the same face without restating it per component.
   */
  avatarImage: string;
  personality: string;
  strategy: string;
  specialty: string;
  focus: string[];
  voice: string;
  // No `thesis` or `confidence` here on purpose. A thesis and its confidence
  // are only ever produced at runtime by /api/agents/analyze from a real OKX
  // snapshot plus real candles (see lib/ai/thesis.ts). Storing a static example
  // on the roster meant publishing a fabricated percentage as an AI signal.
  evidence: string[];
  current_status: string;
  recent_battle: string;
  wins: number;
  losses: number;
  win_rate: number;
  avg_pnl: number;
  reputation_score: number;
  accent: string;
  data_status: "DEMO" | "RUNTIME";
}

export type CustomAgentSpecialty =
  | "MOMENTUM"
  | "NEWS_SENTIMENT"
  | "STATISTICAL"
  | "ONCHAIN"
  | "LIQUIDITY"
  | "ANOMALY";

export type CustomAgentRiskStyle = "CONSERVATIVE" | "BALANCED" | "AGGRESSIVE";

export type CustomAgentAvatarStyle = "PULSE" | "ORBIT" | "PRISM" | "MONOLITH";

export type CustomAgentTradingFocus =
  | "MOMENTUM"
  | "TREND_FOLLOWING"
  | "BREAKOUT"
  | "MEAN_REVERSION"
  | "SCALPING"
  | "SWING_TRADING"
  | "VOLATILITY"
  | "VOLUME"
  | "LIQUIDITY"
  | "ORDER_FLOW"
  | "WHALE_ACTIVITY";

export type CustomAgentInformationFocus =
  | "PRICE_ACTION"
  | "MOMENTUM"
  | "VOLUME"
  | "VOLATILITY"
  | "LIQUIDITY"
  | "ORDER_BOOK"
  | "WHALE_ACTIVITY"
  | "SOCIAL_SENTIMENT"
  | "NEWS"
  | "MACRO_EVENTS"
  | "TECHNICAL_INDICATORS"
  | "MARKET_STRUCTURE";

export type CustomAgentNewsPreference = "IGNORE" | "CONSIDER" | "PRIORITIZE";

export type CustomAgentDecisionBehavior =
  | "HIGH_CONFIDENCE"
  | "TRADE_FREQUENTLY"
  | "TRADE_SELECTIVELY"
  | "WAIT_CONFIRMATION"
  | "REACT_QUICKLY";

export interface CustomAgentDraft {
  name: string;
  personalityMood: string;
  tradingSpecialty: CustomAgentSpecialty;
  riskStyle: CustomAgentRiskStyle;
  description: string;
  avatarStyle: CustomAgentAvatarStyle | null;
  tradingFocus: CustomAgentTradingFocus[];
  informationFocus: CustomAgentInformationFocus[];
  newsPreference: CustomAgentNewsPreference;
  socialSentiment: boolean;
  onchainActivity: boolean;
  whaleMovements: boolean;
  decisionBehaviors: CustomAgentDecisionBehavior[];
  customInstructions: string;
}

export interface CustomAgent extends CustomAgentDraft {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomAgentAnalysis {
  asset: string;
  direction: Direction;
  confidence: number;
  riskLevel: RiskLevel;
  summary: string;
  factors: Factor[];
  evidence: Evidence[];
  unavailableFocus: string[];
  configurationSummary: string[];
  generatedBy: "llm" | "deterministic";
  decision?: AiDecisionDetail;
  news?: NewsContext;
  createdAt: string;
}

/**
 * The result of one challenge.
 *
 * `old_*` / `new_*` confidence and direction are the AGENT'S OWN decision before
 * and after the challenge. They only ever differ when the model itself was asked
 * again and returned a different answer (`decision_source: "AI_REVIEW"`). The
 * deterministic factor model contributes the weight audit and the conviction
 * numbers below — never the traded direction.
 */
export interface Recalculation {
  challengeId: string;
  attackedFactor: FactorName;
  challenge_validity: number; // 0-1
  evidence_quality: number; // 0-100
  old_weights: Factor[];
  new_weights: Factor[];
  old_confidence: number;
  new_confidence: number;
  old_direction: Direction;
  new_direction: Direction;
  materiallyValid: boolean;
  verification: VerificationDetail[];
  explanation: string;
  createdAt: string;
  /**
   * Deterministic factor-model conviction before/after the weight audit.
   * ANALYSIS ONLY — it is not the agent's confidence and never becomes one.
   * Optional because challenges recorded before this split have no such value.
   */
  conviction_before?: number;
  conviction_after?: number;
  /**
   * How the post-challenge direction and confidence were obtained.
   * `AI_REVIEW` — the model was asked again with the challenge as input.
   * `UNCHANGED` — the agent keeps the decision it already made.
   */
  decision_source?: "AI_REVIEW" | "UNCHANGED";
  /** The model that produced an AI_REVIEW. Null when no review ran. */
  review_model?: string | null;
  /**
   * Set when a review was warranted but the model could not be reached or
   * answered unusably. The decision then stays exactly as the model last made
   * it — deterministic math never stands in for it.
   */
  review_error?: string | null;
}

export interface VerificationDetail {
  label: string;
  value: string;
}

export interface Challenge {
  id: string;
  battleId: string;
  agentId: ArenaAgentId;
  userId: string;
  message: string;
  createdAt: string;
  recalculation: Recalculation | null;
}

export type BattleStatus =
  | "WAITING"
  | "STARTING"
  | "ACTIVE"
  | "FINISHED"
  | "SETTLING"
  | "VERIFIED";

export type XLayerStatus = "UNCONFIGURED" | "PENDING" | "FAILED" | "VERIFIED";

export interface Battle {
  id: string;
  userId: string;
  agentId: ArenaAgentId;
  customAgentId?: string | null;
  customAgent?: CustomAgentBattleSnapshot | null;
  asset: string;
  human_direction: Direction;
  ai_direction: Direction;
  /**
   * The selected agent's decision, snapshotted when the battle was created.
   *
   * `ai_direction` is the value settlement reads; these carry the rest of the
   * same decision so the battle page, result cards and proof exports all quote
   * one record instead of re-deriving it. For a built-in agent this is a copy of
   * the canonical public.agent_decisions row, which is what makes the agent card
   * and the battle provably the same decision.
   *
   * Optional because battles created before this snapshot existed do not have
   * them; readers fall back to `ai_direction` and `thesis`.
   */
  agent_name?: string;
  agent_decision?: Direction;
  agent_confidence?: number;
  agent_horizon_minutes?: number;
  agent_reasoning?: string;
  /** When the model produced the decision, not when the battle was created. */
  agent_decision_at?: string;
  human_amount: number;
  ai_amount: number;
  /** Leverage locked for both positions in this battle. */
  leverage: number;
  /** True after the human stake has been atomically reserved at start. */
  stake_reserved: boolean;
  ai_confidence_before: number;
  ai_confidence_after: number;
  entry_price: number;
  exit_price: number | null;
  current_price: number;
  ai_pnl: number;
  human_pnl: number;
  winner: "HUMAN" | "AI" | "DRAW" | null;
  status: BattleStatus;
  thesis: Thesis;
  challenges: Challenge[];
  started_at: string | null;
  /** Canonical server-selected battle duration. */
  duration_seconds: number;
  /** Server-derived expiration timestamp (started_at + duration_seconds). */
  expires_at: string | null;
  ended_at: string | null;
  thesis_hash: string | null;
  challenge_hash: string | null;
  xlayer_tx_hash: string | null;
  xlayer_data_hash: string | null;
  xlayer_status: XLayerStatus | null;
  xlayer_error: string | null;
  xlayer_explorer_url: string | null;
  settlement_applied: boolean;
  createdAt: string;
}

export interface CustomAgentBattleSnapshot extends CustomAgentDraft {
  id: string;
  accent: string;
}

/**
 * The persisted demo account.
 *
 * Every balance and P&L field here is denominated in AURA — the Demo-mode reward
 * unit — not in dollars. `current_balance` IS the AURA balance: battle
 * settlements credit it (public.settle_wallet_battle) and redemptions debit it
 * (public.request_aura_withdrawal). See lib/aura-economy.ts for the fixed
 * 1,000 AURA = 1 USDT (X Layer Testnet) redemption rate.
 */
export interface DemoAccount {
  userId: string;
  starting_balance: number;
  current_balance: number;
  realized_pnl: number;
  unrealized_pnl: number;
  total_battles: number;
  wins: number;
  losses: number;
  valid_challenges: number;
  invalid_challenges: number;
  /**
   * Lifetime AURA redeemed for testnet USDT. Written only by the withdrawal
   * functions; a failed payout decrements it again when the AURA is restored.
   * 0 when supabase/migrations/202608210001_aura_withdrawals.sql is not applied.
   */
  aura_withdrawn_total: number;
}

/**
 * One AURA -> USDT (X Layer Testnet) redemption record.
 *
 * Persisted in public.withdrawals, which is the source of truth: the record and
 * its status survive a server restart, and `txHash` is only ever a real
 * broadcast transaction — COMPLETED cannot exist without one.
 */
export interface Withdrawal {
  id: string;
  userId: string;
  /** AURA debited from the account balance for this redemption. */
  auraAmount: number;
  /** Testnet USDT the treasury was asked to send (auraAmount / 1,000). */
  usdtAmount: number;
  destinationAddress: string;
  chainId: number;
  tokenAddress: string;
  status: WithdrawalState;
  /** Real X Layer transaction hash, or null before broadcast. Never invented. */
  txHash: string | null;
  explorerUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
}

export type WithdrawalState = "PENDING" | "SENDING" | "COMPLETED" | "FAILED";

export interface WalletProfile {
  id: string;
  walletAddress: string;
  displayName: string;
  username: string | null;
  bio: string;
  avatarStyle: CustomAgentAvatarStyle | null;
  /** Uploaded photo. Null keeps the avatarStyle fallback. */
  avatarUrl: string | null;
  timezone: string;
  language: string;
  settings: Record<string, unknown>;
  reputationScore: number;
  createdAt: string;
  updatedAt: string;
}

/** Editable subset of the profile exposed by PATCH /api/wallet/account. */
export interface ProfileDraft {
  displayName: string;
  username: string | null;
  bio: string;
  avatarStyle: CustomAgentAvatarStyle | null;
  avatarUrl: string | null;
  timezone: string;
  language: string;
}

export type TradingMode = "DEMO" | "REAL";

export interface UserSettings {
  id: string;
  userId: string;
  tradingMode: TradingMode;
  riskPreference: CustomAgentRiskStyle;
  defaultStrategy: CustomAgentSpecialty;
  decisionBehavior: CustomAgentDecisionBehavior;
  notifyBattleResults: boolean;
  notifyBattleStarted: boolean;
  notifyAgentEvents: boolean;
  notifyPnl: boolean;
  notifySystem: boolean;
  timezone: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}

export type UserSettingsDraft = Omit<UserSettings, "id" | "userId" | "createdAt" | "updatedAt">;

export interface WalletAccountBundle {
  profile: WalletProfile | null;
  account: DemoAccount | null;
}

/**
 * A market quote assembled from real OKX Exchange data.
 *
 * `null` always means "OKX did not supply this", never zero and never a
 * placeholder. Consumers must render an explicit unavailable state.
 */
export interface MarketSnapshot {
  /** Base currency, e.g. "BTC". Battles persist this value as `asset`. */
  symbol: string;
  /** OKX SPOT instrument id, e.g. "BTC-USDT". */
  instId: string;
  /** Cosmetic long name for the base currency, e.g. "Bitcoin". */
  name: string;
  quoteCurrency: string;
  /** Last traded price (OKX `last`). */
  price: number;
  /** Rolling 24h open (OKX `open24h`) — the basis of the change calculation. */
  open24h: number;
  /** 24h change in percent, derived from last and open24h. null if uncomputable. */
  change24h: number | null;
  /** 24h change in quote currency. null if uncomputable. */
  change24hAbsolute: number | null;
  /** 24h volume in the quote currency (OKX `volCcy24h`). */
  volume24h: number;
  /** 24h volume in the base currency (OKX `vol24h`). */
  volume24hBase: number;
  high24h: number;
  low24h: number;
  /** Best bid, or null when that side of the book is empty. */
  bid: number | null;
  /** Best ask, or null when that side of the book is empty. */
  ask: number | null;
  /** Freshness derived from the real OKX response timestamp. */
  status: "LIVE" | "STALE" | "UNAVAILABLE";
  /** OKX instrument `state`, e.g. "live". */
  instrumentState: string;
  /** OKX ticker timestamp, ISO 8601. */
  quotedAt: string;
  /** When AURA assembled this payload, ISO 8601. */
  updatedAt: string;
  /** Convenience mirror of `status !== "LIVE"`. */
  stale: boolean;
  /**
   * Direction from a real analysis, or null when none has been run.
   * The market feed itself never sets this — only the agent analysis endpoints
   * produce a verdict, and they do it from real market data.
   */
  aiSignal: Direction | null;
  /** Confidence from a real analysis, or null. Never a synthetic percentage. */
  aiConfidence: number | null;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
