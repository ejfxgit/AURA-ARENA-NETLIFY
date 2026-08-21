// OKX Exchange (api/v5) wire types + AURA's normalized market types.
//
// Two distinct systems must not be confused:
//   * OKX Exchange  -> exchange market data (prices, tickers, candles)  [this file]
//   * X Layer       -> blockchain / on-chain token data                [./xlayer-types.ts]
//
// Every wire type here is validated at runtime by ./okx.ts before use. If OKX
// changes a field name, validation fails and the caller receives an explicit
// `malformed` MarketDataError. No value is ever defaulted, guessed, or
// substituted with fabricated data.

/** Standard OKX v5 envelope. `code` is a STRING; "0" means success. */
export interface OkxApiResponse<T> {
  code: string;
  msg: string;
  data: T[];
}

/** Trading state of an instrument, per GET /api/v5/public/instruments. */
export type OkxInstrumentState = "live" | "suspend" | "preopen" | "test" | "expired";

/** Subset of GET /api/v5/public/instruments?instType=SPOT that AURA consumes. */
export interface OkxInstrument {
  instType: string;
  instId: string;
  baseCcy: string;
  quoteCcy: string;
  state: string;
  /** Minimum order size. Present for SPOT; unused by AURA but kept for fidelity. */
  minSz?: string;
  /** Price tick size — drives display precision. */
  tickSz?: string;
  lotSz?: string;
  listTime?: string;
}

/**
 * Subset of GET /api/v5/market/ticker(s) that AURA consumes.
 *
 * IMPORTANT: OKX does NOT return a ready-made 24h percentage-change field.
 * The change is derived from `last` and `open24h` (see toNormalizedMarket).
 * All numeric values arrive as strings.
 */
export interface OkxTicker {
  instType: string;
  instId: string;
  /** Last traded price. */
  last: string;
  /** Last traded size. */
  lastSz?: string;
  /** Best ask price. Empty string when there is no resting ask. */
  askPx: string;
  askSz?: string;
  /** Best bid price. Empty string when there is no resting bid. */
  bidPx: string;
  bidSz?: string;
  /** Open price of the rolling 24h window — the basis for 24h change. */
  open24h: string;
  high24h: string;
  low24h: string;
  /** 24h traded volume in the BASE currency. */
  vol24h: string;
  /** 24h traded volume in the QUOTE currency (i.e. USDT notional). */
  volCcy24h: string;
  /** Open price at 00:00 UTC. */
  sodUtc0?: string;
  sodUtc8?: string;
  /** Ticker generation time, milliseconds since epoch, as a string. */
  ts: string;
}

/**
 * One row from GET /api/v5/market/candles — a positional array of strings:
 *
 *   [0] ts           open time, ms since epoch
 *   [1] o            open price
 *   [2] h            highest price
 *   [3] l            lowest price
 *   [4] c            close price
 *   [5] vol          volume in base currency
 *   [6] volCcy       volume in quote currency
 *   [7] volCcyQuote  quote-currency volume
 *   [8] confirm      "0" = candle still forming, "1" = closed
 */
export type OkxCandleRow = string[];

// -- AURA normalized types --------------------------------------------------

/** Freshness of a quote, derived from the real OKX response timestamp. */
export type MarketStatus = "LIVE" | "STALE" | "UNAVAILABLE";

/** A market normalized from real OKX instrument + ticker data. */
export interface NormalizedMarket {
  /** OKX instrument id, e.g. "BTC-USDT". */
  instId: string;
  /** Base currency, e.g. "BTC". */
  baseCurrency: string;
  /** Quote currency, e.g. "USDT". */
  quoteCurrency: string;
  /** "BTC-USDT" — the canonical symbol used in URLs and storage. */
  symbol: string;
  /** "BTC / USDT" — presentation label. */
  displayName: string;
  /** Long-form label for the base currency, e.g. "Bitcoin". Cosmetic. */
  baseName: string;

  /** Last traded price, from OKX `last`. */
  price: number;
  /** Rolling 24h open, from OKX `open24h`. Basis of the change calculation. */
  open24h: number;
  /** ((last - open24h) / open24h) * 100. null when open24h is 0 or absent. */
  change24hPercent: number | null;
  /** last - open24h, in quote currency. null when open24h is absent. */
  change24hAbsolute: number | null;
  high24h: number;
  low24h: number;
  /** 24h volume in the base currency (OKX `vol24h`). */
  volume24hBase: number;
  /** 24h volume in the quote currency (OKX `volCcy24h`) — the USDT notional. */
  volume24hQuote: number;
  /** Best bid, or null when the book side is empty. */
  bid: number | null;
  /** Best ask, or null when the book side is empty. */
  ask: number | null;
  /** OKX ticker timestamp, ISO 8601, derived from `ts`. */
  quotedAt: string;
  /** Epoch ms of the OKX ticker timestamp. */
  quotedAtMs: number;
  /** Freshness computed from quotedAtMs against a staleness threshold. */
  status: MarketStatus;
  /** OKX instrument `state`, e.g. "live" / "suspend". */
  instrumentState: string;
}

/** A real OKX candle. `time` is seconds since epoch (PriceChart's contract). */
export interface MarketCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Base-currency volume (OKX index 5). */
  volume: number;
  /**
   * Quote-currency volume (OKX index 7, falling back to index 6).
   * null when OKX supplied neither — never silently the base volume.
   */
  volumeQuote: number | null;
  /** false while the candle is still forming (OKX `confirm` === "0"). */
  closed: boolean;
}

/** Candle intervals AURA exposes. Values are OKX `bar` parameter values. */
export const CANDLE_BARS = ["1m", "5m", "15m", "1H", "4H", "1D"] as const;
export type CandleBar = (typeof CANDLE_BARS)[number];

export function isCandleBar(value: string): value is CandleBar {
  return (CANDLE_BARS as readonly string[]).includes(value);
}

// -- errors -----------------------------------------------------------------

/**
 * Why market data could not be produced. Callers surface these; none of them
 * ever resolves to fabricated market values.
 */
export type MarketErrorKind =
  | "timeout"
  | "http"
  | "api_code"
  | "malformed"
  | "empty"
  | "rate_limit"
  | "unknown_instrument"
  | "network"
  | "not_configured";

export class MarketDataError extends Error {
  constructor(
    readonly kind: MarketErrorKind,
    message: string,
    /** OKX's own `code` when the failure came from the API envelope. */
    readonly upstreamCode?: string,
    /** HTTP status to surface to the browser. */
    readonly status: number = 503,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

/** Shape returned by AURA's own /api/markets* routes. */
export interface MarketApiResponse {
  markets: NormalizedMarket[];
  /** ISO timestamp of when this payload was assembled server-side. */
  fetchedAt: string;
  /** Present only on failure. */
  error?: { kind: MarketErrorKind; message: string };
}
