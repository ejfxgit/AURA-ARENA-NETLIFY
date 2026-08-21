"use client";

// Live agent signal — the browser-side strategy engine.
//
// This closes the loop the user actually cares about:
//
//   live websocket stream -> market state -> strategy engine -> signal
//                                                -> position -> P&L -> UI
//
// It runs the SAME deterministic math the server runs when it persists a
// battle's thesis (lib/ai/factors.ts for built-in agents, lib/ai/custom-strategy.ts
// for custom ones), just against live data instead of a one-shot snapshot. There
// is no separate formula for the UI, so the panel cannot disagree with the
// stored battle for arbitrary reasons.
//
// Honesty rules enforced here:
//   * no signal is produced until enough REAL candles have arrived — the state
//     is reported as "analyzing" and the UI says so
//   * every signal records the price it was computed from and the timestamp of
//     that computation, so "confidence 68%" is always attributable
//   * a WAIT signal never produces a position
//   * nothing is randomised, seeded, or smoothed

import { useEffect, useRef, useState } from "react";
import { buildFactors, computeSignals } from "../ai/factors";
import { getAgent } from "../agents";
import { buildConfiguredFactors, customAgentDirectionForConviction } from "../ai/custom-strategy";
import {
  classifyDirection,
  convictionToConfidence,
  directionalConviction,
} from "../engine/recalc";
import { positionPnl } from "../battle/engine";
import { displayNameFor } from "./assets";
import type { LiveCandle, LiveTicker } from "./market-data-service";
import type {
  AgentId,
  Candle,
  CustomAgentBattleSnapshot,
  Direction,
  Factor,
  MarketSnapshot,
} from "../types";

/**
 * Minimum real candles before a signal is meaningful.
 *
 * computeSignals() falls back to a coarse 24h-change proxy below ~16 bars; that
 * proxy is real but far weaker, and publishing a confident-looking percentage
 * from it would overstate what has actually been measured.
 */
const MIN_CANDLES_FOR_SIGNAL = 20;

export type LiveSignalState = "analyzing" | "ready" | "unavailable";

export interface LiveSignal {
  state: LiveSignalState;
  /** null unless state === "ready". */
  direction: Direction | null;
  /** null unless state === "ready". Never a placeholder number. */
  confidence: number | null;
  factors: Factor[];
  /** The live price this decision was computed from. */
  decisionPrice: number | null;
  /** When this decision was computed (epoch ms). */
  decidedAt: number | null;
  /** How many real candles fed the decision. */
  sampleSize: number;
  /** Human-readable reason when not ready. */
  note: string | null;
}

const EMPTY_SIGNAL: LiveSignal = {
  state: "unavailable",
  direction: null,
  confidence: null,
  factors: [],
  decisionPrice: null,
  decidedAt: null,
  sampleSize: 0,
  note: "Waiting for live market data.",
};

/** Builds the MarketSnapshot shape the strategy engine expects from live data. */
function snapshotFromLive(ticker: LiveTicker, latestClose: number): MarketSnapshot {
  const [base, quote] = ticker.instId.toUpperCase().split("-");
  const price = Number.isFinite(ticker.last) ? ticker.last : latestClose;
  return {
    symbol: base ?? ticker.instId,
    instId: ticker.instId,
    name: displayNameFor(base ?? ticker.instId),
    quoteCurrency: quote ?? "",
    price,
    open24h: ticker.open24h,
    change24h: ticker.changePercent,
    change24hAbsolute: ticker.changeAbsolute,
    volume24h: ticker.volCcy24h,
    volume24hBase: ticker.vol24h,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    bid: ticker.bid,
    ask: ticker.ask,
    status: "LIVE",
    instrumentState: "live",
    quotedAt: new Date(ticker.ts).toISOString(),
    updatedAt: new Date().toISOString(),
    stale: false,
    // The market feed carries no verdict. The verdict is what this module
    // computes, from the feed.
    aiSignal: null,
    aiConfidence: null,
  };
}

/** LiveCandle -> the Candle shape the strategy engine consumes. */
function toCandle(candle: LiveCandle): Candle {
  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export interface LiveSignalInput {
  ticker: LiveTicker | undefined;
  candles: LiveCandle[];
  /** Built-in agent id, or null when a custom agent is used. */
  agentId: AgentId | null;
  /** Custom agent configuration, or null when a built-in agent is used. */
  customAgent: CustomAgentBattleSnapshot | null;
}

/**
 * Computes a signal from live market state. Pure — same inputs, same output.
 */
export function computeLiveSignal(input: LiveSignalInput): LiveSignal {
  const { ticker, candles, agentId, customAgent } = input;

  if (!ticker && candles.length === 0) return EMPTY_SIGNAL;

  const latest = candles[candles.length - 1];
  const latestClose = latest ? latest.close : Number.NaN;
  const price = ticker && Number.isFinite(ticker.last) ? ticker.last : latestClose;

  if (!Number.isFinite(price)) return EMPTY_SIGNAL;
  if (!ticker) {
    return {
      ...EMPTY_SIGNAL,
      state: "analyzing",
      sampleSize: candles.length,
      decisionPrice: price,
      note: "Waiting for the live ticker.",
    };
  }
  if (candles.length < MIN_CANDLES_FOR_SIGNAL) {
    return {
      ...EMPTY_SIGNAL,
      state: "analyzing",
      sampleSize: candles.length,
      decisionPrice: price,
      note: `Collecting candles (${candles.length}/${MIN_CANDLES_FOR_SIGNAL}).`,
    };
  }

  const snapshot = snapshotFromLive(ticker, latestClose);
  const signals = computeSignals(snapshot, candles.map(toCandle));

  if (customAgent) {
    const built = buildConfiguredFactors(customAgent, signals);
    const conviction = directionalConviction(built.factors);
    if (conviction === null) {
      return {
        ...EMPTY_SIGNAL,
        factors: built.factors,
        decisionPrice: price,
        sampleSize: candles.length,
        note: "No directional factor has a connected data source.",
      };
    }
    return {
      state: "ready",
      direction: customAgentDirectionForConviction(customAgent, built.stance, conviction),
      confidence: convictionToConfidence(conviction),
      factors: built.factors,
      decisionPrice: price,
      decidedAt: Date.now(),
      sampleSize: candles.length,
      note: null,
    };
  }

  if (!agentId) return { ...EMPTY_SIGNAL, note: "No agent selected." };

  // Built-in agent: buildFactors() is the one implementation of this scoring.
  // This used to be a hand-copied duplicate of it, which meant the availability
  // fix had to be made in two places to take effect.
  const built = buildFactors(getAgent(agentId), signals);
  const conviction = directionalConviction(built.factors);
  if (conviction === null) {
    return {
      ...EMPTY_SIGNAL,
      factors: built.factors,
      decisionPrice: price,
      sampleSize: candles.length,
      note: "No directional factor has a connected data source.",
    };
  }

  return {
    state: "ready",
    direction: classifyDirection(built.stance, conviction),
    confidence: convictionToConfidence(conviction),
    factors: built.factors,
    decisionPrice: price,
    decidedAt: Date.now(),
    sampleSize: candles.length,
    note: null,
  };
}

/**
 * Recomputes the live signal on a fixed cadence rather than on every tick.
 *
 * Prices arrive many times per second; re-running the factor model that often
 * would burn CPU and make the displayed confidence jitter unreadably. The
 * cadence throttles RECOMPUTATION only — the displayed price, position and P&L
 * still update on every tick, because those read the live store directly.
 */
export function useLiveSignal(
  input: LiveSignalInput,
  recomputeMs = 5_000,
): LiveSignal {
  const [signal, setSignal] = useState<LiveSignal>(EMPTY_SIGNAL);
  const inputRef = useRef(input);
  inputRef.current = input;

  const identity = `${input.agentId ?? ""}:${input.customAgent?.id ?? ""}:${input.ticker?.instId ?? ""}`;

  useEffect(() => {
    // Recompute immediately on identity change (market or agent switch) so a
    // stale market's signal is never shown against a new market.
    setSignal(computeLiveSignal(inputRef.current));
    const id = setInterval(() => setSignal(computeLiveSignal(inputRef.current)), recomputeMs);
    return () => clearInterval(id);
  }, [identity, recomputeMs]);

  return signal;
}

// -- live position / P&L ----------------------------------------------------

export interface LivePosition {
  /** null when there is no position (WAIT, or no real price yet). */
  pnl: number | null;
  /** Percent move from entry to the live price. null when unavailable. */
  movePercent: number | null;
  /** Seconds since the position opened. null when it has not opened. */
  secondsInPosition: number | null;
}

/**
 * Live unrealized P&L for a position, from the same live price the rest of the
 * UI shows. Uses the shared server-side P&L function so the number the user
 * watches matches the number the server will settle with.
 *
 * The server remains authoritative for settlement — this is the live view of an
 * open position, not a settlement.
 */
export function computeLivePosition(params: {
  direction: Direction;
  amount: number;
  entryPrice: number;
  livePrice: number | null;
  startedAt: string | null;
  leverage: number;
  now?: number;
}): LivePosition {
  const { direction, amount, entryPrice, livePrice, startedAt, leverage } = params;
  const now = params.now ?? Date.now();

  const secondsInPosition = startedAt
    ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
    : null;

  // WAIT holds no position, so there is nothing to value.
  if (direction === "WAIT") {
    return { pnl: null, movePercent: null, secondsInPosition };
  }
  if (livePrice === null || !Number.isFinite(livePrice) || entryPrice <= 0) {
    return { pnl: null, movePercent: null, secondsInPosition };
  }

  return {
    pnl: positionPnl(direction, amount, entryPrice, livePrice, leverage),
    movePercent: ((livePrice - entryPrice) / entryPrice) * 100,
    secondsInPosition,
  };
}

/** "0:42" / "5:03" / "1:02:11" from a second count. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * A timestamp that advances once per second while `active`.
 *
 * Used only for elapsed-time labels ("time in position"). It drives no market
 * value — prices and P&L come from the live stream, never from this timer.
 */
export function useClockSeconds(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}
