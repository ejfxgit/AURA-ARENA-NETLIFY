import { z } from "zod";
import type { Direction, FactorName, VerificationDetail } from "../types";
import { AiError, chatOrThrow, extractJson, openRouterModel } from "./openrouter";
import type { AgentBriefing } from "./decision";
import { ACCEPTED_DECISION_WORDS, normalizeDecision } from "./decision";
import { battleHorizonLabel } from "../battle/timing";

// The agent reconsidering its own decision after a human challenge.
//
// This module exists so that a challenge can never change the traded direction
// without the model. The deterministic factor audit decides whether the
// challenge is worth re-asking about; it does not decide the answer. As in
// ./decision.ts there is no heuristic, no default direction and no fallback
// confidence: either the model returns a valid decision or AiError propagates and
// the caller keeps the decision the model already made.

const REVIEW_TIMEOUT_MS = 25_000;

const MANDATE =
  "A human is challenging the decision you already published. Reconsider it yourself. You may keep " +
  "it, change your confidence, or reverse it — but the answer must be yours, made from the material " +
  "below. No direction has been chosen for you, and no recalculated direction exists.";

const CONTRACT = `Return ONLY a JSON object, no prose around it:
{
  "direction": "LONG" | "SHORT" | "HOLD",
  "confidence": integer 0-100,
  "horizon_minutes": the exact integer horizon supplied in the challenge request,
  "reasoning": "2-3 sentences in your own voice, reacting to the challenge and saying whether it changed your mind"
}`;

const RULES = [
  "Decide only from the material supplied below and your own published thesis. Never invent a price, candle, headline or on-chain figure.",
  "The weight audit is a data-integrity check on one factor. It is unweighted background, it contains no direction, and it is not a recommendation.",
  "Keeping your original direction is a valid outcome. Say so plainly when the challenge does not move you.",
  "HOLD is a real answer. Choose it when the challenge leaves you unwilling to hold a position.",
  "Your risk tolerance and decision behaviour must be visible in both the direction and the confidence you return.",
  "Set horizon_minutes to the exact supplied battle horizon. Discuss that same horizon in the reasoning without substituting a different duration.",
];

export interface ChallengeReview {
  direction: Direction;
  confidence: number;
  reasoning: string;
  /** The model the reviewed decision actually came from. */
  model: string;
}

const responseSchema = z.object({
  // Normalized by normalizeDecision() below, which owns the accepted vocabulary.
  direction: z.string(),
  confidence: z.coerce.number().finite().min(0).max(100),
  horizon_minutes: z.coerce.number().int().positive(),
  reasoning: z.string().trim().min(1),
});

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(Number(value.toPrecision(8)));
}

/**
 * Asks the agent to re-decide with the challenge as input, then validates
 * strictly. The accepted decision vocabulary is normalizeDecision()'s, shared
 * with the initial decision path. An unrecognised or unusable answer raises
 * AiError; it is never absorbed into WAIT.
 */
export async function requestChallengeReview(params: {
  briefing: AgentBriefing;
  asset: string;
  horizonMinutes: number;
  /** The decision currently on the record — the model's own last answer. */
  currentDirection: Direction;
  currentConfidence: number;
  originalReasoning: string;
  keyEvidence: string[];
  invalidation: string;
  /** Real OKX values already persisted with the battle. */
  entryPrice: number;
  currentPrice: number | null;
  /** The human's words, verbatim. */
  challengeMessage: string;
  /** Deterministic evidence audit of the attacked factor. */
  attackedFactor: FactorName;
  challengeValidity: number;
  evidenceQuality: number;
  verification: VerificationDetail[];
  convictionBefore: number;
  convictionAfter: number;
}): Promise<ChallengeReview> {
  const system = [
    params.briefing.identity,
    "",
    "YOUR CONFIGURATION — decide according to it:",
    ...params.briefing.configuration.map((line) => `- ${line}`),
    "",
    MANDATE,
    "",
    "RULES:",
    ...RULES.map((rule) => `- ${rule}`),
    "",
    CONTRACT,
  ].join("\n");

  const user = [
    `CHALLENGE REVIEW — ${params.asset} over the next ${battleHorizonLabel(params.horizonMinutes)}.`,
    "",
    "YOUR PUBLISHED DECISION",
    `Direction: ${params.currentDirection} | Confidence: ${params.currentConfidence}%`,
    `Your reasoning: ${params.originalReasoning}`,
    params.keyEvidence.length > 0
      ? `Your key evidence: ${params.keyEvidence.join(" | ")}`
      : "Your key evidence: none recorded.",
    params.invalidation
      ? `What you said would invalidate it: ${params.invalidation}`
      : "You recorded no invalidation condition.",
    "",
    "POSITION CONTEXT — real OKX prices already recorded for this battle",
    `Entry price: ${formatPrice(params.entryPrice)} | Latest recorded price: ${formatPrice(params.currentPrice)}`,
    "",
    "THE CHALLENGE",
    `"${params.challengeMessage}"`,
    "",
    "EVIDENCE AUDIT — deterministic data-integrity check, no direction implied",
    `Factor challenged: ${params.attackedFactor}`,
    `Challenge validity: ${params.challengeValidity.toFixed(3)} of 1 | Evidence quality of that factor: ${params.evidenceQuality}/100`,
    ...params.verification.map((detail) => `${detail.label}: ${detail.value}`),
    `Factor-model conviction after re-weighting: ${params.convictionBefore} -> ${params.convictionAfter} (unweighted context only, not your confidence)`,
  ].join("\n");

  const raw = await chatOrThrow(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { json: true, maxTokens: 500, temperature: 0.6, timeoutMs: REVIEW_TIMEOUT_MS },
  );

  const parsedJson = extractJson<unknown>(raw);
  if (parsedJson === null) {
    console.error("[ai] unparseable challenge review payload", raw.slice(0, 400));
    throw new AiError("INVALID_AI_RESPONSE", "The AI model did not return valid JSON.");
  }

  const result = responseSchema.safeParse(parsedJson);
  if (!result.success) {
    const issue = result.error.issues[0];
    console.error("[ai] challenge review failed validation", result.error.issues.slice(0, 4));
    throw new AiError(
      "INVALID_AI_RESPONSE",
      `The AI model returned an unusable review (${issue ? `${issue.path.join(".") || "response"}: ${issue.message}` : "schema mismatch"}).`,
    );
  }

  const data = result.data;
  if (data.horizon_minutes !== params.horizonMinutes) {
    throw new AiError(
      "INVALID_AI_RESPONSE",
      `The AI model did not use the required ${battleHorizonLabel(params.horizonMinutes)} battle horizon.`,
    );
  }
  const reviewed = normalizeDecision(data.direction);
  if (reviewed === null) {
    console.error("[ai] unrecognised review decision", {
      returned: String(data.direction).slice(0, 40),
      accepted: ACCEPTED_DECISION_WORDS,
    });
    throw new AiError(
      "INVALID_AI_RESPONSE",
      `The AI model returned "${String(data.direction).slice(0, 24)}", which is not a decision it may make.`,
    );
  }
  return {
    direction: reviewed,
    confidence: Math.round(data.confidence),
    reasoning: data.reasoning.trim(),
    model: openRouterModel(),
  };
}
