// Central live market-data service. BROWSER-ONLY.
//
// This is the single source of truth for live prices and candles. Every
// consumer (market list, chart, header, agent panel, position, P&L, battle UI)
// reads from this one store — there is no per-component timer, no simulated
// price walk and no random number anywhere in this file.
//
// Transport: the OKX public WebSocket v5.
//   tickers channel  -> live last price, 24h open/high/low, volume, bid/ask
//   candleN channel  -> live OHLCV for the CURRENT candle, then the next one
//
// OKX serves these channels from two hosts: `/ws/v5/public` carries `tickers`,
// and candle channels were moved to `/ws/v5/business`. Rather than hardcode a
// guess, each channel starts on its expected host and is automatically retried
// on the other host if OKX answers with a channel error; the working host is
// then remembered. See `resolveEndpoint`/`handleChannelError`.
//
// Nothing here fabricates data:
//   * a candle series is seeded from real REST history and then only ever
//     updated by real websocket messages
//   * an interval boundary appends the next real candle; nothing is
//     interpolated to keep a chart moving
//   * if the socket is down the last real values are retained and the status
//     is reported as disconnected, so the UI can say so instead of pretending

import type { CandleBar } from "./okx-types";

// -- public types ------------------------------------------------------------

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "offline";

/** A live ticker, normalized from the OKX `tickers` channel. */
export interface LiveTicker {
  instId: string;
  /** Last traded price. */
  last: number;
  open24h: number;
  high24h: number;
  low24h: number;
  /** 24h volume in the base currency. */
  vol24h: number;
  /** 24h volume in the quote currency (the notional). */
  volCcy24h: number;
  bid: number | null;
  ask: number | null;
  /** Exchange timestamp, epoch ms. */
  ts: number;
  /** Derived from last + open24h. null when open24h is unusable. */
  changePercent: number | null;
  changeAbsolute: number | null;
}

/** A live candle. `time` is epoch SECONDS, matching the chart's contract. */
export interface LiveCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Base-currency volume. */
  volume: number;
  /** Quote-currency volume, or null when the feed did not supply one. */
  volumeQuote: number | null;
  /** false while the candle is still forming (OKX `confirm` === "0"). */
  closed: boolean;
}

// -- configuration ----------------------------------------------------------

const ENDPOINTS = {
  // OKX serves the v5 WebSocket on port 8443. Omitting it leaves the URL on the
  // default 443, which OKX does not answer on, so every subscription failed to
  // connect before the channel logic below ever ran.
  public: "wss://ws.okx.com:8443/ws/v5/public",
  business: "wss://ws.okx.com:8443/ws/v5/business",
} as const;

type EndpointKey = keyof typeof ENDPOINTS;

/** OKX closes a connection that has been idle for 30s. Ping well inside that. */
const PING_INTERVAL_MS = 20_000;
const PONG_TIMEOUT_MS = 10_000;

/** Reconnect backoff, capped. Index clamps to the last entry. */
const BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

/** Maximum candles retained per series. Older bars are dropped, never faked. */
const MAX_CANDLES = 500;

const CANDLE_CHANNEL_PREFIX = "candle";

// -- helpers ----------------------------------------------------------------

function toNumber(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function toOptionalNumber(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function tickerKey(instId: string): string {
  return `ticker:${instId.toUpperCase()}`;
}

function candleKey(instId: string, bar: CandleBar): string {
  return `candle:${instId.toUpperCase()}:${bar}`;
}

/**
 * Parses one OKX `tickers` row. Returns null when a required numeric is
 * missing, so a malformed frame is dropped rather than turned into a zero.
 */
function parseTicker(row: Record<string, unknown>): LiveTicker | null {
  const instId = typeof row.instId === "string" ? row.instId : "";
  const last = toNumber(row.last);
  const ts = toNumber(row.ts);
  if (!instId || !Number.isFinite(last) || !Number.isFinite(ts)) return null;

  const open24h = toNumber(row.open24h);
  const usableOpen = Number.isFinite(open24h) && open24h !== 0;

  return {
    instId,
    last,
    open24h: Number.isFinite(open24h) ? open24h : Number.NaN,
    high24h: toNumber(row.high24h),
    low24h: toNumber(row.low24h),
    vol24h: toNumber(row.vol24h),
    volCcy24h: toNumber(row.volCcy24h),
    bid: toOptionalNumber(row.bidPx),
    ask: toOptionalNumber(row.askPx),
    ts,
    changePercent: usableOpen ? ((last - open24h) / open24h) * 100 : null,
    changeAbsolute: usableOpen ? last - open24h : null,
  };
}

/**
 * Parses one OKX candle row: [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm].
 * Returns null on a malformed row rather than substituting values.
 */
function parseCandle(row: unknown): LiveCandle | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const ts = toNumber(row[0]);
  const open = toNumber(row[1]);
  const high = toNumber(row[2]);
  const low = toNumber(row[3]);
  const close = toNumber(row[4]);
  const volume = toNumber(row[5]);
  if (
    !Number.isFinite(ts) ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }
  const quote = [7, 6]
    .map((index) => (row.length > index ? Number(row[index]) : Number.NaN))
    .find((value) => Number.isFinite(value));

  return {
    time: Math.floor(ts / 1000),
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
    volumeQuote: quote ?? null,
    closed: row.length > 8 ? row[8] === "1" : false,
  };
}

// -- internal bookkeeping ---------------------------------------------------

interface ChannelArg {
  channel: string;
  instId: string;
}

interface Subscription {
  arg: ChannelArg;
  refCount: number;
  endpoint: EndpointKey;
  /** True once OKX has confirmed (or data has arrived for) this channel. */
  confirmed: boolean;
  /** Set when a channel error already caused a host swap, so we swap only once. */
  swapped: boolean;
}

interface SocketState {
  ws: WebSocket | null;
  status: ConnectionStatus;
  attempt: number;
  pingTimer: ReturnType<typeof setInterval> | null;
  pongTimer: ReturnType<typeof setTimeout> | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  /** Deliberately closed by us — suppresses the reconnect path. */
  closing: boolean;
  /** Invalidates events from a socket that has already been replaced. */
  generation: number;
}

function channelIdOf(arg: ChannelArg): string {
  return `${arg.channel}|${arg.instId}`;
}

// -- the service ------------------------------------------------------------

class MarketDataService {
  private sockets = new Map<EndpointKey, SocketState>();
  private subs = new Map<string, Subscription>();

  private tickers = new Map<string, LiveTicker>();
  private candles = new Map<string, LiveCandle[]>();

  /** Per-store-key listeners, for useSyncExternalStore. */
  private listeners = new Map<string, Set<() => void>>();
  private statusListeners = new Set<() => void>();

  private status: ConnectionStatus = "idle";

  // ---- store reads (stable references until a real update) ----

  getTicker(instId: string): LiveTicker | undefined {
    return this.tickers.get(instId.toUpperCase());
  }

  getCandles(instId: string, bar: CandleBar): LiveCandle[] | undefined {
    return this.candles.get(`${instId.toUpperCase()}:${bar}`);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Best available live price for an instrument: the ticker's last trade, else
   * the newest candle close. Returns null when nothing real has arrived yet —
   * callers must render an explicit unavailable state rather than a zero.
   */
  getPrice(instId: string, bar?: CandleBar): number | null {
    const ticker = this.getTicker(instId);
    if (ticker && Number.isFinite(ticker.last)) return ticker.last;
    if (bar) {
      const series = this.getCandles(instId, bar);
      const latest = series?.[series.length - 1];
      if (latest && Number.isFinite(latest.close)) return latest.close;
    }
    return null;
  }

  // ---- subscriptions ----

  onStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Subscribes to a live ticker. Reference-counted: N components asking for the
   * same instrument produce exactly ONE upstream subscription, and the upstream
   * unsubscribe happens only when the last consumer goes away.
   */
  subscribeTicker(instId: string, listener: () => void): () => void {
    const id = instId.toUpperCase();
    const store = tickerKey(id);
    this.addListener(store, listener);
    this.retain({ channel: "tickers", instId: id }, "public");
    return () => {
      this.removeListener(store, listener);
      this.release({ channel: "tickers", instId: id });
    };
  }

  /** Subscribes to a live candle series for one instrument + interval. */
  subscribeCandles(instId: string, bar: CandleBar, listener: () => void): () => void {
    const id = instId.toUpperCase();
    const store = candleKey(id, bar);
    this.addListener(store, listener);
    this.retain({ channel: `${CANDLE_CHANNEL_PREFIX}${bar}`, instId: id }, "business");
    return () => {
      this.removeListener(store, listener);
      this.release({ channel: `${CANDLE_CHANNEL_PREFIX}${bar}`, instId: id });
    };
  }

  /**
   * Seeds a series with real REST history. Live websocket bars are merged on
   * top. An existing live bar is never overwritten by older history.
   */
  seedCandles(instId: string, bar: CandleBar, history: LiveCandle[]): void {
    if (history.length === 0) return;
    const key = `${instId.toUpperCase()}:${bar}`;
    const existing = this.candles.get(key);

    const merged = new Map<number, LiveCandle>();
    for (const candle of history) merged.set(candle.time, candle);
    // Live data wins over history for any overlapping timestamp.
    if (existing) for (const candle of existing) merged.set(candle.time, candle);

    const next = Array.from(merged.values())
      .sort((a, b) => a.time - b.time)
      .slice(-MAX_CANDLES);

    this.candles.set(key, next);
    this.emit(candleKey(instId, bar));
  }

  // ---- listener plumbing ----

  private addListener(store: string, listener: () => void): void {
    const set = this.listeners.get(store) ?? new Set<() => void>();
    set.add(listener);
    this.listeners.set(store, set);
  }

  private removeListener(store: string, listener: () => void): void {
    const set = this.listeners.get(store);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) this.listeners.delete(store);
  }

  private emit(store: string): void {
    const set = this.listeners.get(store);
    if (!set) return;
    for (const listener of set) listener();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) listener();
  }

  /** Aggregate status across open sockets, worst-case wins. */
  private recomputeStatus(): void {
    const states = Array.from(this.sockets.values());
    if (states.length === 0) return this.setStatus("idle");
    if (states.some((s) => s.status === "offline")) return this.setStatus("offline");
    if (states.some((s) => s.status === "reconnecting")) return this.setStatus("reconnecting");
    if (states.some((s) => s.status === "connecting")) return this.setStatus("connecting");
    return this.setStatus("open");
  }

  // ---- subscription refcounting ----

  private retain(arg: ChannelArg, endpoint: EndpointKey): void {
    const id = channelIdOf(arg);
    const existing = this.subs.get(id);
    if (existing) {
      existing.refCount += 1;
      return;
    }
    this.subs.set(id, { arg, refCount: 1, endpoint, confirmed: false, swapped: false });
    this.ensureSocket(endpoint);
    this.send(endpoint, { op: "subscribe", args: [arg] });
  }

  private release(arg: ChannelArg): void {
    const id = channelIdOf(arg);
    const sub = this.subs.get(id);
    if (!sub) return;
    sub.refCount -= 1;
    if (sub.refCount > 0) return;

    this.subs.delete(id);
    this.send(sub.endpoint, { op: "unsubscribe", args: [sub.arg] });
    this.closeIdleSockets();
  }

  /** Closes a socket once nothing is subscribed through it. */
  private closeIdleSockets(): void {
    for (const [endpoint, state] of this.sockets) {
      const stillUsed = Array.from(this.subs.values()).some((s) => s.endpoint === endpoint);
      if (stillUsed) continue;
      this.teardown(endpoint, state);
      this.sockets.delete(endpoint);
    }
    this.recomputeStatus();
  }

  // ---- socket lifecycle ----

  private ensureSocket(endpoint: EndpointKey): void {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return;
    const existing = this.sockets.get(endpoint);
    if (existing) {
      // A backoff attempt is already queued — opening now would race it and
      // leave an orphaned socket.
      if (existing.reconnectTimer) return;
      if (existing.ws && existing.ws.readyState <= WebSocket.OPEN) return;
    }
    this.open(endpoint);
  }

  private open(endpoint: EndpointKey): void {
    const state: SocketState =
      this.sockets.get(endpoint) ??
      {
        ws: null,
        status: "connecting",
        attempt: 0,
        pingTimer: null,
        pongTimer: null,
        reconnectTimer: null,
        closing: false,
        generation: 0,
      };
    state.closing = false;
    state.generation += 1;
    const generation = state.generation;
    state.status = state.attempt > 0 ? "reconnecting" : "connecting";
    this.sockets.set(endpoint, state);
    this.recomputeStatus();

    let ws: WebSocket;
    try {
      ws = new WebSocket(ENDPOINTS[endpoint]);
    } catch {
      this.scheduleReconnect(endpoint);
      return;
    }
    state.ws = ws;

    ws.onopen = () => {
      if (state.generation !== generation || state.ws !== ws) return;
      state.attempt = 0;
      state.status = "open";
      this.recomputeStatus();
      // Re-subscribe everything routed through this host. On a reconnect this
      // is what restores the feed without a page refresh.
      const args = Array.from(this.subs.values())
        .filter((sub) => sub.endpoint === endpoint)
        .map((sub) => sub.arg);
      if (args.length) this.rawSend(ws, { op: "subscribe", args });
      this.startHeartbeat(endpoint, state);
    };

    ws.onmessage = (event) => {
      if (state.generation === generation && state.ws === ws) {
        this.handleMessage(endpoint, state, event.data);
      }
    };

    ws.onerror = () => {
      if (state.generation !== generation || state.ws !== ws) return;
      // Browsers usually emit close after error, but the WebSocket contract does
      // not guarantee it. Actively recycle the failed transport so reconnect is
      // deterministic instead of leaving a permanently CONNECTING socket.
      try {
        ws.close();
      } catch {
        state.ws = null;
        this.scheduleReconnect(endpoint);
      }
    };

    ws.onclose = () => {
      if (state.generation !== generation || state.ws !== ws) return;
      this.stopHeartbeat(state);
      state.ws = null;
      if (state.closing) return;
      this.scheduleReconnect(endpoint);
    };
  }

  private teardown(endpoint: EndpointKey, state: SocketState): void {
    state.closing = true;
    this.stopHeartbeat(state);
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    const ws = state.ws;
    state.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
  }

  private scheduleReconnect(endpoint: EndpointKey): void {
    const state = this.sockets.get(endpoint);
    if (!state || state.closing) return;
    if (state.reconnectTimer) return;

    state.status = "reconnecting";
    this.recomputeStatus();

    const delay = BACKOFF_MS[Math.min(state.attempt, BACKOFF_MS.length - 1)];
    state.attempt += 1;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      // Nothing left to listen for — stay closed.
      const stillUsed = Array.from(this.subs.values()).some((s) => s.endpoint === endpoint);
      if (!stillUsed) {
        this.sockets.delete(endpoint);
        this.recomputeStatus();
        return;
      }
      this.open(endpoint);
    }, delay);
  }

  // ---- heartbeat ----
  //
  // OKX expects the literal string "ping" and answers "pong". A missing pong
  // means the link is dead even though the socket still looks open, so the
  // connection is recycled rather than left silently frozen.

  private startHeartbeat(endpoint: EndpointKey, state: SocketState): void {
    this.stopHeartbeat(state);
    state.pingTimer = setInterval(() => {
      const ws = state.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send("ping");
      } catch {
        return;
      }
      if (state.pongTimer) clearTimeout(state.pongTimer);
      state.pongTimer = setTimeout(() => {
        state.pongTimer = null;
        if (state.ws && state.ws.readyState <= WebSocket.OPEN) {
          try {
            state.ws.close();
          } catch {
            /* onclose will reconnect */
          }
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(state: SocketState): void {
    if (state.pingTimer) {
      clearInterval(state.pingTimer);
      state.pingTimer = null;
    }
    if (state.pongTimer) {
      clearTimeout(state.pongTimer);
      state.pongTimer = null;
    }
  }

  // ---- send ----

  private rawSend(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* the socket is closing; onopen will resubscribe */
    }
  }

  private send(endpoint: EndpointKey, payload: unknown): void {
    const ws = this.sockets.get(endpoint)?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return; // sent on (re)open
    this.rawSend(ws, payload);
  }

  // ---- inbound ----

  private handleMessage(endpoint: EndpointKey, state: SocketState, raw: unknown): void {
    if (typeof raw !== "string") return;

    if (raw === "pong") {
      if (state.pongTimer) {
        clearTimeout(state.pongTimer);
        state.pongTimer = null;
      }
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;

    const frame = message as {
      event?: string;
      arg?: ChannelArg;
      data?: unknown;
      code?: string;
      msg?: string;
    };

    if (frame.event === "error") {
      this.handleChannelError(endpoint, frame.arg, frame.code);
      return;
    }
    if (frame.event === "subscribe") {
      if (frame.arg) {
        const sub = this.subs.get(channelIdOf(frame.arg));
        if (sub) sub.confirmed = true;
      }
      return;
    }
    if (frame.event) return; // unsubscribe / login / other control frames

    if (!frame.arg || !Array.isArray(frame.data)) return;
    const { channel, instId } = frame.arg;
    if (!channel || !instId) return;

    const sub = this.subs.get(channelIdOf(frame.arg));
    if (sub) sub.confirmed = true;

    if (channel === "tickers") {
      this.applyTicker(frame.data);
      return;
    }
    if (channel.startsWith(CANDLE_CHANNEL_PREFIX)) {
      const bar = channel.slice(CANDLE_CHANNEL_PREFIX.length) as CandleBar;
      this.applyCandles(instId, bar, frame.data);
    }
  }

  /**
   * A channel OKX rejects on this host is retried once on the other host.
   * This is what makes the tickers/candles host split self-correcting instead
   * of a hardcoded assumption.
   */
  private handleChannelError(endpoint: EndpointKey, arg: ChannelArg | undefined, code?: string): void {
    if (!arg) return;
    const sub = this.subs.get(channelIdOf(arg));
    if (!sub || sub.swapped || sub.confirmed) return;

    const alternate: EndpointKey = endpoint === "public" ? "business" : "public";
    sub.endpoint = alternate;
    sub.swapped = true;
    console.warn(
      `[market] OKX rejected ${arg.channel} on /${endpoint}${code ? ` (code ${code})` : ""}; retrying on /${alternate}`,
    );
    this.ensureSocket(alternate);
    this.send(alternate, { op: "subscribe", args: [arg] });
    this.closeIdleSockets();
  }

  private applyTicker(rows: unknown[]): void {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const ticker = parseTicker(row as Record<string, unknown>);
      if (!ticker) continue;
      const id = ticker.instId.toUpperCase();
      this.tickers.set(id, ticker);
      this.emit(tickerKey(id));
    }
  }

  /**
   * Merges live candles into a series.
   *
   * A frame whose timestamp matches the newest bar UPDATES that bar in place —
   * this is what makes the active candle move. A newer timestamp APPENDS the
   * next bar, which is how an interval close rolls over. Out-of-order frames
   * for an older bar correct that bar without disturbing newer ones.
   */
  private applyCandles(instId: string, bar: CandleBar, rows: unknown[]): void {
    const id = instId.toUpperCase();
    const key = `${id}:${bar}`;
    const current = this.candles.get(key);
    let next = current ? current.slice() : [];
    let changed = false;

    for (const row of rows) {
      const candle = parseCandle(row);
      if (!candle) continue;

      const lastIndex = next.length - 1;
      if (lastIndex >= 0 && next[lastIndex].time === candle.time) {
        next[lastIndex] = candle;
        changed = true;
        continue;
      }
      if (lastIndex < 0 || candle.time > next[lastIndex].time) {
        next.push(candle);
        changed = true;
        continue;
      }
      const existingIndex = next.findIndex((item) => item.time === candle.time);
      if (existingIndex >= 0) {
        next[existingIndex] = candle;
        changed = true;
      }
      // Older than the whole retained window: ignore rather than prepend.
    }

    if (!changed) return;
    if (next.length > MAX_CANDLES) next = next.slice(-MAX_CANDLES);
    this.candles.set(key, next);
    this.emit(candleKey(id, bar));
  }
}

/**
 * Module-level singleton — the ONE source of truth. Components must never
 * construct their own instance or their own price timer.
 */
export const marketData = new MarketDataService();
