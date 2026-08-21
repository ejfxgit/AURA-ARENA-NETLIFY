"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Brain,
  RefreshCw,
  Swords,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useWallet } from "@/lib/use-wallet";
import {
  cn,
  fmtCompactOrNa,
  fmtPctOrNa,
  fmtPrice,
  NA,
  pnlColorOrNa,
  timeAgo,
} from "@/lib/utils";
import { AGENT_LIST, getAgent } from "@/lib/agents";
import {
  BATTLE_STAKE_PRESETS,
  MIN_BATTLE_STAKE_AURA,
  battleStakeIssue,
  fmtAura,
  maxBattleStake,
} from "@/lib/aura-economy";
import { DEFAULT_BATTLE_DURATION_SECONDS } from "@/lib/battle/timing";
import { DEFAULT_LEVERAGE } from "@/lib/battle/leverage";
import { LivePriceChart } from "@/components/live-price-chart";
import { LiveStatus } from "@/components/live-status";
import { TokenIcon } from "@/components/ui/token-icon";
import { FactorBars } from "@/components/factor-bars";
import { DirectionBadge } from "@/components/ui/direction-badge";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Button } from "@/components/ui/button";
import {
  useLiveCandles,
  useLivePrice,
  useLiveTicker,
} from "@/lib/market/use-live-market";
import { CANDLE_BARS, type CandleBar, type NormalizedMarket } from "@/lib/market/okx-types";
import type { Thesis, AgentId, Direction } from "@/lib/types";

interface DetailResponse {
  market: NormalizedMarket;
  bar: CandleBar;
  candleError?: { kind: string; message: string };
  fetchedAt: string;
}

export default function MarketDetailPage() {
  const params = useParams<{ symbol: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const wallet = useWallet();
  const routeSymbol = (params.symbol || "").toUpperCase();

  // This page is mounted on two routes: /markets/[symbol] (public shell) and
  // /arena/markets/[symbol] (arena shell). The back link has to follow whichever
  // one the user actually came in through, otherwise leaving the detail view
  // drops them out of the arena layout.
  const inArena = pathname?.startsWith("/arena") ?? false;
  const backHref = inArena ? "/arena/markets" : "/markets";

  const [market, setMarket] = useState<NormalizedMarket | null>(null);
  const [bar, setBar] = useState<CandleBar>("1m");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live pipeline: one websocket subscription per instrument + interval, torn
  // down automatically when either changes or the page unmounts.
  const ticker = useLiveTicker(routeSymbol);
  const { candles, loading: candlesLoading, error: candleError } = useLiveCandles(
    routeSymbol,
    bar,
    200,
  );
  const livePrice = useLivePrice(routeSymbol, bar);

  const [agentId, setAgentId] = useState<AgentId>("volt");
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [humanDir, setHumanDir] = useState<Direction>("SHORT");
  const [amount, setAmount] = useState(100);
  const [creating, setCreating] = useState(false);
  const [battleError, setBattleError] = useState<string | null>(null);

  /**
   * One REST read for the instrument's static metadata and its opening 24h
   * figures. Live values then arrive over the websocket, so this is NOT a
   * polling loop — it runs once per instrument.
   */
  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      try {
        const data = await api<DetailResponse>(
          `/api/markets/${encodeURIComponent(routeSymbol)}?bar=1m&limit=1${
            opts?.refresh ? "&refresh=1" : ""
          }`,
        );
        setMarket(data.market);
        setFetchedAt(data.fetchedAt);
        setError(null);
      } catch (e) {
        // Nothing is substituted: the page shows a real unavailable state.
        setError(e instanceof ApiError ? e.message : "Market data unavailable.");
      } finally {
        setLoading(false);
      }
    },
    [routeSymbol],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const changeBar = useCallback((next: CandleBar) => {
    setBar(next);
  }, []);

  /**
   * The market view merges the REST metadata with the live ticker, so price,
   * 24h change, high/low, volume and bid/ask all come from the live stream once
   * it is connected. Every consumer on this page reads this one object.
   */
  const liveMarket = useMemo<NormalizedMarket | null>(() => {
    if (!market) return null;
    if (!ticker) return market;
    return {
      ...market,
      price: ticker.last,
      open24h: ticker.open24h,
      change24hPercent: ticker.changePercent,
      change24hAbsolute: ticker.changeAbsolute,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      volume24hBase: ticker.vol24h,
      volume24hQuote: ticker.volCcy24h,
      bid: ticker.bid,
      ask: ticker.ask,
      quotedAt: new Date(ticker.ts).toISOString(),
      quotedAtMs: ticker.ts,
      status: "LIVE",
    };
  }, [market, ticker]);

  const analyze = useCallback(
    (id: AgentId) => {
      if (!market) return;
      setAgentId(id);
      setAnalyzing(true);
      setThesis(null);
      setAnalysisError(null);
      api<{ thesis: Thesis }>("/api/agents/analyze", {
        method: "POST",
        body: { agentId: id, symbol: market.instId },
      })
        .then((d) => setThesis(d.thesis))
        .catch((e) =>
          setAnalysisError(e instanceof ApiError ? e.message : "Analysis unavailable."),
        )
        .finally(() => setAnalyzing(false));
    },
    [market],
  );

  const startBattle = useCallback(() => {
    if (!wallet.ready) {
      wallet.openConnect();
      return;
    }
    if (!market) return;
    setCreating(true);
    setBattleError(null);
    api<{ battle: { id: string } }>("/api/battles", {
      method: "POST",
      // The complete battle configuration. This surface has no duration or
      // leverage selector, so it commits the shared defaults explicitly rather
      // than omitting them — duration_seconds is required by the route's schema,
      // and leaving it out made every battle started from a market page 400.
      body: {
        agentId,
        symbol: market.instId,
        human_direction: humanDir,
        human_amount: amount,
        duration_seconds: DEFAULT_BATTLE_DURATION_SECONDS,
        leverage: DEFAULT_LEVERAGE,
      },
    })
      .then((d) => router.push(`/arena/${d.battle.id}`))
      .catch((e) => {
        setBattleError(e instanceof ApiError ? e.message : "Unable to create the battle.");
        setCreating(false);
      });
  }, [agentId, market, humanDir, amount, router, wallet]);

  const agent = getAgent(agentId);
  // Same shared rule the arena and the route use, against the balance the
  // wallet session actually reports. The server re-validates authoritatively.
  const availableAura = wallet.account?.current_balance ?? 0;
  const stakeIssue = battleStakeIssue(amount, availableAura);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        <ArrowLeft size={15} /> All markets
      </Link>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-aura-short/30 bg-aura-short/10 px-4 py-3 text-sm text-aura-short">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Market data unavailable</div>
            <div className="mt-0.5 text-xs opacity-80">{error}</div>
          </div>
        </div>
      )}

      <Header
        market={liveMarket}
        routeSymbol={routeSymbol}
        loading={loading}
        fetchedAt={fetchedAt}
        onRefresh={() => void load({ refresh: true })}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="glass p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="terminal-label">Price · OKX live</div>
                <LiveStatus />
              </div>
              <div className="inline-flex overflow-hidden rounded-lg border border-white/[0.08]">
                {CANDLE_BARS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => changeBar(value)}
                    className={cn(
                      "focus-ring px-2.5 py-1.5 text-[10px] font-bold tracking-[0.08em] transition-colors",
                      bar === value ? "bg-aura-accent/15 text-white" : "text-white/40 hover:text-white",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {candles.length > 0 ? (
              <LivePriceChart candles={candles} bar={bar} livePrice={livePrice} />
            ) : (
              <div className="grid h-[280px] place-items-center px-4 text-center text-sm text-white/40">
                {candlesLoading
                  ? "Loading chart…"
                  : candleError
                    ? `Chart data unavailable — ${candleError}`
                    : "Chart data unavailable."}
              </div>
            )}
            {candles.length > 0 && candleError && (
              <div className="mt-2 text-[11px] text-aura-wait">{candleError}</div>
            )}
          </div>
          {liveMarket && <StatGrid market={liveMarket} />}
        </div>

        <div className="space-y-4">
          <AgentPicker agentId={agentId} onPick={analyze} disabled={!liveMarket} />
          <ThesisPanel
            thesis={thesis}
            analyzing={analyzing}
            accent={agent.accent}
            error={analysisError}
            ready={Boolean(liveMarket)}
          />
          <BattleSetup
            thesis={thesis}
            humanDir={humanDir}
            setHumanDir={setHumanDir}
            amount={amount}
            setAmount={setAmount}
            availableAura={availableAura}
            stakeIssue={stakeIssue}
            creating={creating}
            onStart={startBattle}
            error={battleError}
          />
        </div>
      </div>
    </div>
  );
}

function Header({
  market,
  routeSymbol,
  loading,
  fetchedAt,
  onRefresh,
}: {
  market: NormalizedMarket | null;
  routeSymbol: string;
  loading: boolean;
  fetchedAt: string | null;
  onRefresh: () => void;
}) {
  const change = market?.change24hPercent ?? null;
  const up = change !== null && change >= 0;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-4">
        <TokenIcon symbol={market?.baseCurrency || routeSymbol.split("-")[0]} size={48} />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight">
            {market?.baseName || routeSymbol}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
            <span>{market?.displayName || routeSymbol}</span>
            {market && (
              <span
                className={cn(
                  "chip !py-0.5 !text-[9px]",
                  market.status === "LIVE" ? "text-aura-long" : "text-aura-wait",
                )}
              >
                {market.status}
              </span>
            )}
            {market && market.instrumentState !== "live" && (
              <span className="chip !py-0.5 !text-[9px] text-aura-wait">{market.instrumentState}</span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="mono text-3xl font-bold">
          {market ? fmtPrice(market.price) : loading ? "…" : NA}
        </div>
        <div className="flex items-center justify-end gap-2">
          {market && (
            <div className={cn("flex items-center gap-1 text-sm font-medium", pnlColorOrNa(change))}>
              {change !== null && (up ? <TrendingUp size={14} /> : <TrendingDown size={14} />)}
              {fmtPctOrNa(change)} 24h
            </div>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="focus-ring rounded-lg border border-white/[0.08] p-1.5 text-white/40 hover:text-white"
            aria-label="Refresh market data"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <div className="mt-0.5 text-[10px] text-white/25" title={market?.quotedAt}>
          quoted {timeAgo(market?.quotedAt)} · fetched {timeAgo(fetchedAt)}
        </div>
      </div>
    </div>
  );
}

function StatGrid({ market }: { market: NormalizedMarket }) {
  const stats: Array<{ label: string; value: string; className?: string }> = [
    { label: "24h High", value: fmtPrice(market.high24h) },
    { label: "24h Low", value: fmtPrice(market.low24h) },
    { label: "24h Open", value: fmtPrice(market.open24h) },
    {
      label: "24h Change",
      value: fmtPrice(market.change24hAbsolute),
      className: pnlColorOrNa(market.change24hAbsolute),
    },
    { label: `Volume (${market.quoteCurrency})`, value: fmtCompactOrNa(market.volume24hQuote, "$") },
    { label: `Volume (${market.baseCurrency})`, value: fmtCompactOrNa(market.volume24hBase) },
    { label: "Best Bid", value: fmtPrice(market.bid), className: "text-aura-long" },
    { label: "Best Ask", value: fmtPrice(market.ask), className: "text-aura-short" },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="glass-soft p-3">
          <div className="text-[10px] uppercase tracking-wider text-white/40">{s.label}</div>
          <div className={cn("mono mt-1 truncate text-sm font-semibold", s.className)}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function AgentPicker({
  agentId,
  onPick,
  disabled,
}: {
  agentId: AgentId;
  onPick: (id: AgentId) => void;
  disabled: boolean;
}) {
  return (
    <div className="glass p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
        <Brain size={14} /> Get an AI thesis
      </div>
      <div className="grid grid-cols-3 gap-2">
        {AGENT_LIST.map((a) => (
          <button
            key={a.id}
            onClick={() => onPick(a.id)}
            disabled={disabled}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-all disabled:opacity-40",
              agentId === a.id
                ? "border-white/20 bg-white/[0.06]"
                : "border-white/[0.06] hover:bg-white/[0.03]",
            )}
            style={agentId === a.id ? { boxShadow: `0 0 0 1px ${a.accent}55` } : undefined}
          >
            <AgentAvatar agent={a} className="h-9 w-9" glyphClassName="text-lg" />
            <span className="text-xs font-bold" style={{ color: a.accent }}>
              {a.name}
            </span>
          </button>
        ))}
      </div>
      {disabled && (
        <p className="mt-3 text-[11px] leading-5 text-white/35">
          Analysis needs a live market quote. It stays disabled while the feed is unavailable rather than
          analysing placeholder prices.
        </p>
      )}
    </div>
  );
}

function ThesisPanel({
  thesis,
  analyzing,
  accent,
  error,
  ready,
}: {
  thesis: Thesis | null;
  analyzing: boolean;
  accent: string;
  error: string | null;
  ready: boolean;
}) {
  if (analyzing) {
    return (
      <div className="glass flex items-center gap-2 p-5 text-sm text-white/50">
        <RefreshCw size={15} className="animate-spin" /> Agent is analyzing real market data…
      </div>
    );
  }
  if (error) {
    return (
      <div className="glass p-5">
        <div className="flex items-start gap-2 text-sm text-aura-short">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">AI analysis unavailable</div>
            <div className="mt-0.5 text-xs opacity-80">{error}</div>
          </div>
        </div>
      </div>
    );
  }
  if (!thesis) {
    return (
      <div className="glass p-5 text-sm text-white/40">
        {ready
          ? "No signal yet. Pick an agent above to generate a weighted thesis from this market's real OKX price and candles."
          : "AI analysis unavailable — no live market data."}
      </div>
    );
  }
  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center justify-between">
        <DirectionBadge direction={thesis.direction} />
        <div className="text-right">
          <div className="mono text-2xl font-bold leading-none">{thesis.confidence}%</div>
          <div className="text-[10px] uppercase tracking-wider text-white/40">confidence</div>
        </div>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-white/70">{thesis.summary}</p>
      <FactorBars factors={thesis.factors} accent={accent} />
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-white/40">
        <span className="chip">
          <Activity size={11} /> {thesis.risk_level} risk
        </span>
        <span>{thesis.horizon_minutes}m horizon</span>
        <span className="ml-auto">
          {thesis.generatedBy === "llm" ? "AI-narrated" : "deterministic model"}
        </span>
      </div>
    </div>
  );
}

function BattleSetup({
  thesis,
  humanDir,
  setHumanDir,
  amount,
  setAmount,
  availableAura,
  stakeIssue,
  creating,
  onStart,
  error,
}: {
  thesis: Thesis | null;
  humanDir: Direction;
  setHumanDir: (d: Direction) => void;
  amount: number;
  setAmount: (n: number) => void;
  availableAura: number;
  stakeIssue: string | null;
  creating: boolean;
  onStart: () => void;
  error: string | null;
}) {
  const dirs: Direction[] = ["LONG", "SHORT", "WAIT"];
  return (
    <div className="glass p-5">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/50">
        <Swords size={14} /> Challenge the AI
      </div>
      {thesis && (
        <p className="mb-3 text-xs text-white/45">
          The AI takes <span className="font-semibold text-white/70">{thesis.direction}</span> on{" "}
          {thesis.asset}. Pick your side and a demo stake.
        </p>
      )}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {dirs.map((d) => (
          <button
            key={d}
            onClick={() => setHumanDir(d)}
            className={cn(
              "rounded-lg border py-2 text-xs font-bold transition-all",
              humanDir === d
                ? d === "LONG"
                  ? "border-aura-long/50 bg-aura-long/15 text-aura-long"
                  : d === "SHORT"
                    ? "border-aura-short/50 bg-aura-short/15 text-aura-short"
                    : "border-aura-wait/50 bg-aura-wait/15 text-aura-wait"
                : "border-white/[0.08] text-white/50 hover:bg-white/[0.03]",
            )}
          >
            {d}
          </button>
        ))}
      </div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
        Demo stake (AURA) · available {fmtAura(availableAura)}
      </label>
      <div className="mb-2 flex items-center gap-2">
        {/* No fixed ceiling: the only maximum is the caller's own balance, and
            the server re-checks it before the battle is created. */}
        <input
          type="number"
          min={MIN_BATTLE_STAKE_AURA}
          max={maxBattleStake(availableAura) || undefined}
          step={0.01}
          value={amount}
          aria-invalid={stakeIssue !== null}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mono w-full min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-white/20"
        />
        {BATTLE_STAKE_PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            className="mono shrink-0 rounded-lg border border-white/[0.08] px-2.5 py-2 text-xs text-white/60 hover:bg-white/[0.03]"
          >
            {v}
          </button>
        ))}
      </div>
      {stakeIssue && (
        <div className="mb-3 text-[11px] leading-4 text-aura-short">{stakeIssue}</div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-aura-short/25 bg-aura-short/[0.07] px-3 py-2 text-[11px] text-aura-short">
          {error}
        </div>
      )}
      <Button className="w-full" disabled={!thesis || creating || stakeIssue !== null} onClick={onStart}>
        {creating ? (
          <>
            <RefreshCw size={15} className="animate-spin" /> Creating battle…
          </>
        ) : (
          <>
            <Swords size={15} /> Enter battle
          </>
        )}
      </Button>
      <p className="mt-2 text-center text-[11px] text-white/30">
        Demo funds only · entry and P&amp;L computed server-side from live OKX prices
      </p>
    </div>
  );
}
