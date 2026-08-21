// Market adapter — the stable surface every existing consumer already imports
// (/api/markets, /api/markets/[symbol], /api/battles/*, /api/agents/analyze,
// /api/custom-agents/analyze, /api/news/sync).
//
// Backed entirely by the OKX Exchange public API via ./okx.ts.
//
// There is NO fallback market data in this module. No seeded price, no random
// noise, no synthetic candle, no fabricated AI confidence. When OKX cannot be
// reached the functions throw MarketDataError and each caller surfaces a real
// error state — the two battle routes that poll a live price already catch and
// keep the last real price, which is why throwing is safe here.

import type { Candle, MarketSnapshot } from "../types";
import { assetBySymbol, type AssetDef } from "./assets";
import {
  getCandles as okxCandles,
  getMarket,
  getMarketPrice,
  getMarkets,
  invalidateMarketCache,
  isTradableInstrument,
} from "./okx";
import {
  MarketDataError,
  type CandleBar,
  type MarketCandle,
  type NormalizedMarket,
} from "./okx-types";

export { assetBySymbol, assetFromInstrument, displayNameFor } from "./assets";
export type { AssetDef } from "./assets";
export { invalidateMarketCache };
export {
  getMarkets,
  getMarket,
  getSpotInstruments,
  getInstrumentMap,
  isTradableInstrument,
} from "./okx";
export {
  MarketDataError,
  CANDLE_BARS,
  isCandleBar,
  type CandleBar,
  type MarketCandle,
  type MarketStatus,
  type NormalizedMarket,
} from "./okx-types";

/** Adapts a normalized OKX market to the MarketSnapshot shape consumers use. */
export function snapshotFromMarket(market: NormalizedMarket): MarketSnapshot {
  return {
    symbol: market.baseCurrency,
    instId: market.instId,
    name: market.baseName,
    quoteCurrency: market.quoteCurrency,
    price: market.price,
    open24h: market.open24h,
    change24h: market.change24hPercent,
    change24hAbsolute: market.change24hAbsolute,
    volume24h: market.volume24hQuote,
    volume24hBase: market.volume24hBase,
    high24h: market.high24h,
    low24h: market.low24h,
    bid: market.bid,
    ask: market.ask,
    status: market.status,
    instrumentState: market.instrumentState,
    quotedAt: market.quotedAt,
    updatedAt: new Date().toISOString(),
    stale: market.status !== "LIVE",
    // Deliberately null. The market feed carries no AI verdict: a real thesis
    // is produced only by /api/agents/analyze and /api/custom-agents/analyze
    // from this snapshot plus real candles. Nothing here invents a percentage.
    aiSignal: null,
    aiConfidence: null,
  };
}

/** Real snapshot for one asset. Throws when OKX cannot supply it. */
export async function getSnapshot(def: AssetDef): Promise<MarketSnapshot> {
  return snapshotFromMarket(await getMarket(def.instId));
}

/**
 * Snapshots for the whole live SPOT universe, or for an explicit subset.
 *
 * With no argument this returns every instrument OKX currently lists — there is
 * no preselected symbol list. Backed by one bulk ticker request.
 */
export async function getAllSnapshots(instIds?: string[]): Promise<MarketSnapshot[]> {
  const markets = await getMarkets(instIds?.length ? instIds : undefined);
  return markets.map(snapshotFromMarket);
}

/** Converts a real OKX candle to the Candle shape PriceChart consumes. */
export function candleFromMarketCandle(candle: MarketCandle): Candle {
  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

/**
 * Real candles for an asset. `limit` is honoured up to OKX's page size; a short
 * series stays short rather than being padded with invented points.
 */
export async function getCandles(
  def: AssetDef,
  limit = 100,
  bar: CandleBar = "1m",
): Promise<Candle[]> {
  const candles = await okxCandles(def.instId, bar, limit);
  return candles.map(candleFromMarketCandle);
}

/** Full-fidelity candles, including the quote volume and confirm flag. */
export async function getMarketCandles(
  def: AssetDef,
  limit = 100,
  bar: CandleBar = "1m",
): Promise<MarketCandle[]> {
  return okxCandles(def.instId, bar, limit);
}

/**
 * Last traded price, used by the battle engine for P&L.
 *
 * Throws when OKX is unavailable. Callers in /api/battles/[id] and
 * /api/battles/[id]/start|finish already catch this and retain the last real
 * price, so a feed outage never writes an invented price into a battle.
 */
export async function getPrice(def: AssetDef): Promise<number> {
  return getMarketPrice(def.instId);
}

/** Resolves a user-supplied symbol, rejecting anything OKX does not list. */
export async function resolveTradableAsset(symbol: string): Promise<AssetDef> {
  const def = assetBySymbol(symbol);
  if (!def) {
    throw new MarketDataError("unknown_instrument", `"${symbol}" is not a valid instrument id`, undefined, 400);
  }
  if (!(await isTradableInstrument(def.instId))) {
    throw new MarketDataError(
      "unknown_instrument",
      `OKX does not list a live SPOT market for ${def.instId}`,
      undefined,
      404,
    );
  }
  return def;
}
