// OKX Exchange market-data provider. SERVER-SIDE ONLY.
//
// Source: OKX API v5 public market-data endpoints
//   GET /api/v5/public/instruments?instType=SPOT   instrument catalogue
//   GET /api/v5/market/tickers?instType=SPOT       every SPOT ticker, one request
//   GET /api/v5/market/ticker?instId=<instId>      a single ticker
//   GET /api/v5/market/candles?instId=<instId>     candlesticks
//
// These are PUBLIC endpoints: no OK-ACCESS-KEY, no signature, no passphrase.
// AURA therefore sends no credentials here, and none are required.
//
// This module NEVER fabricates market data. Every failure path throws a
// MarketDataError describing what actually went wrong. There is no seeded
// price, no random noise, and no synthetic candle anywhere in this file.
//
// NOT to be confused with X Layer on-chain token data — see ./xlayer-tokens.ts.

import { serverConfig } from "../config";
import { displayNameFor } from "./assets";
import {
  MarketDataError,
  type CandleBar,
  type MarketCandle,
  type NormalizedMarket,
  type OkxApiResponse,
  type OkxCandleRow,
  type OkxInstrument,
  type OkxTicker,
  type MarketStatus,
} from "./okx-types";

/** A quote older than this is reported as STALE rather than LIVE. */
const STALE_AFTER_MS = 30_000;

/**
 * Cache TTLs. These exist to respect OKX rate limits — the documented limits
 * are per-endpoint and per-IP, so one cached upstream call serves every browser.
 * Conservative on purpose: the instrument catalogue changes rarely, tickers are
 * refreshed on the order of seconds.
 */
const TTL = {
  instruments: 10 * 60_000,
  tickers: 10_000,
  candles: 15_000,
} as const;

const REQUEST_TIMEOUT_MS = 8_000;

// -- cache with single-flight ----------------------------------------------
//
// Concurrent callers for the same key share one in-flight upstream request, so
// a burst of browser refreshes cannot multiply into a burst of OKX calls.

interface CacheEntry<T> {
  value: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.value as T;
  if (entry) cache.delete(key);
  return undefined;
}

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const task = load()
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task);
  return task;
}

/** Drops cached values so the next read goes upstream. Used by explicit refresh. */
export function invalidateMarketCache(): void {
  cache.clear();
}

// -- transport --------------------------------------------------------------

/**
 * Performs one GET against the OKX public REST API and validates the envelope.
 *
 * Throws MarketDataError for: timeout, network failure, non-2xx HTTP,
 * rate limiting, a non-"0" OKX `code`, or a body that is not the documented
 * `{ code, msg, data[] }` shape.
 */
async function okxGet<T>(
  path: string,
  params: Record<string, string>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T[]> {
  const url = new URL(path, serverConfig.okxApiBase);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new MarketDataError(
      aborted ? "timeout" : "network",
      aborted
        ? `OKX did not respond within ${timeoutMs}ms`
        : "Could not reach the OKX market API",
      undefined,
      504,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new MarketDataError("rate_limit", "OKX rate limit reached. Try again shortly.", undefined, 429);
  }
  if (!response.ok) {
    throw new MarketDataError("http", `OKX returned HTTP ${response.status}`, undefined, 502);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MarketDataError("malformed", "OKX returned a body that is not JSON", undefined, 502);
  }

  if (!body || typeof body !== "object") {
    throw new MarketDataError("malformed", "OKX response was not an object", undefined, 502);
  }
  const envelope = body as Partial<OkxApiResponse<T>>;
  if (typeof envelope.code !== "string") {
    throw new MarketDataError("malformed", "OKX response is missing its `code` field", undefined, 502);
  }
  // OKX signals rate limiting through code 50011 as well as HTTP 429.
  if (envelope.code === "50011") {
    throw new MarketDataError("rate_limit", "OKX rate limit reached. Try again shortly.", envelope.code, 429);
  }
  if (envelope.code !== "0") {
    throw new MarketDataError(
      "api_code",
      `OKX rejected the request (code ${envelope.code}: ${envelope.msg || "no message"})`,
      envelope.code,
      502,
    );
  }
  if (!Array.isArray(envelope.data)) {
    throw new MarketDataError("malformed", "OKX response `data` was not an array", envelope.code, 502);
  }
  return envelope.data;
}

// -- strict field parsing ---------------------------------------------------
//
// OKX sends every numeric as a string. A missing or unparseable field is a
// contract violation, not something to paper over with a zero: it raises
// `malformed` so the UI can say "market data unavailable" honestly.

function requireNumber(source: Record<string, unknown>, field: string, context: string): number {
  const raw = source[field];
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new MarketDataError(
      "malformed",
      `OKX ${context} is missing the \`${field}\` field`,
      undefined,
      502,
    );
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new MarketDataError(
      "malformed",
      `OKX ${context} returned a non-numeric \`${field}\``,
      undefined,
      502,
    );
  }
  return value;
}

/** For book sides that are legitimately empty ("" when nothing is resting). */
function optionalNumber(source: Record<string, unknown>, field: string): number | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function requireString(source: Record<string, unknown>, field: string, context: string): string {
  const raw = source[field];
  if (typeof raw !== "string" || !raw) {
    throw new MarketDataError(
      "malformed",
      `OKX ${context} is missing the \`${field}\` field`,
      undefined,
      502,
    );
  }
  return raw;
}

function statusFor(quotedAtMs: number, now = Date.now()): MarketStatus {
  return now - quotedAtMs <= STALE_AFTER_MS ? "LIVE" : "STALE";
}

/**
 * Derives 24h change from the two real fields OKX provides.
 *
 * OKX does NOT return a percentage-change field, so it is computed here as
 * ((last - open24h) / open24h) * 100. Guarded against a zero/absent open so a
 * division artefact can never masquerade as a price move.
 */
function change24h(last: number, open24h: number): { percent: number | null; absolute: number | null } {
  if (!Number.isFinite(open24h) || open24h === 0) return { percent: null, absolute: null };
  return { percent: ((last - open24h) / open24h) * 100, absolute: last - open24h };
}

// -- normalization ----------------------------------------------------------

export function toNormalizedMarket(
  ticker: OkxTicker,
  instrument: Pick<OkxInstrument, "baseCcy" | "quoteCcy" | "state">,
): NormalizedMarket {
  const raw = ticker as unknown as Record<string, unknown>;
  const context = `ticker for ${ticker.instId ?? "an unnamed instrument"}`;

  const instId = requireString(raw, "instId", context);
  const price = requireNumber(raw, "last", context);
  const open24h = requireNumber(raw, "open24h", context);
  const quotedAtMs = requireNumber(raw, "ts", context);
  const change = change24h(price, open24h);

  const baseCurrency = (instrument.baseCcy || instId.split("-")[0] || "").toUpperCase();
  const quoteCurrency = (instrument.quoteCcy || instId.split("-")[1] || "").toUpperCase();

  return {
    instId,
    baseCurrency,
    quoteCurrency,
    symbol: instId,
    displayName: `${baseCurrency} / ${quoteCurrency}`,
    baseName: displayNameFor(baseCurrency),
    price,
    open24h,
    change24hPercent: change.percent,
    change24hAbsolute: change.absolute,
    high24h: requireNumber(raw, "high24h", context),
    low24h: requireNumber(raw, "low24h", context),
    volume24hBase: requireNumber(raw, "vol24h", context),
    volume24hQuote: requireNumber(raw, "volCcy24h", context),
    bid: optionalNumber(raw, "bidPx"),
    ask: optionalNumber(raw, "askPx"),
    quotedAt: new Date(quotedAtMs).toISOString(),
    quotedAtMs,
    status: statusFor(quotedAtMs),
    instrumentState: instrument.state || "",
  };
}

function toMarketCandle(row: OkxCandleRow, instId: string): MarketCandle {
  // Documented positional layout:
  // [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
  if (!Array.isArray(row) || row.length < 6) {
    throw new MarketDataError(
      "malformed",
      `OKX returned a candle row for ${instId} with ${Array.isArray(row) ? row.length : 0} fields`,
      undefined,
      502,
    );
  }
  const at = (index: number, field: string): number => {
    const value = Number(row[index]);
    if (!Number.isFinite(value)) {
      throw new MarketDataError(
        "malformed",
        `OKX candle for ${instId} has a non-numeric ${field}`,
        undefined,
        502,
      );
    }
    return value;
  };

  const tsMs = at(0, "timestamp");

  // Quote volume: index 7 (volCcyQuote), else index 6 (volCcy), else unknown.
  // It is never backfilled from the base volume, which is a different quantity.
  const quoteVolume = [7, 6]
    .map((index) => (row.length > index ? Number(row[index]) : Number.NaN))
    .find((value) => Number.isFinite(value));

  return {
    time: Math.floor(tsMs / 1000),
    open: at(1, "open"),
    high: at(2, "high"),
    low: at(3, "low"),
    close: at(4, "close"),
    volume: at(5, "base volume"),
    volumeQuote: quoteVolume ?? null,
    closed: row.length > 8 ? row[8] === "1" : true,
  };
}

// -- instruments ------------------------------------------------------------

/**
 * The real OKX SPOT instrument catalogue. Never a hardcoded token list.
 * Only instruments OKX reports as tradable (`state === "live"`) are returned.
 */
export async function getSpotInstruments(): Promise<OkxInstrument[]> {
  return cached("instruments:SPOT", TTL.instruments, async () => {
    const rows = await okxGet<OkxInstrument>("/api/v5/public/instruments", { instType: "SPOT" });
    if (rows.length === 0) {
      throw new MarketDataError("empty", "OKX returned no SPOT instruments", undefined, 502);
    }
    return rows.filter(
      (row) => row && typeof row.instId === "string" && row.instId && row.state === "live",
    );
  });
}

/** Indexes the live catalogue by instId for O(1) validation and enrichment. */
export async function getInstrumentMap(): Promise<Map<string, OkxInstrument>> {
  const instruments = await getSpotInstruments();
  return new Map(instruments.map((instrument) => [instrument.instId, instrument]));
}

/** True only when OKX currently lists the instrument as live. */
export async function isTradableInstrument(instId: string): Promise<boolean> {
  const map = await getInstrumentMap();
  return map.has(instId.toUpperCase());
}

// -- tickers ----------------------------------------------------------------

/**
 * Every SPOT ticker in ONE upstream request, keyed by instId.
 *
 * This is deliberately a single call for the whole market overview: fetching
 * per-row would multiply OKX requests by the number of visible markets.
 */
export async function getSpotTickerMap(): Promise<Map<string, OkxTicker>> {
  return cached("tickers:SPOT", TTL.tickers, async () => {
    const rows = await okxGet<OkxTicker>("/api/v5/market/tickers", { instType: "SPOT" });
    if (rows.length === 0) {
      throw new MarketDataError("empty", "OKX returned no SPOT tickers", undefined, 502);
    }
    const map = new Map<string, OkxTicker>();
    for (const row of rows) {
      if (row && typeof row.instId === "string" && row.instId) map.set(row.instId, row);
    }
    return map;
  });
}

/**
 * Normalized markets for the whole SPOT universe, or for an explicit subset.
 * Instruments OKX does not currently quote are omitted rather than invented.
 */
export async function getMarkets(instIds?: string[]): Promise<NormalizedMarket[]> {
  const [instruments, tickers] = await Promise.all([getInstrumentMap(), getSpotTickerMap()]);

  const wanted = instIds?.length
    ? instIds.map((id) => id.toUpperCase())
    : Array.from(instruments.keys());

  const markets: NormalizedMarket[] = [];
  for (const instId of wanted) {
    const instrument = instruments.get(instId);
    const ticker = tickers.get(instId);
    if (!instrument || !ticker) continue;
    markets.push(toNormalizedMarket(ticker, instrument));
  }
  return markets;
}

/** One market. Throws `unknown_instrument` when OKX does not list it. */
export async function getMarket(instId: string): Promise<NormalizedMarket> {
  const id = instId.toUpperCase();
  const instruments = await getInstrumentMap();
  const instrument = instruments.get(id);
  if (!instrument) {
    throw new MarketDataError(
      "unknown_instrument",
      `OKX does not list a live SPOT market for ${id}`,
      undefined,
      404,
    );
  }

  // Reuse the bulk snapshot when it is already warm; otherwise ask for just
  // this instrument rather than pulling the entire ticker set.
  const warm = cacheGet<Map<string, OkxTicker>>("tickers:SPOT");
  const pooled = warm?.get(id);
  if (pooled) return toNormalizedMarket(pooled, instrument);

  const rows = await cached(`ticker:${id}`, TTL.tickers, () =>
    okxGet<OkxTicker>("/api/v5/market/ticker", { instId: id }),
  );
  if (rows.length === 0) {
    throw new MarketDataError("empty", `OKX returned no ticker for ${id}`, undefined, 502);
  }
  return toNormalizedMarket(rows[0], instrument);
}

/** Last traded price only. Throws rather than returning a fabricated number. */
export async function getMarketPrice(instId: string): Promise<number> {
  return (await getMarket(instId)).price;
}

// -- candles ----------------------------------------------------------------

/**
 * Real candlesticks from GET /api/v5/market/candles.
 *
 * OKX returns newest-first; AURA's chart expects oldest-first, so rows are
 * reversed. Nothing is interpolated: a short series stays short.
 */
export async function getCandles(
  instId: string,
  bar: CandleBar = "1m",
  limit = 100,
): Promise<MarketCandle[]> {
  const id = instId.toUpperCase();
  const capped = Math.max(1, Math.min(300, Math.floor(limit)));

  const rows = await cached(`candles:${id}:${bar}:${capped}`, TTL.candles, () =>
    okxGet<OkxCandleRow>("/api/v5/market/candles", {
      instId: id,
      bar,
      limit: String(capped),
    }),
  );

  if (rows.length === 0) {
    throw new MarketDataError("empty", `OKX returned no candles for ${id}`, undefined, 502);
  }
  return rows.map((row) => toMarketCandle(row, id)).sort((a, b) => a.time - b.time);
}
