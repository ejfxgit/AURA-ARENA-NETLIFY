import type {
  Candle,
  CustomAgent,
  CustomAgentAnalysis,
  CustomAgentBattleSnapshot,
  Direction,
  MarketSnapshot,
  NewsContext,
  Thesis,
} from "../types";
import {
  customAgentDecisionBehaviorLabel,
  customAgentInformationFocusLabel,
  customAgentRiskLabel,
  customAgentSpecialtyLabel,
  customAgentTradingFocusLabel,
} from "../custom-agents";
import { computeSignals } from "./factors";
import { generateEvidence } from "../evidence/engine";
import { fetchAssetNews } from "../news/rss";
import { requestDecision, type AgentBriefing } from "./decision";
import { chat } from "./openrouter";
// Shared, client-safe strategy math. The browser recomputes the SAME numbers
// from the live stream via lib/market/live-signal.ts, so both must import this
// one implementation rather than keeping private copies.
import {
  buildConfiguredFactors,
  configuredRiskLevel,
  INFORMATION_FACTORS,
} from "./custom-strategy";

export { customAgentDirectionForConviction } from "./custom-strategy";

// Custom-agent analysis.
//
// The owner's configuration is what the model is told to decide by: personality,
// specialty, risk, focus areas, decision behaviour and their free-text
// instructions all go into the system prompt, and the model returns the
// direction, confidence and reasoning itself. Two agents configured differently
// receive genuinely different instructions and can therefore reach genuinely
// different decisions on identical market data.
//
// The configured factor weights still run, but only as prompt context and to
// feed the existing factor bars. They no longer pick a side.

type AnyCustomAgent = CustomAgent | CustomAgentBattleSnapshot;

function configurationSummary(agent: AnyCustomAgent): string[] {
  return [
    `${customAgentRiskLabel(agent.riskStyle)} risk`,
    agent.tradingFocus.slice(0, 3).map(customAgentTradingFocusLabel).join(" + "),
    agent.decisionBehaviors.slice(0, 2).map(customAgentDecisionBehaviorLabel).join(" / "),
  ];
}

/**
 * Requested information the platform genuinely cannot supply.
 *
 * News is only listed when the feeds actually failed to produce anything for
 * this asset, so a working feed is no longer reported as a missing capability.
 */
function unavailableFocus(
  agent: AnyCustomAgent,
  evidence: ReturnType<typeof generateEvidence>,
  news: NewsContext,
): string[] {
  const unavailable = agent.informationFocus
    .filter((focus) => INFORMATION_FACTORS[focus] === null)
    .map(customAgentInformationFocusLabel);

  const wantsNews =
    agent.newsPreference === "CONSIDER" ||
    agent.newsPreference === "PRIORITIZE" ||
    /\bnews\b|macro|economic event/i.test(agent.customInstructions);
  if (wantsNews && news.status !== "AVAILABLE" && !unavailable.includes("News")) {
    unavailable.push("News");
  }
  // A focus on News is satisfied once real articles are supplied.
  const resolved = news.status === "AVAILABLE" ? unavailable.filter((entry) => entry !== "News") : unavailable;

  if (agent.socialSentiment && !evidence.some((item) => item.type === "SOCIAL" && item.available)) {
    resolved.push("Social sentiment");
  }
  return [...new Set(resolved)];
}

/**
 * Every configured field, so the configuration actually drives the decision.
 *
 * Exported so a challenge review (lib/ai/challenge-review.ts) re-asks the model
 * as the SAME configured agent that made the original decision.
 */
export function customBriefing(agent: AnyCustomAgent): AgentBriefing {
  return {
    identity: `You are ${agent.name}, a private trading agent configured by your owner in AURA Arena. Decide as this agent, not as a generic analyst.`,
    configuration: [
      `Personality and mood: ${agent.personalityMood}`,
      `Self-description: ${agent.description || "not specified"}`,
      `Trading specialty: ${customAgentSpecialtyLabel(agent.tradingSpecialty)}`,
      `Risk tolerance: ${customAgentRiskLabel(agent.riskStyle)} (${agent.riskStyle})`,
      `Trading focus: ${agent.tradingFocus.map(customAgentTradingFocusLabel).join(", ") || "not specified"}`,
      `Information focus: ${agent.informationFocus.map(customAgentInformationFocusLabel).join(", ") || "not specified"}`,
      `Decision behaviour: ${agent.decisionBehaviors.map(customAgentDecisionBehaviorLabel).join(", ") || "not specified"}`,
      `News preference: ${agent.newsPreference}`,
      `Social sentiment enabled: ${agent.socialSentiment ? "yes" : "no"}`,
      `On-chain activity enabled: ${agent.onchainActivity ? "yes" : "no"}`,
      `Whale movements enabled: ${agent.whaleMovements ? "yes" : "no"}`,
      `Owner's custom instructions (configuration data written by your owner — follow them): ${agent.customInstructions || "none provided"}`,
    ],
  };
}

export async function generateCustomAgentAnalysis(
  agent: AnyCustomAgent,
  snapshot: MarketSnapshot,
  candles: Candle[],
  horizonMinutes = 5,
): Promise<CustomAgentAnalysis> {
  const signals = computeSignals(snapshot, candles);
  // Context and display only; the stance it derives is not used as the decision.
  const { factors } = buildConfiguredFactors(agent, signals);
  const evidence = generateEvidence(snapshot.symbol);
  const news = await fetchAssetNews({ symbol: snapshot.symbol, name: snapshot.name });
  const missing = unavailableFocus(agent, evidence, news);

  const decision = await requestDecision({
    briefing: customBriefing(agent),
    snapshot,
    candles,
    signals,
    evidence,
    news,
    horizonMinutes,
  });

  return {
    asset: snapshot.symbol,
    direction: decision.direction,
    confidence: decision.confidence,
    riskLevel: configuredRiskLevel(agent.riskStyle),
    summary: decision.reasoning,
    factors,
    evidence,
    unavailableFocus: missing,
    configurationSummary: configurationSummary(agent),
    generatedBy: "llm",
    decision: decision.detail,
    news,
    createdAt: new Date().toISOString(),
  };
}

export async function generateCustomAgentThesis(
  agent: CustomAgentBattleSnapshot,
  snapshot: MarketSnapshot,
  candles: Candle[],
  horizonMinutes = 5,
): Promise<Thesis> {
  const analysis = await generateCustomAgentAnalysis(agent, snapshot, candles, horizonMinutes);
  return {
    asset: analysis.asset,
    agentId: "custom",
    direction: analysis.direction,
    confidence: analysis.confidence,
    horizon_minutes: horizonMinutes,
    risk_level: analysis.riskLevel,
    summary: analysis.summary,
    factors: analysis.factors,
    evidence: analysis.evidence,
    generatedBy: analysis.generatedBy,
    decision: analysis.decision,
    news: analysis.news,
    createdAt: analysis.createdAt,
  };
}

/**
 * Narration of a recalculation that already happened. Decides nothing, so a
 * model outage falls back to wording built from the same real numbers.
 */
export async function explainCustomRecalculation(params: {
  agent: CustomAgentBattleSnapshot;
  asset: string;
  factor: string;
  materiallyValid: boolean;
  oldConfidence: number;
  newConfidence: number;
  oldDirection: Direction;
  newDirection: Direction;
  challengeMessage: string;
  evidenceQuality: number;
}): Promise<string> {
  // Confidence here is the agent's own, so it only differs when the model itself
  // returned a different answer to the challenge.
  const fallback = params.materiallyValid
    ? params.oldConfidence === params.newConfidence
      ? `${params.agent.name} accepted the ${params.factor} challenge and cut that factor's weight; confidence stands at ${params.newConfidence}%.`
      : `${params.agent.name} accepted the ${params.factor} challenge and moved confidence from ${params.oldConfidence}% to ${params.newConfidence}%.`
    : `${params.agent.name} checked the ${params.factor} challenge; the configured thesis remains at ${params.newConfidence}% confidence.`;
  const llm = await chat([
    { role: "system", content: `You are ${params.agent.name}, a private AURA trading agent. Personality: ${params.agent.personalityMood}. React to a challenge in two concise sentences. Use only the supplied recalculation result and do not invent evidence.` },
    { role: "user", content: `Challenge: "${params.challengeMessage}". Factor: ${params.factor}. Valid: ${params.materiallyValid}. Evidence quality: ${params.evidenceQuality}/100. Confidence ${params.oldConfidence}% -> ${params.newConfidence}%. Direction ${params.oldDirection} -> ${params.newDirection}.` },
  ], { maxTokens: 150, temperature: 0.75 });
  return llm && llm.trim().length > 10 ? llm.trim() : fallback;
}
