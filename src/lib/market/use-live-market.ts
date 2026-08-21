"use client";

// React bindings for the central market-data service.
//
// These hooks are the ONLY way components should read live market state. They
// use useSyncExternalStore, so a component re-renders exactly when the slice it
// subscribed to actually changes — a ticker update for ETH does not re-render a
// BTC row, and a candle update does not re-render the header.
//
// Every hook cleans up its subscription on unmount and on instrument change,
// which is what stops a stale market's stream from continuing.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { api, ApiError } from "../client";
import {
  marketData,
  type ConnectionStatus,
  type LiveCandle,
  type LiveTicker,
} from "./market-data-service";
import type { CandleBar, NormalizedMarket } from "./okx-types";

// -- connection status ------------------------------------------------------

export function useMarketConnection(): ConnectionStatus {
  return useSyncExternalStore(
    useCallback((listener: () => void) => marketData.onStatus(listener), []),
    () => marketData.getStatus(),
    () => "idle" as ConnectionStatus,
  );
}

// -- live ticker ------------------------------------------------------------

/**
 * Live ticker for one instrument. `undefined` until the first real frame
 * arrives — callers must render an explicit pending/unavailable state rather
 * than substituting a number.
 */
export function useLiveTicker(instId: string | null | undefined): LiveTicker | undefined {
  const id = instId ? instId.toUpperCase() : "";

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!id) return () => {};
      return marketData.subscribeTicker(id, listener);
    },
    [id],
  );

  return useSyncExternalStore(
    subscribe,
    () => (id ? marketData.getTicker(id) : undefined),
    () => undefined,
  );
}

/**
 * Live tickers for a bounded list of instruments. All subscriptions share the
 * central reference-counted OKX socket; no REST polling is added here.
 */
export function useLiveTickers(instIds: readonly string[]): Record<string, LiveTicker> {
  const key = instIds.map((id) => id.toUpperCase()).sort().join("|");
  const [tickers, setTickers] = useState<Record<string, LiveTicker>>({});

  useEffect(() => {
    const ids = key ? key.split("|") : [];
    const sync = () => {
      setTickers((previous) => {
        let changed = Object.keys(previous).length !== ids.filter((id) => marketData.getTicker(id)).length;
        const next: Record<string, LiveTicker> = {};
        for (const id of ids) {
          const ticker = marketData.getTicker(id);
          if (ticker) {
            next[id] = ticker;
            if (previous[id] !== ticker) changed = true;
          }
        }
        return changed ? next : previous;
      });
    };

    sync();
    const unsubscribers = ids.map((id) => marketData.subscribeTicker(id, sync));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [key]);

  return tickers;
}

/** Live last price, or null when nothing real has arrived yet. */
export function useLivePrice(
  instId: string | null | undefined,
  bar?: CandleBar,
): number | null {
  const ticker = useLiveTicker(instId);
  const candles = useLiveCandleStore(instId, bar);
  if (ticker && Number.isFinite(ticker.last)) return ticker.last;
  const latest = candles?.[candles.length - 1];
  return latest && Number.isFinite(latest.close) ? latest.close : null;
}

// -- live candles -----------------------------------------------------------

/** Raw candle store access without REST seeding. Used internally. */
function useLiveCandleStore(
  instId: string | null | undefined,
  bar: CandleBar | undefined,
): LiveCandle[] | undefined {
  const id = instId ? instId.toUpperCase() : "";

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!id || !bar) return () => {};
      return marketData.subscribeCandles(id, bar, listener);
    },
    [id, bar],
  );

  return useSyncExternalStore(
    subscribe,
    () => (id && bar ? marketData.getCandles(id, bar) : undefined),
    () => undefined,
  );
}

export interface LiveCandlesResult {
  candles: LiveCandle[];
  /** True while the REST history for this series is still loading. */
  loading: boolean;
  /** Real error text when history could not be loaded. Never a silent empty. */
  error: string | null;
}

/**
 * A live candle series: real REST history seeded once, then kept current by the
 * websocket. Switching instrument or interval tears down the previous
 * subscription and seeds the new series.
 *
 * Nothing is generated here. If history fails the error is surfaced and the
 * chart shows an unavailable state.
 */
export function useLiveCandles(
  instId: string | null | undefined,
  bar: CandleBar,
  limit = 200,
): LiveCandlesResult {
  const id = instId ? instId.toUpperCase() : "";
  const live = useLiveCandleStore(id, bar);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards against a slow response for a market the user already switched away
  // from overwriting the current series.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    const token = ++requestRef.current;
    let cancelled = false;

    setLoading(true);
    setError(null);

    api<{ candles: LiveCandle[]; candleError?: { message?: string } }>(
      `/api/markets/${encodeURIComponent(id)}?bar=${bar}&limit=${limit}`,
    )
      .then((data) => {
        if (cancelled || token !== requestRef.current) return;
        const history = Array.isArray(data.candles) ? data.candles : [];
        if (history.length > 0) {
          marketData.seedCandles(id, bar, history);
          setError(null);
        } else {
          setError(data.candleError?.message ?? "Chart data unavailable.");
        }
      })
      .catch((e: unknown) => {
        if (cancelled || token !== requestRef.current) return;
        setError(e instanceof ApiError ? e.message : "Chart data unavailable.");
      })
      .finally(() => {
        if (cancelled || token !== requestRef.current) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, bar, limit]);

  return useMemo(
    () => ({ candles: live ?? [], loading, error }),
    [live, loading, error],
  );
}

// -- market registry --------------------------------------------------------

export interface MarketRegistryEntry {
  /** OKX instrument id, e.g. "BTC-USDT". */
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  /** "BTC / USDT". */
  displayName: string;
  /** Long-form base-currency name, e.g. "Bitcoin". */
  name: string;
  /** Last REST-known price. Live updates come from useLiveTicker. */
  price: number;
  priceChange24h: number | null;
  volume24h: number;
  high24h: number;
  low24h: number;
  status: NormalizedMarket["status"];
  instrumentState: string;
}

export interface MarketRegistry {
  markets: MarketRegistryEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function toRegistryEntry(market: NormalizedMarket): MarketRegistryEntry {
  return {
    symbol: market.instId,
    baseAsset: market.baseCurrency,
    quoteAsset: market.quoteCurrency,
    displayName: market.displayName,
    name: market.baseName,
    price: market.price,
    priceChange24h: market.change24hPercent,
    volume24h: market.volume24hQuote,
    high24h: market.high24h,
    low24h: market.low24h,
    status: market.status,
    instrumentState: market.instrumentState,
  };
}

/**
 * Module-level registry cache.
 *
 * Every consumer — the Markets page, the Arena selector, the agent-analysis
 * select — shares ONE fetch and one result set. Without this each mounted
 * selector would pull its own copy of the instrument catalogue and they could
 * briefly disagree about which markets exist. This is what makes the registry a
 * single source of truth rather than three copies of the same idea.
 */
const REGISTRY_TTL_MS = 60_000;

interface RegistryCache {
  entries: MarketRegistryEntry[];
  expires: number;
}

let registryCache: RegistryCache | null = null;
let registryInflight: Promise<MarketRegistryEntry[]> | null = null;

function loadRegistry(limit: number, force: boolean): Promise<MarketRegistryEntry[]> {
  if (!force && registryCache && registryCache.expires > Date.now()) {
    return Promise.resolve(registryCache.entries);
  }
  // Concurrent mounts share the in-flight request instead of racing.
  if (!force && registryInflight) return registryInflight;

  const task = api<{ markets: NormalizedMarket[] }>(`/api/markets?limit=${limit}&sort=volume`)
    .then((data) => {
      const entries = (data.markets ?? []).map(toRegistryEntry);
      registryCache = { entries, expires: Date.now() + REGISTRY_TTL_MS };
      return entries;
    })
    .finally(() => {
      registryInflight = null;
    });

  registryInflight = task;
  return task;
}

/**
 * The tradable market list, built from the real OKX SPOT instrument catalogue
 * via /api/markets. There is no hardcoded symbol list anywhere in this path —
 * whatever OKX lists is what the selector offers.
 */
export function useMarketRegistry(limit = 500): MarketRegistry {
  const [markets, setMarkets] = useState<MarketRegistryEntry[]>(
    () => registryCache?.entries ?? [],
  );
  const [loading, setLoading] = useState(() => !registryCache);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadRegistry(limit, nonce > 0)
      .then((entries) => {
        if (cancelled) return;
        setMarkets(entries);
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // No fallback list: an empty registry with a real error, never invented
        // markets.
        setMarkets([]);
        setError(e instanceof ApiError ? e.message : "Market list unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [limit, nonce]);

  return useMemo(
    () => ({ markets, loading, error, reload }),
    [markets, loading, error, reload],
  );
}
