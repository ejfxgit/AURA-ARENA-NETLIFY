import type { AgentId, Battle, Challenge, Direction, Recalculation } from "../types";
import { evaluateChallenge } from "../evidence/engine";
import { recalculate, stanceOf } from "../engine/recalc";
import { builtInBriefingFor, explainRecalculation } from "../ai/thesis";
import {
  customAgentDirectionForConviction,
  customBriefing,
  explainCustomRecalculation,
} from "../ai/custom-thesis";
import { requestChallengeReview, type ChallengeReview } from "../ai/challenge-review";
import { AiError } from "../ai/openrouter";
import { uid } from "../utils";

// Full challenge pipeline: classify -> gather evidence -> evaluate ->
// recalculate weights -> (only if the challenge is material) ask the model to
// re-decide -> explain.
//
// THE DIRECTION IS THE MODEL'S. The deterministic factor math in
// ../engine/recalc.ts audits the attacked factor's weight and reports a
// conviction number, and that is all it does here: its `classify` mapping is
// analysis only and never becomes `thesis.direction` or `battle.ai_direction`.
// A challenge can only move the traded side by way of a fresh, strictly
// validated OpenRouter decision (../ai/challenge-review.ts). If that call fails,
// the battle keeps the decision the model already made — deterministic factor
// math is never substituted for an AI decision.

/** The agent's decision after the challenge, and where it came from. */
export interface ChallengeDecision {
  direction: Direction;
  confidence: number;
  source: "AI_REVIEW" | "UNCHANGED";
}

export async function runChallenge(
  battle: Battle,
  userId: string,
  message: string,
): Promise<{
  challenge: Challenge;
  recalculation: Recalculation;
  decision: ChallengeDecision;
}> {
  const thesis = battle.thesis;
  const evalResult = evaluateChallenge(thesis.asset, message);
  const stance = stanceOf(thesis.direction);

  // Deterministic weight/conviction audit. ANALYSIS ONLY — see the note above.
  const analysis = recalculate({
    factors: thesis.factors,
    stance,
    attackedFactor: evalResult.factor,
    challengeValidity: evalResult.challengeValidity,
    evidenceQuality: evalResult.evidenceQuality,
    classify: battle.agentId === "custom" && battle.customAgent
      ? (activeStance, conviction) => customAgentDirectionForConviction(battle.customAgent!, activeStance, conviction)
      : undefined,
  });

  // The decision currently on the record is the model's own. It is the baseline,
  // and it stays the answer unless the model itself replaces it below.
  const canonicalDirection = thesis.direction;
  const canonicalConfidence = thesis.confidence;

  // Only re-ask when the audit says this challenge materially undermines the
  // factor it attacked. An immaterial challenge cannot move the decision at all.
  let reviewed: ChallengeReview | null = null;
  let reviewError: string | null = null;
  if (analysis.materiallyValid) {
    try {
      reviewed = await requestChallengeReview({
        briefing: battle.agentId === "custom" && battle.customAgent
          ? customBriefing(battle.customAgent)
          : builtInBriefingFor(battle.agentId as AgentId),
        asset: thesis.asset,
        horizonMinutes: thesis.horizon_minutes,
        currentDirection: canonicalDirection,
        currentConfidence: canonicalConfidence,
        originalReasoning: thesis.summary,
        keyEvidence: thesis.decision?.keyEvidence ?? [],
        invalidation: thesis.decision?.invalidation ?? "",
        entryPrice: battle.entry_price,
        currentPrice: battle.current_price,
        challengeMessage: message,
        attackedFactor: evalResult.factor,
        challengeValidity: evalResult.challengeValidity,
        evidenceQuality: evalResult.evidenceQuality,
        verification: evalResult.verification,
        convictionBefore: analysis.oldConfidence,
        convictionAfter: analysis.newConfidence,
      });
    } catch (error) {
      // No fallback direction and no fallback confidence: the challenge is still
      // recorded, but the decision remains exactly as the model last made it.
      reviewError = error instanceof AiError
        ? error.message
        : "The AI model could not review this challenge.";
      console.error(`[challenge] review unavailable for ${battle.id}`, reviewError);
    }
  }

  const newDirection = reviewed ? reviewed.direction : canonicalDirection;
  const newConfidence = reviewed ? reviewed.confidence : canonicalConfidence;

  // When the model reviewed, its own words are the reaction. Otherwise narrate
  // the audit — narration restates real numbers and decides nothing.
  const explanation = reviewed
    ? reviewed.reasoning
    : battle.agentId === "custom" && battle.customAgent
      ? await explainCustomRecalculation({
          agent: battle.customAgent,
          asset: thesis.asset,
          factor: evalResult.factor,
          materiallyValid: analysis.materiallyValid,
          oldConfidence: canonicalConfidence,
          newConfidence,
          oldDirection: canonicalDirection,
          newDirection,
          challengeMessage: message,
          evidenceQuality: evalResult.evidenceQuality,
        })
      : await explainRecalculation({
          agentId: battle.agentId as Exclude<typeof battle.agentId, "custom">,
          asset: thesis.asset,
          factor: evalResult.factor,
          materiallyValid: analysis.materiallyValid,
          oldConfidence: canonicalConfidence,
          newConfidence,
          oldDirection: canonicalDirection,
          newDirection,
          challengeMessage: message,
          evidenceQuality: evalResult.evidenceQuality,
        });

  const recalculation: Recalculation = {
    challengeId: "",
    attackedFactor: evalResult.factor,
    challenge_validity: evalResult.challengeValidity,
    evidence_quality: evalResult.evidenceQuality,
    old_weights: analysis.oldWeights,
    new_weights: analysis.newWeights,
    // The agent's own confidence and direction, before and after. These differ
    // only when the model itself returned a different answer.
    old_confidence: canonicalConfidence,
    new_confidence: newConfidence,
    old_direction: canonicalDirection,
    new_direction: newDirection,
    materiallyValid: analysis.materiallyValid,
    verification: evalResult.verification,
    explanation,
    createdAt: new Date().toISOString(),
    conviction_before: analysis.oldConfidence,
    conviction_after: analysis.newConfidence,
    decision_source: reviewed ? "AI_REVIEW" : "UNCHANGED",
    review_model: reviewed?.model ?? null,
    review_error: reviewError,
  };

  const challenge: Challenge = {
    id: uid("chal"),
    battleId: battle.id,
    agentId: battle.agentId,
    userId,
    message,
    createdAt: new Date().toISOString(),
    recalculation,
  };
  recalculation.challengeId = challenge.id;

  // Weight bookkeeping is deterministic and stays. The direction and confidence
  // are only written when the model itself supplied them.
  thesis.factors = analysis.newWeights;
  if (reviewed) {
    thesis.direction = reviewed.direction;
    thesis.confidence = reviewed.confidence;
  }

  return {
    challenge,
    recalculation,
    decision: {
      direction: newDirection,
      confidence: newConfidence,
      source: reviewed ? "AI_REVIEW" : "UNCHANGED",
    },
  };
}
