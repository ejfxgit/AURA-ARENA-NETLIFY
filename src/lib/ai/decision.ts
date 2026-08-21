import { z } from "zod";
import type {
  AiDecisionDetail,
  Candle,
  Direction,
  Evidence,
  MarketSnapshot,
  NewsContext,
} from "../types";
import type { MarketSignals } from "./factors";
import { AiError, chatOrThrow, extractJson, openRouterModel } from "./openrouter";
import { battleHorizonLabel } from "../battle/timing";

// The agent's decision, made by the configured OpenRouter model.
//
// Nothing in this module decides anything itself. There is no heuristic, no
// default direction and no fallback confidence: either the model returns a valid
// decision or an AiError propagates and the caller reports an error state.

export interface AiDecision {
  direction: Direction;
  confidence: number;
  reasoning: string;
  detail: AiDecisionDetail;
}

/** The agent-specific half of the prompt. Built by the caller that knows the agent. */
export interface AgentBriefing {
  /** e.g. `You are VOLT, the momentum specialist.` */
  identity: string;
  /** Configuration the model must decide according to, one `label: value` per line. */
  configuration: string[];
}

const DECISION_TIMEOUT_MS = 25_000;

const MANDATE =
  "You are the selected trading agent. Make the trading decision yourself based on the supplied " +
  "market data, news and your configured personality/risk/behaviour. Do not follow a precomputed " +
  "direction — no direction has been chosen for you.";

const CONTRACT = `Return ONLY a JSON object, no prose around it:
{
  "direction": "LONG" | "SHORT" | "HOLD",
  "confidence": integer 0-100,
  "horizon_minutes": the exact integer horizon supplied in the decision request,
  "reasoning": "2-4 sentences in your own voice explaining why you chose this",
  "key_evidence": ["short factual points taken from the supplied data"],
  "invalidation": "what would make this decision wrong",
  "news_sentiment": "BULLISH" | "BEARISH" | "NEUTRAL" | null
}`;

const RULES = [
  "Decide only from the data supplied below. Never invent a price, candle, headline, URL, order-book level or on-chain figure.",
  "The technical context block is derived from the same OKX candles you were given. It is unweighted background, not a recommendation, and it contains no direction.",
  "Your risk tolerance and decision behaviour must be visible in BOTH the direction and the confidence you return.",
  "Set horizon_minutes to the exact supplied battle horizon. Discuss that same horizon in the reasoning without substituting a different duration.",
  "Set news_sentiment only from the articles listed. If no articles were supplied, set it to null and do not imply you read any.",
  "HOLD is a real answer. Choose it when your configuration would not take a position here.",
];

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return String(Number(value.toPrecision(8)));
}

/** Real OKX values only. Anything OKX did not supply is reported as unavailable. */
function marketBlock(snapshot: MarketSnapshot, candles: Candle[]): string {
  const closes = candles.map((candle) => candle.close);
  const recent = closes.slice(-24).map((close) => formatNumber(close)).join(", ");
  const lines = [
    "MARKET — OKX SPOT, live public market data",
    `Instrument: ${snapshot.instId} (${snapshot.symbol} / ${snapshot.name}), quoted in ${snapshot.quoteCurrency}`,
    `Last price: ${formatNumber(snapshot.price)}`,
    `24h open: ${formatNumber(snapshot.open24h)} | 24h change: ${
      snapshot.change24h === null ? "unavailable" : `${snapshot.change24h.toFixed(2)}%`
    } (${formatNumber(snapshot.change24hAbsolute)} ${snapshot.quoteCurrency})`,
    `24h high / low: ${formatNumber(snapshot.high24h)} / ${formatNumber(snapshot.low24h)}`,
    `24h volume: ${formatNumber(snapshot.volume24h)} ${snapshot.quoteCurrency} (${formatNumber(snapshot.volume24hBase)} ${snapshot.symbol})`,
    `Best bid / ask: ${formatNumber(snapshot.bid)} / ${formatNumber(snapshot.ask)}`,
    `Feed status: ${snapshot.status}${snapshot.stale ? " (quote is not live)" : ""}, quoted at ${snapshot.quotedAt}`,
  ];
  if (candles.length > 0) {
    lines.push(
      `Candles supplied: ${candles.length} x 1m, newest last`,
      `Recent 1m closes (oldest to newest): ${recent}`,
    );
  } else {
    lines.push("Candles supplied: none — OKX returned no candle series for this instrument.");
  }
  return lines.join("\n");
}

/**
 * Derived indicators, labelled as context.
 *
 * Factors with no connected data source are reported as unavailable rather than
 * as 0, because 0 reads as a measured neutral rather than an absence.
 */
function technicalBlock(signals: MarketSignals, evidence: Evidence[]): string {
  const availability = new Map<Evidence["type"], boolean>(
    evidence.map((item) => [item.type, item.available] as const),
  );
  const describe = (name: keyof MarketSignals, type?: Evidence["type"]): string => {
    if (type && availability.get(type) === false) return `${name}: unavailable (no data source connected)`;
    return `${name}: ${signals[name].toFixed(3)}`;
  };
  return [
    "TECHNICAL CONTEXT — derived from the candles above, signed -1.000 (bearish) to +1.000 (bullish).",
    "This is unweighted background only. It is not a recommendation and no direction has been inferred from it.",
    [
      describe("momentum"),
      describe("volume"),
      describe("liquidity"),
      describe("volatility"),
      describe("social", "SOCIAL"),
      describe("whale_activity", "ONCHAIN"),
    ].join(" | "),
  ].join("\n");
}

/** Real articles, an explicit absence, or an explicit failure — never a substitute. */
function newsBlock(news: NewsContext, symbol: string): string {
  if (news.status === "UNAVAILABLE") {
    return [
      `NEWS — UNAVAILABLE. ${news.reason ?? "No feed could be reached."}`,
      "No article text was retrieved. Decide from market data alone, say in your reasoning that news was unavailable, and set news_sentiment to null.",
    ].join("\n");
  }
  if (news.status === "NO_MATCHES") {
    return [
      `NEWS — no recent ${symbol} articles in ${news.sources.join(", ")}.`,
      "The feeds responded; there is simply no current coverage. That is an absence of news, not a failure. Set news_sentiment to null.",
    ].join("\n");
  }
  const items = news.items
    .map(
      (item, index) =>
        `${index + 1}. [${item.source} · ${item.publishedAt}] ${item.title}\n   ${item.url}${
          item.summary ? `\n   ${item.summary}` : ""
        }`,
    )
    .join("\n");
  return [
    `NEWS — ${news.items.length} real article(s) from public RSS feeds (${news.sources.join(", ")}).`,
    "These are the only articles available to you. Judge their impact yourself; no provider sentiment was supplied.",
    items,
  ].join("\n");
}

/**
 * The vocabulary a model may answer with, mapped to the three decisions AURA
 * persists. Case- and whitespace-insensitive.
 *
 * This is a SEMANTIC map, not an error handler. Every key is a real directional
 * answer. A response that is missing, unparseable, or uses a word that is not
 * listed here is an ERROR: it raises AiError so the caller reports an
 * unavailable decision. It must never be silently absorbed into WAIT, because a
 * fabricated "the agent chose to wait" is indistinguishable to the user from a
 * real one — which is precisely the failure this map exists to prevent.
 */
const DECISION_VOCABULARY: Record<string, Direction> = {
  LONG: "LONG",
  BUY: "LONG",
  BULLISH: "LONG",
  SHORT: "SHORT",
  SELL: "SHORT",
  BEARISH: "SHORT",
  WAIT: "WAIT",
  HOLD: "WAIT",
  NEUTRAL: "WAIT",
};

/**
 * The decision word a model returned, or null when it is not a decision at all.
 *
 * Exported so the challenge review (lib/ai/challenge-review.ts) understands the
 * same vocabulary — one map, so the two model call sites cannot drift.
 */
export function normalizeDecision(value: unknown): Direction | null {
  if (typeof value !== "string") return null;
  return DECISION_VOCABULARY[value.trim().toUpperCase()] ?? null;
}

/** Every word a model may answer with, for error messages and logging. */
export const ACCEPTED_DECISION_WORDS = Object.keys(DECISION_VOCABULARY);

const responseSchema = z.object({
  // Accepted as a free string here and normalized below, so an unrecognised
  // word produces a precise "unusable decision" error naming what came back
  // rather than a generic enum mismatch.
  direction: z.string(),
  confidence: z.coerce.number().finite().min(0).max(100),
  horizon_minutes: z.coerce.number().int().positive(),
  reasoning: z.string().trim().min(1),
  key_evidence: z.array(z.string()).optional(),
  invalidation: z.string().optional(),
  news_sentiment: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).nullish(),
  ),
});

/**
 * Asks the configured model to decide, then validates strictly.
 *
 * The model is asked for LONG / SHORT / HOLD, but any of the synonyms in
 * DECISION_VOCABULARY is accepted and mapped to the three decisions AURA
 * persists, so a model that answers "buy" or "bearish" is understood rather than
 * rejected. Anything outside that vocabulary — and any missing, unparseable or
 * off-horizon response — raises AiError. No failure path returns WAIT.
 */
export async function requestDecision(params: {
  briefing: AgentBriefing;
  snapshot: MarketSnapshot;
  candles: Candle[];
  signals: MarketSignals;
  evidence: Evidence[];
  news: NewsContext;
  horizonMinutes: number;
}): Promise<AiDecision> {
  const { briefing, snapshot, candles, signals, evidence, news, horizonMinutes } = params;

  const system = [
    briefing.identity,
    "",
    "YOUR CONFIGURATION — decide according to it:",
    ...briefing.configuration.map((line) => `- ${line}`),
    "",
    MANDATE,
    "",
    "RULES:",
    ...RULES.map((rule) => `- ${rule}`),
    "",
    CONTRACT,
  ].join("\n");

  const user = [
    `DECISION REQUEST — ${snapshot.symbol} over the next ${battleHorizonLabel(horizonMinutes)}.`,
    "",
    marketBlock(snapshot, candles),
    "",
    technicalBlock(signals, evidence),
    "",
    newsBlock(news, snapshot.symbol),
  ].join("\n");

  const raw = await chatOrThrow(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { json: true, maxTokens: 700, temperature: 0.6, timeoutMs: DECISION_TIMEOUT_MS },
  );

  const parsedJson = extractJson<unknown>(raw);
  if (parsedJson === null) {
    console.error("[ai] unparseable decision payload", raw.slice(0, 400));
    throw new AiError("INVALID_AI_RESPONSE", "The AI model did not return valid JSON.");
  }

  const result = responseSchema.safeParse(parsedJson);
  if (!result.success) {
    const issue = result.error.issues[0];
    console.error("[ai] decision failed validation", result.error.issues.slice(0, 4));
    throw new AiError(
      "INVALID_AI_RESPONSE",
      `The AI model returned an unusable decision (${issue ? `${issue.path.join(".") || "response"}: ${issue.message}` : "schema mismatch"}).`,
    );
  }

  const data = result.data;
  if (data.horizon_minutes !== horizonMinutes) {
    throw new AiError(
      "INVALID_AI_RESPONSE",
      `The AI model did not use the required ${battleHorizonLabel(horizonMinutes)} battle horizon.`,
    );
  }
  const direction = normalizeDecision(data.direction);
  if (direction === null) {
    console.error("[ai] unrecognised decision word", {
      returned: String(data.direction).slice(0, 40),
      accepted: ACCEPTED_DECISION_WORDS,
    });
    throw new AiError(
      "INVALID_AI_RESPONSE",
      `The AI model returned "${String(data.direction).slice(0, 24)}", which is not a decision it may make.`,
    );
  }
  const keyEvidence = (data.key_evidence ?? [])
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 6);

  return {
    direction,
    confidence: Math.round(data.confidence),
    reasoning: data.reasoning.trim(),
    detail: {
      keyEvidence,
      invalidation: (data.invalidation ?? "").trim(),
      // Null unless real articles reached the model, so an AI guess can never be
      // presented as coverage that did not exist.
      newsSentiment: news.status === "AVAILABLE" ? data.news_sentiment ?? null : null,
      model: openRouterModel(),
    },
  };
}
