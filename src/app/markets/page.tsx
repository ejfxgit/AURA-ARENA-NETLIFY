"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Boxes,
  ExternalLink,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useWallet } from "@/lib/use-wallet";
import { useLiveTicker } from "@/lib/market/use-live-market";
import { LiveStatus } from "@/components/live-status";
import { TokenIcon } from "@/components/ui/token-icon";
import {
  cn,
  fmtCompactOrNa,
  fmtPctOrNa,
  fmtPrice,
  NA,
  pnlColorOrNa,
  timeAgo,
} from "@/lib/utils";
import type { NormalizedMarket } from "@/lib/market/okx-types";
import { XLAYER_MAX_LIMIT, type XLayerToken } from "@/lib/market/xlayer-types";

type Tab = "OKX" | "XLAYER";
type Feed = "ALL" | "WATCHLIST";

interface MarketsResponse {
  markets: NormalizedMarket[];
  total: number;
  truncated: boolean;
  fetchedAt: string;
}
interface XLayerResponse {
  tokens: XLayerToken[];
  page: number;
  limit: number;
  hasMore: boolean;
  fetchedAt: string;
}
interface ApiErrorBody {
  error?: { kind?: string; message?: string; missingEnv?: string[] };
}

const MARKET_LIMIT = 300;
const REFRESH_MS = 20_000;
/** Page size for the X Layer token list. Mirrors the provider's page cap. */
const XLAYER_PAGE_SIZE = XLAYER_MAX_LIMIT;

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("OKX");

  return (
    <div className="mx-auto min-w-0 max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6">
        <div className="section-kicker">Market intelligence</div>
        <h1 className="mt-2 font-display text-3xl font-bold">One arena. Real markets.</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
          Live OKX Exchange spot data and X Layer on-chain tokens — two separate sources, never mixed.
          Nothing on this page is simulated: if a value is unavailable it is shown as {NA}.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Market data source">
        <TabButton active={tab === "OKX"} onClick={() => setTab("OKX")} icon={<Activity size={13} />}>
          OKX Exchange
        </TabButton>
        <TabButton active={tab === "XLAYER"} onClick={() => setTab("XLAYER")} icon={<Layers size={13} />}>
          X Layer tokens
        </TabButton>
      </div>

      {tab === "OKX" ? <OkxMarkets /> : <XLayerTokens />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors",
        active
          ? "border-aura-accent/40 bg-aura-accent/10 text-white"
          : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ===========================================================================
// OKX Exchange spot markets
// ===========================================================================

function OkxMarkets() {
  const wallet = useWallet();
  const [markets, setMarkets] = useState<NormalizedMarket[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [feed, setFeed] = useState<Feed>("ALL");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  // Ticks once a second so the "last updated" label stays truthful without
  // re-requesting anything.
  const [, setClock] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async (opts?: { refresh?: boolean }) => {
    setRefreshing(true);
    try {
      const data = await api<MarketsResponse>(
        `/api/markets?limit=${MARKET_LIMIT}&sort=volume${opts?.refresh ? "&refresh=1" : ""}`,
      );
      setMarkets(data.markets);
      setFetchedAt(data.fetchedAt);
      setError(null);
    } catch (e) {
      // No cached-fake substitution: the table shows its error state instead.
      setError(e instanceof ApiError ? e.message : "Market data unavailable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    if (!wallet.ready) {
      setWatchlist([]);
      return;
    }
    try {
      const data = await api<{ instIds: string[] }>("/api/watchlist");
      setWatchlist(data.instIds);
      setWatchlistError(null);
    } catch (e) {
      setWatchlistError(e instanceof ApiError ? e.message : "Unable to load your watchlist.");
    }
  }, [wallet.ready]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    void loadWatchlist();
  }, [loadWatchlist]);

  const toggleWatch = useCallback(
    async (instId: string) => {
      if (!wallet.ready) {
        wallet.openConnect();
        return;
      }
      const saved = watchlist.includes(instId);
      // Optimistic, reverted on failure.
      setWatchlist((prev) => (saved ? prev.filter((id) => id !== instId) : [...prev, instId]));
      try {
        if (saved) await api(`/api/watchlist?instId=${encodeURIComponent(instId)}`, { method: "DELETE" });
        else await api("/api/watchlist", { method: "POST", body: { instId } });
        setWatchlistError(null);
      } catch (e) {
        setWatchlist((prev) => (saved ? [...prev, instId] : prev.filter((id) => id !== instId)));
        setWatchlistError(e instanceof ApiError ? e.message : "Unable to update your watchlist.");
      }
    },
    [wallet, watchlist],
  );

  // Search runs over the real OKX list already loaded — instant, no extra calls.
  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    let rows = markets;
    if (feed === "WATCHLIST") rows = rows.filter((m) => watchlist.includes(m.instId));
    if (!q) return rows;
    return rows.filter(
      (m) =>
        m.instId.includes(q) ||
        m.baseCurrency.includes(q) ||
        m.quoteCurrency.includes(q) ||
        m.baseName.toUpperCase().includes(q),
    );
  }, [markets, query, feed, watchlist]);

  const liveCount = markets.filter((m) => m.status === "LIVE").length;
  const allStale = markets.length > 0 && liveCount === 0;

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search real OKX markets — BTC, SOL, USDT…"
              aria-label="Search OKX markets"
              className="focus-ring h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-8 text-sm outline-none placeholder:text-white/25 focus:border-aura-accent/40"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/30 hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <FeedToggle feed={feed} setFeed={setFeed} count={watchlist.length} />
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg border border-aura-accent/30 bg-aura-accent/[0.08] px-3 text-xs font-semibold text-white/85 hover:bg-aura-accent/[0.14]"
          >
            <Plus size={14} /> Add market
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-white/40">
          <LiveStatus />
          <span className="chip">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                error ? "bg-aura-short" : allStale ? "bg-aura-wait" : "bg-aura-long",
              )}
            />
            {error ? "unavailable" : allStale ? "stale" : `${liveCount} live`}
          </span>
          <span className="chip" title={fetchedAt ?? undefined}>
            updated {timeAgo(fetchedAt)}
          </span>
          <button
            type="button"
            onClick={() => void load({ refresh: true })}
            disabled={refreshing}
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-xs text-white/45 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin text-aura-accent" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && <Banner tone="error" title="Market data unavailable" detail={error} />}
      {!error && allStale && (
        <Banner
          tone="warn"
          title="Quotes are going stale"
          detail="OKX has not returned a fresh timestamp recently. Values shown are the last real quotes received — nothing has been substituted."
        />
      )}
      {watchlistError && <Banner tone="warn" title="Watchlist" detail={watchlistError} />}

      {/* table */}
      <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018]">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <div className="grid grid-cols-[28px_minmax(150px,1.4fr)_repeat(6,minmax(88px,1fr))_84px] items-center gap-3 border-b border-white/[0.07] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28">
              <span className="sr-only">Watch</span>
              <span />
              <span>Market</span>
              <span className="text-right">Price</span>
              <span className="text-right">24h</span>
              <span className="text-right">High</span>
              <span className="text-right">Low</span>
              <span className="text-right">Volume</span>
              <span className="text-right">Bid / Ask</span>
              <span className="text-right">Status</span>
            </div>

            {loading && Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)}

            {!loading && visible.length === 0 && (
              <div className="px-5 py-14 text-center text-sm text-white/40">
                {error
                  ? "No market data to show."
                  : feed === "WATCHLIST"
                    ? "Your watchlist is empty. Use “Add market” to follow a real OKX pair."
                    : `No OKX market matches “${query}”.`}
              </div>
            )}

            {!loading &&
              visible.map((market) => (
                <MarketRow
                  key={market.instId}
                  market={market}
                  watched={watchlist.includes(market.instId)}
                  onToggleWatch={() => void toggleWatch(market.instId)}
                />
              ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap items-start gap-2 text-xs leading-5 text-white/35">
        <Activity size={13} className="mt-0.5 shrink-0 text-aura-accent" />
        <span className="min-w-0">
          {markets.length > 0
            ? `${markets.length} live OKX spot markets loaded, ranked by real 24h quote volume. `
            : ""}
          24h change is derived from OKX&apos;s <span className="mono text-white/55">last</span> and{" "}
          <span className="mono text-white/55">open24h</span> fields. AI analysis is not part of this feed —
          open a market to run a real agent thesis on it.
        </span>
      </div>

      {picking && (
        <AddMarketDialog
          onClose={() => setPicking(false)}
          watchlist={watchlist}
          onToggle={toggleWatch}
        />
      )}
    </div>
  );
}

function FeedToggle({
  feed,
  setFeed,
  count,
}: {
  feed: Feed;
  setFeed: (f: Feed) => void;
  count: number;
}) {
  return (
    <div className="inline-flex h-10 overflow-hidden rounded-lg border border-white/[0.08]">
      {(["ALL", "WATCHLIST"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setFeed(value)}
          className={cn(
            "focus-ring px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors",
            feed === value ? "bg-aura-accent/12 text-white" : "text-white/40 hover:text-white",
          )}
        >
          {value === "ALL" ? "All" : `Watchlist${count ? ` ${count}` : ""}`}
        </button>
      ))}
    </div>
  );
}

function MarketRow({
  market,
  watched,
  onToggleWatch,
}: {
  market: NormalizedMarket;
  watched: boolean;
  onToggleWatch: () => void;
}) {
  // Each row subscribes to its own live ticker and unsubscribes on unmount, so
  // the table ticks like an exchange instead of showing the last polled value.
  // Until the first frame arrives the REST values are shown — never a
  // placeholder, and never a substituted number.
  const ticker = useLiveTicker(market.instId);
  const price = ticker?.last ?? market.price;
  const change = ticker?.changePercent ?? market.change24hPercent;
  const high = ticker?.high24h ?? market.high24h;
  const low = ticker?.low24h ?? market.low24h;
  const volume = ticker?.volCcy24h ?? market.volume24hQuote;
  const bid = ticker ? ticker.bid : market.bid;
  const ask = ticker ? ticker.ask : market.ask;
  const status = ticker ? "LIVE" : market.status;

  return (
    <div className="group grid grid-cols-[28px_minmax(150px,1.4fr)_repeat(6,minmax(88px,1fr))_84px] items-center gap-3 border-b border-white/[0.05] px-4 py-3.5 transition-colors last:border-0 hover:bg-white/[0.025]">
      <button
        type="button"
        onClick={onToggleWatch}
        aria-label={watched ? `Remove ${market.instId} from watchlist` : `Add ${market.instId} to watchlist`}
        aria-pressed={watched}
        className="focus-ring rounded p-1 text-white/20 transition-colors hover:text-aura-gold"
      >
        <Star size={14} className={watched ? "fill-aura-gold text-aura-gold" : ""} />
      </button>

      <Link href={`/markets/${market.instId.toLowerCase()}`} className="flex min-w-0 items-center gap-3">
        <TokenIcon symbol={market.baseCurrency} size={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-white/85">{market.instId}</span>
          <span className="block truncate text-[10px] text-white/30">{market.baseName}</span>
        </span>
        <ArrowUpRight
          size={13}
          className="ml-auto hidden shrink-0 text-white/20 transition-colors group-hover:text-aura-accent sm:block"
        />
      </Link>

      <Cell className="font-semibold text-white/90">{fmtPrice(price)}</Cell>
      <Cell className={pnlColorOrNa(change)}>{fmtPctOrNa(change)}</Cell>
      <Cell className="text-white/55">{fmtPrice(high)}</Cell>
      <Cell className="text-white/55">{fmtPrice(low)}</Cell>
      <Cell className="text-white/55">{fmtCompactOrNa(volume, "$")}</Cell>
      <Cell className="text-white/45 text-[10px]">
        {bid === null && ask === null ? (
          NA
        ) : (
          <>
            <span className="text-aura-long">{fmtPrice(bid)}</span>
            <span className="mx-1 text-white/20">/</span>
            <span className="text-aura-short">{fmtPrice(ask)}</span>
          </>
        )}
      </Cell>
      <div className="flex justify-end">
        <StatusPill status={status} />
      </div>
    </div>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mono truncate text-right text-xs", className)}>{children}</div>;
}

function StatusPill({ status }: { status: NormalizedMarket["status"] }) {
  const map = {
    LIVE: { label: "LIVE", cls: "border-aura-long/30 bg-aura-long/10 text-aura-long" },
    STALE: { label: "STALE", cls: "border-aura-wait/30 bg-aura-wait/10 text-aura-wait" },
    UNAVAILABLE: { label: "N/A", cls: "border-aura-short/30 bg-aura-short/10 text-aura-short" },
  } as const;
  const { label, cls } = map[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-[0.1em]",
        cls,
      )}
    >
      {status === "LIVE" && <span className="h-1 w-1 rounded-full bg-aura-long" />}
      {label}
    </span>
  );
}

// -- Add-market dialog ------------------------------------------------------
//
// Searches the REAL OKX instrument universe server-side, so a user can reach any
// listed pair, not just the rows already on screen.

function AddMarketDialog({
  onClose,
  watchlist,
  onToggle,
}: {
  onClose: () => void;
  watchlist: string[];
  onToggle: (instId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NormalizedMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    // Debounced so typing does not create a request per keystroke.
    timer.current = setTimeout(() => {
      setLoading(true);
      api<MarketsResponse>(`/api/markets?limit=40&q=${encodeURIComponent(query.trim())}`)
        .then((data) => {
          setResults(data.markets);
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Market search unavailable."))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/70 px-4 py-10 backdrop-blur-sm sm:py-20"
      role="dialog"
      aria-modal="true"
      aria-label="Add a market"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-white/[0.1] bg-[#0d1220] shadow-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
          <div className="text-sm font-semibold text-white/85">Add a real OKX market</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring rounded p-1 text-white/40 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-white/[0.07] p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search every listed OKX spot pair…"
              className="focus-ring h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 text-sm outline-none placeholder:text-white/25 focus:border-aura-accent/40"
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto">
          {loading && <div className="px-4 py-8 text-center text-xs text-white/35">Searching OKX…</div>}
          {error && <div className="px-4 py-8 text-center text-xs text-aura-short">{error}</div>}
          {!loading && !error && results.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-white/35">
              No listed OKX market matches that search.
            </div>
          )}
          {!loading &&
            !error &&
            results.map((market) => {
              const saved = watchlist.includes(market.instId);
              return (
                <div
                  key={market.instId}
                  className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-white/85">{market.instId}</div>
                    <div className="truncate text-[10px] text-white/30">{market.baseName}</div>
                  </div>
                  <div className="mono shrink-0 text-xs text-white/70">{fmtPrice(market.price)}</div>
                  <div className={cn("mono w-16 shrink-0 text-right text-[11px]", pnlColorOrNa(market.change24hPercent))}>
                    {fmtPctOrNa(market.change24hPercent)}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onToggle(market.instId)}
                    className={cn(
                      "focus-ring shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em]",
                      saved
                        ? "border-aura-gold/40 bg-aura-gold/10 text-aura-gold"
                        : "border-white/[0.1] text-white/55 hover:bg-white/[0.05]",
                    )}
                  >
                    {saved ? "Saved" : "Add"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// X Layer on-chain tokens — a DIFFERENT data source from OKX Exchange
// ===========================================================================

function XLayerTokens() {
  const [tokens, setTokens] = useState<XLayerToken[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingEnv, setMissingEnv] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async (nextPage: number, refresh = false) => {
    setLoading(true);
    try {
      const data = await api<XLayerResponse>(
        `/api/xlayer/tokens?page=${nextPage}&limit=${XLAYER_PAGE_SIZE}${refresh ? "&refresh=1" : ""}`,
      );
      setTokens(data.tokens);
      setHasMore(data.hasMore);
      setFetchedAt(data.fetchedAt);
      setError(null);
      setMissingEnv([]);
    } catch (e) {
      setTokens([]);
      if (e instanceof ApiError) {
        setError(e.message);
        // The route reports which variables are absent — names only.
        const body = e.body as ApiErrorBody | undefined;
        setMissingEnv(body?.error?.missingEnv ?? []);
      } else {
        setError("X Layer token data unavailable.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.ticker.toUpperCase().includes(q) ||
        t.name.toUpperCase().includes(q) ||
        t.contractAddress.toUpperCase().includes(q),
    );
  }, [tokens, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-aura-quant/25 bg-aura-quant/[0.05] px-4 py-3 text-xs leading-5 text-white/60">
        <div className="flex items-start gap-2">
          <Boxes size={14} className="mt-0.5 shrink-0 text-aura-quant" />
          <span>
            <span className="font-semibold text-white/80">On-chain assets, not exchange markets.</span> These
            are X Layer token contracts. A token here may have no OKX spot market at all — where that is the
            case no exchange price exists and none is shown.
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, ticker or contract address…"
            aria-label="Search X Layer tokens"
            className="focus-ring h-10 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 text-sm outline-none placeholder:text-white/25 focus:border-aura-accent/40"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-white/40">
          <span className="chip">page {page}</span>
          <span className="chip">updated {timeAgo(fetchedAt)}</span>
          <button
            type="button"
            onClick={() => void load(page, true)}
            disabled={loading}
            className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-xs text-white/45 hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-aura-accent" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <Banner
          tone={missingEnv.length ? "warn" : "error"}
          title={missingEnv.length ? "X Layer token API not configured" : "X Layer token data unavailable"}
          detail={
            missingEnv.length
              ? `${error} Missing server-side variables: ${missingEnv.join(", ")}. These are secrets — set them in .env.local without a NEXT_PUBLIC_ prefix, then restart the dev server.`
              : error
          }
        />
      )}

      <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018]">
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[minmax(170px,1.6fr)_repeat(6,minmax(92px,1fr))] items-center gap-3 border-b border-white/[0.07] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28">
              <span>Token</span>
              <span className="text-right">Price</span>
              <span className="text-right">Market cap</span>
              <span className="text-right">24h volume</span>
              <span className="text-right">TVL</span>
              <span className="text-right">Holders</span>
              <span className="text-right">Supply</span>
            </div>

            {loading && Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)}

            {!loading && visible.length === 0 && !error && (
              <div className="px-5 py-14 text-center text-sm text-white/40">
                {query ? `No X Layer token matches “${query}”.` : "OKX returned no X Layer tokens."}
              </div>
            )}

            {!loading &&
              visible.map((token) => (
                <div
                  key={token.contractAddress || token.ticker}
                  className="grid grid-cols-[minmax(170px,1.6fr)_repeat(6,minmax(92px,1fr))] items-center gap-3 border-b border-white/[0.05] px-4 py-3.5 last:border-0 hover:bg-white/[0.025]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025] text-[9px] font-bold text-white/80">
                      {(token.ticker || "?").slice(0, 4)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-white/85">
                          {token.ticker || NA}
                        </span>
                        {token.website && (
                          <a
                            href={token.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="focus-ring shrink-0 rounded text-white/25 hover:text-aura-accent"
                            aria-label={`${token.ticker} website`}
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-white/30">{token.name || NA}</div>
                      {token.contractAddress && (
                        <div className="mono truncate text-[9px] text-white/20">{token.contractAddress}</div>
                      )}
                    </div>
                  </div>
                  <Cell className="font-semibold text-white/85">{fmtPrice(token.priceUsd)}</Cell>
                  <Cell className="text-white/55">{fmtCompactOrNa(token.marketCapUsd, "$")}</Cell>
                  <Cell className="text-white/55">{fmtCompactOrNa(token.transactionAmount24h, "$")}</Cell>
                  <Cell className="text-white/55">{fmtCompactOrNa(token.tvl, "$")}</Cell>
                  <Cell className="text-white/55">{fmtCompactOrNa(token.holderCount)}</Cell>
                  <Cell className="text-white/55">{fmtCompactOrNa(token.circulatingSupply ?? token.totalSupply)}</Cell>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
          className="focus-ring rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/50 hover:text-white disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">
          {XLAYER_PAGE_SIZE} tokens per page
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore || loading}
          className="focus-ring rounded-lg border border-white/[0.08] px-3 py-2 text-xs text-white/50 hover:text-white disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// -- shared -----------------------------------------------------------------

function Banner({
  tone,
  title,
  detail,
}: {
  tone: "error" | "warn";
  title: string;
  detail: string;
}) {
  const cls =
    tone === "error"
      ? "border-aura-short/25 bg-aura-short/[0.06] text-aura-short"
      : "border-aura-wait/25 bg-aura-wait/[0.06] text-aura-wait";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-4 py-3 text-sm", cls)}>
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 break-words text-xs opacity-80">{detail}</div>
      </div>
    </div>
  );
}

function RowSkeleton() {
  return <div className="h-[62px] animate-pulse border-b border-white/[0.05] bg-white/[0.012] last:border-0" />;
}
