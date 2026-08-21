import { z } from "zod";
import type {
  CustomAgent,
  CustomAgentAvatarStyle,
  CustomAgentBattleSnapshot,
  CustomAgentDecisionBehavior,
  CustomAgentDraft,
  CustomAgentInformationFocus,
  CustomAgentNewsPreference,
  CustomAgentRiskStyle,
  CustomAgentSpecialty,
  CustomAgentTradingFocus,
} from "./types";

export const CUSTOM_AGENT_SPECIALTIES: ReadonlyArray<{
  value: CustomAgentSpecialty;
  label: string;
  detail: string;
}> = [
  { value: "MOMENTUM", label: "Momentum", detail: "Trend, breakout and volume acceleration" },
  { value: "NEWS_SENTIMENT", label: "News & sentiment", detail: "Catalysts, narratives and social evidence" },
  { value: "STATISTICAL", label: "Statistical", detail: "Probability, regimes and measured edge" },
  { value: "ONCHAIN", label: "Onchain", detail: "Wallet flows and large-holder activity" },
  { value: "LIQUIDITY", label: "Liquidity & flow", detail: "Depth, volume and market structure" },
  { value: "ANOMALY", label: "Anomaly", detail: "Divergence, dislocation and unusual activity" },
];

export const CUSTOM_AGENT_RISK_STYLES: ReadonlyArray<{
  value: CustomAgentRiskStyle;
  label: string;
  detail: string;
}> = [
  { value: "CONSERVATIVE", label: "Conservative", detail: "Waits for stronger conviction" },
  { value: "BALANCED", label: "Balanced", detail: "Uses the standard decision thresholds" },
  { value: "AGGRESSIVE", label: "Aggressive", detail: "Acts on a lower conviction threshold" },
];

export const CUSTOM_AGENT_AVATAR_STYLES: ReadonlyArray<{
  value: CustomAgentAvatarStyle;
  label: string;
  accent: string;
}> = [
  { value: "PULSE", label: "Pulse", accent: "#22e39a" },
  { value: "ORBIT", label: "Orbit", accent: "#5b8cff" },
  { value: "PRISM", label: "Prism", accent: "#c084fc" },
  { value: "MONOLITH", label: "Monolith", accent: "#f5b544" },
];

export const CUSTOM_AGENT_TRADING_FOCUSES: ReadonlyArray<{ value: CustomAgentTradingFocus; label: string }> = [
  { value: "MOMENTUM", label: "Momentum" },
  { value: "TREND_FOLLOWING", label: "Trend following" },
  { value: "BREAKOUT", label: "Breakout" },
  { value: "MEAN_REVERSION", label: "Mean reversion" },
  { value: "SCALPING", label: "Scalping" },
  { value: "SWING_TRADING", label: "Swing trading" },
  { value: "VOLATILITY", label: "Volatility" },
  { value: "VOLUME", label: "Volume" },
  { value: "LIQUIDITY", label: "Liquidity" },
  { value: "ORDER_FLOW", label: "Order flow" },
  { value: "WHALE_ACTIVITY", label: "Whale activity" },
];

export const CUSTOM_AGENT_INFORMATION_FOCUSES: ReadonlyArray<{ value: CustomAgentInformationFocus; label: string }> = [
  { value: "PRICE_ACTION", label: "Price action" },
  { value: "MOMENTUM", label: "Momentum" },
  { value: "VOLUME", label: "Volume" },
  { value: "VOLATILITY", label: "Volatility" },
  { value: "LIQUIDITY", label: "Liquidity" },
  { value: "ORDER_BOOK", label: "Order book" },
  { value: "WHALE_ACTIVITY", label: "Whale activity" },
  { value: "SOCIAL_SENTIMENT", label: "Social sentiment" },
  { value: "NEWS", label: "News" },
  { value: "MACRO_EVENTS", label: "Macro / economic events" },
  { value: "TECHNICAL_INDICATORS", label: "Technical indicators" },
  { value: "MARKET_STRUCTURE", label: "Market structure" },
];

export const CUSTOM_AGENT_NEWS_PREFERENCES: ReadonlyArray<{ value: CustomAgentNewsPreference; label: string }> = [
  { value: "IGNORE", label: "Ignore news" },
  { value: "CONSIDER", label: "Consider news" },
  { value: "PRIORITIZE", label: "Prioritize news" },
];

export const CUSTOM_AGENT_DECISION_BEHAVIORS: ReadonlyArray<{ value: CustomAgentDecisionBehavior; label: string }> = [
  { value: "HIGH_CONFIDENCE", label: "Prefer high-confidence setups" },
  { value: "TRADE_FREQUENTLY", label: "Trade frequently" },
  { value: "TRADE_SELECTIVELY", label: "Trade selectively" },
  { value: "WAIT_CONFIRMATION", label: "Wait for confirmation" },
  { value: "REACT_QUICKLY", label: "React quickly to market changes" },
];

export const DEFAULT_CUSTOM_AGENT_DRAFT: CustomAgentDraft = {
  name: "",
  personalityMood: "Calm, precise and evidence-first.",
  tradingSpecialty: "MOMENTUM",
  riskStyle: "BALANCED",
  description: "",
  avatarStyle: "ORBIT",
  tradingFocus: ["MOMENTUM", "BREAKOUT"],
  informationFocus: ["PRICE_ACTION", "MOMENTUM", "VOLUME"],
  newsPreference: "CONSIDER",
  socialSentiment: true,
  onchainActivity: false,
  whaleMovements: false,
  decisionBehaviors: ["TRADE_SELECTIVELY", "WAIT_CONFIRMATION"],
  customInstructions: "",
};

const tradingFocusSchema = z.enum([
  "MOMENTUM", "TREND_FOLLOWING", "BREAKOUT", "MEAN_REVERSION", "SCALPING",
  "SWING_TRADING", "VOLATILITY", "VOLUME", "LIQUIDITY", "ORDER_FLOW", "WHALE_ACTIVITY",
]);

const informationFocusSchema = z.enum([
  "PRICE_ACTION", "MOMENTUM", "VOLUME", "VOLATILITY", "LIQUIDITY", "ORDER_BOOK",
  "WHALE_ACTIVITY", "SOCIAL_SENTIMENT", "NEWS", "MACRO_EVENTS", "TECHNICAL_INDICATORS", "MARKET_STRUCTURE",
]);

const decisionBehaviorSchema = z.enum([
  "HIGH_CONFIDENCE", "TRADE_FREQUENTLY", "TRADE_SELECTIVELY", "WAIT_CONFIRMATION", "REACT_QUICKLY",
]);

export const customAgentSchema = z.object({
  name: z.string().trim().min(2).max(32),
  personalityMood: z.string().trim().min(3).max(80),
  tradingSpecialty: z.enum([
    "MOMENTUM",
    "NEWS_SENTIMENT",
    "STATISTICAL",
    "ONCHAIN",
    "LIQUIDITY",
    "ANOMALY",
  ]),
  riskStyle: z.enum(["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]),
  description: z.string().trim().min(10).max(240),
  avatarStyle: z.enum(["PULSE", "ORBIT", "PRISM", "MONOLITH"]).nullable(),
  tradingFocus: z.array(tradingFocusSchema).min(1).max(6),
  informationFocus: z.array(informationFocusSchema).min(1).max(8),
  newsPreference: z.enum(["IGNORE", "CONSIDER", "PRIORITIZE"]),
  socialSentiment: z.boolean(),
  onchainActivity: z.boolean(),
  whaleMovements: z.boolean(),
  decisionBehaviors: z.array(decisionBehaviorSchema).min(1).max(4),
  customInstructions: z.string().trim().max(600),
});

export const customAgentUpdateSchema = customAgentSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "No changes supplied",
);

// Human-readable names for the builder inputs, so a rejected payload names the
// exact field the user has to fix instead of a generic "Invalid custom agent".
const CUSTOM_AGENT_FIELD_LABELS: Record<keyof CustomAgentDraft, string> = {
  name: "Agent name",
  personalityMood: "Personality / mood",
  tradingSpecialty: "Primary specialty",
  riskStyle: "Risk style",
  description: "Short personality description",
  avatarStyle: "Avatar / style",
  tradingFocus: "Trading approach",
  informationFocus: "Focus areas",
  newsPreference: "News preference",
  socialSentiment: "Social sentiment",
  onchainActivity: "On-chain activity",
  whaleMovements: "Whale movements",
  decisionBehaviors: "Decision behavior",
  customInstructions: "Custom strategy instructions",
};

export interface CustomAgentFieldIssue {
  field: string;
  label: string;
  message: string;
}

function fieldLabel(path: z.ZodIssue["path"]): { field: string; label: string } {
  const field = path.length ? String(path[0]) : "payload";
  const label = CUSTOM_AGENT_FIELD_LABELS[field as keyof CustomAgentDraft] ?? field;
  return { field, label };
}

function issueMessage(issue: z.ZodIssue, label: string): string {
  if (!issue.path.length) return issue.message;
  if (issue.code === "invalid_type" && issue.received === "undefined") {
    return `${label} is required`;
  }
  if (issue.code === "too_small") {
    if (issue.type === "string") return `${label} must be at least ${issue.minimum} characters`;
    if (issue.type === "array") return `${label} needs at least ${issue.minimum} selection${issue.minimum === 1 ? "" : "s"}`;
  }
  if (issue.code === "too_big") {
    if (issue.type === "string") return `${label} must be ${issue.maximum} characters or fewer`;
    if (issue.type === "array") return `${label} allows at most ${issue.maximum} selections`;
  }
  if (issue.code === "invalid_enum_value") {
    return `${label} does not accept "${String(issue.received)}"`;
  }
  if (issue.code === "invalid_type") {
    return `${label} must be ${issue.expected}, received ${issue.received}`;
  }
  return `${label}: ${issue.message}`;
}

/** Flattens a customAgentSchema failure into one entry per offending field. */
export function customAgentIssues(error: z.ZodError): CustomAgentFieldIssue[] {
  const seen = new Set<string>();
  const issues: CustomAgentFieldIssue[] = [];
  for (const issue of error.issues) {
    const { field, label } = fieldLabel(issue.path);
    if (seen.has(field)) continue;
    seen.add(field);
    issues.push({ field, label, message: issueMessage(issue, label) });
  }
  return issues;
}

export function customAgentIssueSummary(issues: CustomAgentFieldIssue[]): string {
  if (!issues.length) return "Invalid custom agent";
  return issues.map((issue) => issue.message).join(". ") + ".";
}

export interface CustomAgentRow {
  id: string;
  owner_id: string;
  name: string;
  personality_mood: string;
  trading_specialty: CustomAgentSpecialty;
  risk_style: CustomAgentRiskStyle;
  description: string;
  avatar_style: CustomAgentAvatarStyle | null;
  trading_focus: CustomAgentTradingFocus[];
  information_focus: CustomAgentInformationFocus[];
  news_preference: CustomAgentNewsPreference;
  social_sentiment: boolean;
  onchain_activity: boolean;
  whale_movements: boolean;
  decision_behaviors: CustomAgentDecisionBehavior[];
  custom_instructions: string;
  created_at: string;
  updated_at: string;
}

export function customAgentFromRow(row: CustomAgentRow): CustomAgent {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    personalityMood: row.personality_mood,
    tradingSpecialty: row.trading_specialty,
    riskStyle: row.risk_style,
    description: row.description,
    avatarStyle: row.avatar_style,
    tradingFocus: row.trading_focus ?? DEFAULT_CUSTOM_AGENT_DRAFT.tradingFocus,
    informationFocus: row.information_focus ?? DEFAULT_CUSTOM_AGENT_DRAFT.informationFocus,
    newsPreference: row.news_preference ?? DEFAULT_CUSTOM_AGENT_DRAFT.newsPreference,
    socialSentiment: row.social_sentiment ?? DEFAULT_CUSTOM_AGENT_DRAFT.socialSentiment,
    onchainActivity: row.onchain_activity ?? DEFAULT_CUSTOM_AGENT_DRAFT.onchainActivity,
    whaleMovements: row.whale_movements ?? DEFAULT_CUSTOM_AGENT_DRAFT.whaleMovements,
    decisionBehaviors: row.decision_behaviors ?? DEFAULT_CUSTOM_AGENT_DRAFT.decisionBehaviors,
    customInstructions: row.custom_instructions ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function customAgentToRow(draft: Partial<CustomAgentDraft>) {
  return {
    ...(draft.name !== undefined ? { name: draft.name } : {}),
    ...(draft.personalityMood !== undefined ? { personality_mood: draft.personalityMood } : {}),
    ...(draft.tradingSpecialty !== undefined ? { trading_specialty: draft.tradingSpecialty } : {}),
    ...(draft.riskStyle !== undefined ? { risk_style: draft.riskStyle } : {}),
    ...(draft.description !== undefined ? { description: draft.description } : {}),
    ...(draft.avatarStyle !== undefined ? { avatar_style: draft.avatarStyle } : {}),
    ...(draft.tradingFocus !== undefined ? { trading_focus: draft.tradingFocus } : {}),
    ...(draft.informationFocus !== undefined ? { information_focus: draft.informationFocus } : {}),
    ...(draft.newsPreference !== undefined ? { news_preference: draft.newsPreference } : {}),
    ...(draft.socialSentiment !== undefined ? { social_sentiment: draft.socialSentiment } : {}),
    ...(draft.onchainActivity !== undefined ? { onchain_activity: draft.onchainActivity } : {}),
    ...(draft.whaleMovements !== undefined ? { whale_movements: draft.whaleMovements } : {}),
    ...(draft.decisionBehaviors !== undefined ? { decision_behaviors: draft.decisionBehaviors } : {}),
    ...(draft.customInstructions !== undefined ? { custom_instructions: draft.customInstructions } : {}),
  };
}

export function customAgentAccent(avatarStyle: CustomAgentAvatarStyle | null): string {
  return CUSTOM_AGENT_AVATAR_STYLES.find((style) => style.value === avatarStyle)?.accent ?? "#7c5cff";
}

export function customAgentSpecialtyLabel(specialty: CustomAgentSpecialty): string {
  return CUSTOM_AGENT_SPECIALTIES.find((item) => item.value === specialty)?.label ?? specialty;
}

export function customAgentRiskLabel(riskStyle: CustomAgentRiskStyle): string {
  return CUSTOM_AGENT_RISK_STYLES.find((item) => item.value === riskStyle)?.label ?? riskStyle;
}

export function customAgentTradingFocusLabel(value: CustomAgentTradingFocus): string {
  return CUSTOM_AGENT_TRADING_FOCUSES.find((item) => item.value === value)?.label ?? value;
}

export function customAgentInformationFocusLabel(value: CustomAgentInformationFocus): string {
  return CUSTOM_AGENT_INFORMATION_FOCUSES.find((item) => item.value === value)?.label ?? value;
}

export function customAgentDecisionBehaviorLabel(value: CustomAgentDecisionBehavior): string {
  return CUSTOM_AGENT_DECISION_BEHAVIORS.find((item) => item.value === value)?.label ?? value;
}

export function customAgentBattleSnapshot(agent: CustomAgent): CustomAgentBattleSnapshot {
  return {
    id: agent.id,
    name: agent.name,
    personalityMood: agent.personalityMood,
    tradingSpecialty: agent.tradingSpecialty,
    riskStyle: agent.riskStyle,
    description: agent.description,
    avatarStyle: agent.avatarStyle,
    tradingFocus: [...agent.tradingFocus],
    informationFocus: [...agent.informationFocus],
    newsPreference: agent.newsPreference,
    socialSentiment: agent.socialSentiment,
    onchainActivity: agent.onchainActivity,
    whaleMovements: agent.whaleMovements,
    decisionBehaviors: [...agent.decisionBehaviors],
    customInstructions: agent.customInstructions,
    accent: customAgentAccent(agent.avatarStyle),
  };
}
