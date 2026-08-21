import type { Agent, Candle, Direction, MarketSnapshot, Thesis, RiskLevel } from "../types";
import { getAgent } from "../agents";
import { buildFactors, computeSignals } from "./factors";
import { generateEvidence } from "../evidence/engine";
import { fetchAssetNews } from "../news/rss";
import { requestDecision, type AgentBriefing } from "./decision";
import { chat } from "./openrouter";

// Built-in specialist analysis.
//
// The decision is made by the configured OpenRouter model. The deterministic
// factor model still runs, but only to supply context to the prompt and to feed
// the existing factor bars — it no longer chooses a direction or a confidence,
// and there is no fallback thesis. If the model cannot be reached or returns
// something unusable, AiError propagates and the route reports an error state.

function riskFromConfidence(conf: number, direction: Direction): RiskLevel {
  if (direction === "WAIT") return "MEDIUM";
  if (conf >= 74) return "LOW";
  if (conf >= 58) return "MEDIUM";
  return "HIGH";
}

/** The specialist's full published identity, so its character drives the call. */
export function builtInBriefing(agent: Agent): AgentBriefing {
  return {
    identity: `You are ${agent.name}, an AI trading agent competing in AURA Arena. Role: ${agent.role}.`,
    configuration: [
      `Personality: ${agent.personality}`,
      `Voice: ${agent.voice}`,
      `Strategy: ${agent.strategy}`,
      `Specialty: ${agent.specialty}`,
      `Focus areas: ${agent.focus.join(", ")}`,
      `Description: ${agent.description}`,
    ],
  };
}

/**
 * The same briefing, resolved from an agent id.
 *
 * Exported so a challenge review (lib/ai/challenge-review.ts) re-asks the model
 * as the SAME agent that made the original decision, rather than as a generic
 * analyst.
 */
export function builtInBriefingFor(agentId: Agent["id"]): AgentBriefing {
  return builtInBriefing(getAgent(agentId));
}

export async function generateThesis(
  agentId: Agent["id"],
  snapshot: MarketSnapshot,
  candles: Candle[],
  horizonMinutes = 5,
): Promise<Thesis> {
  const agent = getAgent(agentId);
  const signals = computeSignals(snapshot, candles);
  // Context and display only. The stance this returns is deliberately ignored:
  // the direction is the model's to choose.
  const { factors } = buildFactors(agent, signals);
  const evidence = generateEvidence(snapshot.symbol);
  const news = await fetchAssetNews({ symbol: snapshot.symbol, name: snapshot.name });

  const decision = await requestDecision({
    briefing: builtInBriefing(agent),
    snapshot,
    candles,
    signals,
    evidence,
    news,
    horizonMinutes,
  });

  return {
    asset: snapshot.symbol,
    agentId,
    direction: decision.direction,
    confidence: decision.confidence,
    horizon_minutes: horizonMinutes,
    risk_level: riskFromConfidence(decision.confidence, decision.direction),
    summary: decision.reasoning,
    factors,
    evidence,
    generatedBy: "llm",
    decision: decision.detail,
    news,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Narration of a recalculation that already happened.
 *
 * This restates numbers the challenge pipeline computed; it decides nothing, so
 * a model outage falls back to plain wording built from those same real numbers
 * rather than blocking the challenge.
 */
export async function explainRecalculation(params: {
  agentId: Agent["id"];
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
  const agent = getAgent(params.agentId);
  // The confidence and direction quoted here are the agent's own, so they only
  // differ when the model itself returned a different answer to the challenge.
  const confidenceMove =
    params.oldConfidence === params.newConfidence
      ? `My confidence stands at ${params.newConfidence}%.`
      : `My confidence moves from ${params.oldConfidence}% to ${params.newConfidence}%.`;
  const fallback = params.materiallyValid
    ? `Your challenge on ${params.factor} held up. Evidence quality came back at ${params.evidenceQuality}/100, so I cut its weight in the model. ${confidenceMove}${params.oldDirection !== params.newDirection ? ` Direction moves from ${params.oldDirection} to ${params.newDirection}.` : " The direction holds."}`
    : `I checked the ${params.factor} challenge. Evidence quality was ${params.evidenceQuality}/100, inside tolerance. The thesis stands at ${params.newConfidence}%.`;
  const llm = await chat([
    { role: "system", content: `You are ${agent.name}, an AI trading agent. Personality: ${agent.personality} A human challenged your thesis. React in character in 2 sentences and be honest about whether they were right.` },
    { role: "user", content: `Challenge: "${params.challengeMessage}". It attacked ${params.factor}. Valid: ${params.materiallyValid}. Evidence quality: ${params.evidenceQuality}/100. Confidence ${params.oldConfidence}% -> ${params.newConfidence}%. Direction ${params.oldDirection} -> ${params.newDirection}.` },
  ], { maxTokens: 150, temperature: 0.85 });
  return llm && llm.trim().length > 10 ? llm.trim() : fallback;
}
