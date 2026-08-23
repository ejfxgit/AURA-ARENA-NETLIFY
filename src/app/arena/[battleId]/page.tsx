"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Swords,
  Zap,
  RefreshCw,
  ShieldCheck,
  Trophy,
  Search,
  Clock,
  AlertCircle,
  Send,
  ExternalLink,
} from "lucide-react";
import { api, ApiError } from "@/lib/client";
import { useWallet } from "@/lib/use-wallet";
import { getBattleAgent } from "@/lib/battle-agents";
import {
  fmtUsd,
  fmtPct,
  cn,
  formatPair,
  fmtPctOrNa,
  fmtPrice,
  NA,
  pnlColor,
  pnlColorOrNa,
  shortHash,
} from "@/lib/utils";
import { FactorBars } from "@/components/factor-bars";
import { LivePriceChart } from "@/components/live-price-chart";
import { LiveStatus } from "@/components/live-status";
import { TokenIcon } from "@/components/ui/token-icon";
import { DirectionBadge } from "@/components/ui/direction-badge";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Button } from "@/components/ui/button";
import { publicConfig } from "@/lib/public-config";
import { fmtAura } from "@/lib/aura-economy";
import { ShareCard } from "@/components/share-card";
import { assetBySymbol } from "@/lib/market/assets";
import { positionPnl } from "@/lib/battle/engine";
import type { LiveCandle } from "@/lib/market/market-data-service";
import {
  useLiveCandles,
  useLivePrice,
  useLiveTicker,
} from "@/lib/market/use-live-market";
import {
  computeLivePosition,
  formatDuration,
  useClockSeconds,
  useLiveSignal,
  type LiveSignal,
} from "@/lib/market/live-signal";
import type { AgentId, Battle, Recalculation } from "@/lib/types";
import { chooseFreshBattle } from "@/lib/battle/state";
import { battleExpiresAt } from "@/lib/battle/timing";

/** The battle's OKX instrument id. `asset` may be a bare base currency. */
const BATTLE_BAR = "1m" as const;

export default function BattlePage() {
  const params = useParams<{ battleId: string }>();
  const id = params.battleId;

  const [battle, setBattle] = useState<Battle | null>(null);
  const [priceStale, setPriceStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const [message, setMessage] = useState("");
  const [challenging, setChallenging] = useState(false);
  const [lastRecalc, setLastRecalc] = useState<Recalculation | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settleAttempt, setSettleAttempt] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const finishRequested = useRef(false);
  const latestBattleRef = useRef<Battle | null>(null);

  // Ref that always holds the current battle id. Stale closures (old finish
  // callbacks still referenced by timeouts or effects) compare against this to
  // ensure they never call /finish for a different battle.
  const currentBattleIdRef = useRef(id);
  // Timestamp (ms) when the battle first appeared as ACTIVE on the client.
  // finish() refuses to run within a short grace period after this so that a
  // stale callback or effect cannot call /finish in the same tick as /start.
  const battleActivatedAtRef = useRef<number | null>(null);

  // Keep the ref in sync on every render so stale closures see the current id.
  currentBattleIdRef.current = id;

  const wallet = useWallet();
  const battleAsset = battle?.asset;
  const battleStatus = battle?.status;
  const battleStartedAt = battle?.started_at;
  const battleExpiresAtMs = battle ? battleExpiresAt(battle) : null;

  // The battle stores `asset` as either a bare base currency or a full OKX
  // instrument id; the live feed needs the instrument id.
  const instId = useMemo(
    () => (battleAsset ? assetBySymbol(battleAsset)?.instId ?? null : null),
    [battleAsset],
  );

  // ---- live market pipeline ----
  // One subscription per instrument, shared with every other component on the
  // page through the central store. Torn down on unmount / instrument change.
  const ticker = useLiveTicker(instId);
  const { candles, error: candleError } = useLiveCandles(instId, BATTLE_BAR, 200);
  const livePrice = useLivePrice(instId, BATTLE_BAR);

  const acceptBattle = useCallback((next: Battle) => {
    const fresh = chooseFreshBattle(latestBattleRef.current, next);
    latestBattleRef.current = fresh;
    setBattle(fresh);
  }, []);

  const load = useCallback(() => {
    if (!wallet.ready) return;
    api<{ battle: Battle; priceStale?: boolean }>(`/api/battles/${id}`)
      .then((d) => {
        acceptBattle(d.battle);
        setPriceStale(Boolean(d.priceStale));
      })
      .catch((e) => setError(e.message || "Battle not found."));
  }, [acceptBattle, id, wallet.ready]);

  // Initial load.
  useEffect(() => {
    if (wallet.initializing) return;
    if (!wallet.ready) {
      wallet.openConnect();
      return;
    }
    load();
  }, [load, wallet, wallet.initializing, wallet.ready]);

  // When the battle id changes (navigating between battles), purge stale
  // settlement state so a retry armed for the old battle cannot fire finish()
  // for the new one.
  useEffect(() => {
    finishRequested.current = false;
    battleActivatedAtRef.current = null;
    setSettleError(null);
    setSettleAttempt(0);
    setFinishing(false);
  }, [id]);

  // Record when the battle first transitions to ACTIVE so finish() can enforce
  // a minimum active duration before settlement is allowed.
  useEffect(() => {
    if (battleStatus === "ACTIVE") {
      if (battleActivatedAtRef.current === null) {
        battleActivatedAtRef.current = Date.now();
      }
    } else {
      battleActivatedAtRef.current = null;
    }
  }, [battleStatus]);

  // Server poll for battle STATE only (status, challenges, settlement). The
  // price and P&L the user watches come from the websocket above, not from here.
  useEffect(() => {
    if (battleStatus !== "ACTIVE") return;
    const iv = setInterval(load, 2500);
    return () => clearInterval(iv);
  }, [battleStatus, load]);

  useEffect(() => {
    if (battleStatus !== "SETTLING") return;
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [battleStatus, load]);

  // Countdown timer, derived from the persisted server expiration timestamp.
  useEffect(() => {
    if (!battleStartedAt || battleExpiresAtMs === null || battleStatus !== "ACTIVE") {
      if (battleStatus && battleStatus !== "ACTIVE") setRemaining(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((battleExpiresAtMs - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const iv = setInterval(tick, 250);
    return () => clearInterval(iv);
  }, [battleStartedAt, battleStatus, battleExpiresAtMs]);

  const finish = useCallback(() => {
    // A stale callback from a previous battle must never call /finish.
    if (currentBattleIdRef.current !== id) return;
    // Do not settle a battle that just transitioned to ACTIVE — a stale
    // effect, old timeout, or React state transition may have armed finish()
    // before the persisted expires_at has genuinely elapsed.
    if (
      battleActivatedAtRef.current !== null &&
      Date.now() - battleActivatedAtRef.current < 1500
    )
      return;
    if (finishRequested.current) return;
    finishRequested.current = true;
    setFinishing(true);
    api<{ battle: Battle }>(`/api/battles/${id}/finish`, { method: "POST" })
      .then((d) => {
        acceptBattle(d.battle);
        setSettleError(null);
        void wallet.refreshAccount();
      })
      .catch((e) => {
        // Settlement requires a real exit price, so the server refuses when the
        // OKX feed is down. Release the guard and record the attempt so the
        // effect below can try again instead of leaving the battle unsettled.
        finishRequested.current = false;
        setSettleError(
          e instanceof ApiError
            ? e.message
            : "Settlement needs a live market price and none is available.",
        );
        setSettleAttempt((n) => n + 1);
      })
      .finally(() => setFinishing(false));
  }, [acceptBattle, id, wallet]);

  // Retry settlement while the market feed is unavailable. `settleAttempt`
  // changes on every failure, which is what re-arms this timer.
  useEffect(() => {
    if (!settleError || battleStatus !== "ACTIVE") return;
    const t = setTimeout(finish, 5000);
    return () => clearTimeout(t);
  }, [settleError, settleAttempt, battleStatus, finish]);

  // Auto-settle when the clock runs out.
  useEffect(() => {
    if (
      battle?.status === "ACTIVE" &&
      remaining === 0 &&
      !finishRequested.current
    ) {
      finish();
    }
  }, [battle?.status, remaining, finish]);

  const start = useCallback(() => {
    api<{ battle: Battle }>(`/api/battles/${id}/start`, { method: "POST" })
      .then((d) => {
        acceptBattle(d.battle);
        finishRequested.current = false;
        setError(null);
        void wallet.refreshAccount();
      })
      .catch((e) => {
        setError(
          e instanceof ApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Unable to start battle.",
        );
      });
  }, [acceptBattle, id, wallet]);

  const submitChallenge = useCallback(() => {
    if (!message.trim() || challenging) return;
    setChallenging(true);
    api<{ battle: Battle; recalculation: Recalculation }>("/api/challenges", {
      method: "POST",
      body: { battleId: id, message: message.trim() },
    })
      .then((d) => {
        acceptBattle(d.battle);
        setLastRecalc(d.recalculation);
        setMessage("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setChallenging(false));
  }, [acceptBattle, id, message, challenging]);

  const verify = useCallback(() => {
    setVerifying(true);
    api<{ battle: Battle }>("/api/onchain/finalize", {
      method: "POST",
      body: { battleId: id },
    })
      .then((d) => acceptBattle(d.battle))
      .catch(() => {})
      .finally(() => setVerifying(false));
  }, [acceptBattle, id]);

  // ---- live agent signal + live position ----
  //
  // Both derive from the SAME live stream the chart and header read, so the
  // signal, the price it was decided at, the position and the P&L can never
  // disagree with each other. Hooks run unconditionally, before the early
  // returns below.
  const liveSignal = useLiveSignal({
    ticker,
    candles,
    agentId: battle && battle.agentId !== "custom" ? (battle.agentId as AgentId) : null,
    customAgent: battle?.customAgent ?? null,
  });

  const now = useClockSeconds(battleStatus === "ACTIVE");
  const agentDirection = battle?.ai_direction ?? "WAIT";
  const agentAmount = battle?.ai_amount ?? 0;
  const leverage = battle?.leverage ?? 1;
  const agentEntry = battle?.entry_price ?? 0;
  const agentStartedAt = battle?.started_at ?? null;

  const livePosition = useMemo(
    () =>
      computeLivePosition({
        direction: agentDirection,
        amount: agentAmount,
        entryPrice: agentEntry,
        livePrice,
        startedAt: agentStartedAt,
        leverage,
        now,
      }),
    [agentDirection, agentAmount, agentEntry, livePrice, agentStartedAt, leverage, now],
  );

  if (error && !battle) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <AlertCircle className="mx-auto mb-3 text-aura-wait" size={28} />
        <p className="text-white/60">{error}</p>
        <Link href="/arena" className="mt-4 inline-block text-sm text-aura-accent">
          ← Back to Arena
        </Link>
      </div>
    );
  }

  if (!battle) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20">
        <div className="h-64 animate-pulse rounded-2xl border border-white/[0.05] bg-white/[0.02]" />
      </div>
    );
  }

  const agent = getBattleAgent(battle);
  const finished =
    battle.status === "FINISHED" ||
    battle.status === "SETTLING" ||
    battle.status === "VERIFIED";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Link
        href="/arena"
        className="focus-ring mb-5 inline-flex items-center gap-1.5 rounded-md text-sm text-white/45 transition-colors hover:text-white/80"
      >
        <ArrowLeft size={15} /> Arena
      </Link>

      <BattleProgress battle={battle} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.15fr_1fr]">
        <AgentColumn
          battle={battle}
          accent={agent.accent}
          recalc={lastRecalc}
          instId={instId}
          livePrice={livePrice}
          changePercent={ticker?.changePercent ?? null}
          liveSignal={liveSignal}
          livePosition={livePosition}
          finished={finished}
        />
        <ArenaCenter
          battle={battle}
          candles={candles}
          candleError={candleError}
          livePrice={livePrice}
          remaining={remaining}
          priceStale={priceStale}
          settleError={settleError}
          finishing={finishing}
          verifying={verifying}
          onStart={start}
          onFinish={finish}
          onVerify={verify}
          wallet={wallet}
        />
        <HumanColumn
          battle={battle}
          message={message}
          setMessage={setMessage}
          challenging={challenging}
          onSubmit={submitChallenge}
          disabled={finished}
        />
      </div>
    </div>
  );
}

function BattleProgress({ battle }: { battle: Battle }) {
  const current = battle.status === "VERIFIED" || battle.xlayer_status === "VERIFIED"
    ? 5
    : battle.status === "SETTLING"
      ? 5
      : battle.status === "FINISHED"
        ? 4
        : battle.status === "ACTIVE"
          ? 4
        : battle.challenges.length > 0
          ? 3
          : 1;
  const stages = ["AI THESIS", "CHALLENGE", "VERIFY", "RECALCULATE", "BATTLE", "ON-CHAIN PROOF"];
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018] px-3 py-3 sm:px-4">
      <div className="grid grid-cols-3 gap-y-3 sm:grid-cols-6 sm:gap-2">
        {stages.map((stage, index) => (
          <div key={stage} className="relative flex items-center gap-2 sm:flex-col sm:gap-1.5 sm:text-center">
            {index > 0 && <span className={cn("absolute -left-1/2 top-3 hidden h-px w-full sm:block", index <= current ? "bg-aura-accent/60" : "bg-white/[0.08]")} />}
            <span className={cn("relative z-10 grid h-6 w-6 place-items-center rounded-full border font-mono text-[9px]", index < current ? "border-aura-accent/50 bg-aura-accent/15 text-aura-accent" : index === current ? "border-aura-long/60 bg-aura-long/10 text-aura-long" : "border-white/[0.1] bg-white/[0.03] text-white/30")}>{String(index + 1).padStart(2, "0")}</span>
            <span className={cn("relative z-10 text-[9px] font-semibold tracking-[0.12em]", index <= current ? "text-white/70" : "text-white/30")}>{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- AI column ----------------------------- */

function AgentColumn({
  battle,
  accent,
  recalc,
  instId,
  livePrice,
  changePercent,
  liveSignal,
  livePosition,
  finished,
}: {
  battle: Battle;
  accent: string;
  recalc: Recalculation | null;
  instId: string | null;
  livePrice: number | null;
  changePercent: number | null;
  liveSignal: LiveSignal;
  livePosition: ReturnType<typeof computeLivePosition>;
  finished: boolean;
}) {
  const agent = getBattleAgent(battle);
  const t = battle.thesis;
  const oldWeights = recalc?.old_weights;

  const [base, quote] = (instId ?? battle.asset).toUpperCase().split("-");
  // The agent holds no position on WAIT, so there is nothing to value.
  const hasPosition = battle.ai_direction !== "WAIT";

  // Once settled, the recorded exit values are the truth — the live feed is no
  // longer what this battle was decided on.
  const shownPnl = finished ? battle.ai_pnl : livePosition.pnl;
  const shownPrice = finished ? battle.exit_price ?? battle.current_price : livePrice;

  return (
    <div className="glass flex flex-col p-5" style={{ borderColor: `${accent}44` }}>
      {/* live market — the same stream the chart and P&L read */}
      <div className="mb-4 rounded-md border border-white/[0.07] bg-black/25 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="terminal-label">Live market</span>
          <LiveStatus />
        </div>
        <div className="flex items-center gap-2.5">
          <TokenIcon symbol={base || battle.asset} size={26} />
          <span className="text-sm font-semibold text-white/85">
            {quote ? `${base} / ${quote}` : base}
          </span>
          <span className="mono ml-auto text-sm font-bold text-white/90">
            {livePrice === null ? NA : fmtPrice(livePrice)}
          </span>
          <span className={cn("mono text-[11px]", pnlColorOrNa(changePercent))}>
            {fmtPctOrNa(changePercent)}
          </span>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <AgentAvatar agent={agent} className="h-11 w-11" glyphClassName="text-xl" />
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-bold" style={{ color: accent }}>
            {agent.name}
          </div>
          <div className="truncate text-[11px] uppercase tracking-wider text-white/40">
            {agent.role} / {agent.specialty}
          </div>
        </div>
      </div>

      {/* Derived factor indicator. This is background analytics computed from
          candles — deliberately NOT the agent's decision, which is the
          persisted value shown in the panel below. */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <LiveStat label="Live factor signal">
          {liveSignal.state === "ready" && liveSignal.direction ? (
            <DirectionBadge direction={liveSignal.direction} />
          ) : (
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-aura-wait">
              {liveSignal.state === "analyzing" ? "ANALYZING" : "WAITING FOR SIGNAL"}
            </span>
          )}
        </LiveStat>
        <LiveStat label="Factor conviction">
          {liveSignal.state === "ready" && liveSignal.confidence !== null ? (
            <span className="mono text-lg font-bold" style={{ color: accent }}>
              {liveSignal.confidence}%
            </span>
          ) : (
            <span className="text-[11px] text-white/35">—</span>
          )}
        </LiveStat>
      </div>

      {liveSignal.note && (
        <div className="mb-3 text-[10px] leading-4 text-white/32">{liveSignal.note}</div>
      )}
      {liveSignal.state === "ready" && liveSignal.decidedAt && (
        <div className="mb-3 text-[10px] leading-4 text-white/32">
          Decided {new Date(liveSignal.decidedAt).toLocaleTimeString("en-US")} at{" "}
          {fmtPrice(liveSignal.decisionPrice)} · {liveSignal.sampleSize} candles
        </div>
      )}

      {/* The committed position for this battle. `ai_direction` is the AURA
          agent's own decision, normalized and persisted when the battle was
          created, and it is the same value settlement reads — so this panel
          names the agent. The model provider that produced it internally is an
          implementation detail and is never the competing entity. */}
      <div className="mb-4 grid grid-cols-2 gap-2 border-y border-white/[0.07] py-3">
        <LiveStat label={`${agent.name} decision`}>
          <DirectionBadge direction={battle.ai_direction} />
        </LiveStat>
        <LiveStat label="Agent confidence">
          <span className="mono text-sm font-semibold text-white/85">
            {battle.ai_confidence_after}%
          </span>
        </LiveStat>
        <LiveStat label="Decision horizon">
          <span className="mono text-sm font-semibold text-white/85">
            {battle.thesis ? `${battle.thesis.horizon_minutes} MIN` : NA}
          </span>
        </LiveStat>
        <LiveStat label="Position size">
          <span className="mono text-sm font-semibold text-white/85">
            {hasPosition ? fmtAura(battle.ai_amount) : NA}
          </span>
        </LiveStat>
        <LiveStat label="Leverage · locked">
          <span className="mono text-sm font-semibold text-white/85">{battle.leverage}x</span>
        </LiveStat>
        <LiveStat label="Entry">
          <span className="mono text-sm text-white/75">
            {battle.entry_price > 0 ? fmtPrice(battle.entry_price) : NA}
          </span>
        </LiveStat>
        <LiveStat label={finished ? "Exit price" : "Current price"}>
          <span className="mono text-sm text-white/75">
            {shownPrice === null || shownPrice === undefined ? NA : fmtPrice(shownPrice)}
          </span>
        </LiveStat>
        <LiveStat label="P&L">
          {hasPosition && shownPnl !== null ? (
            <span className={cn("mono text-sm font-bold", pnlColor(shownPnl))}>
              {fmtAura(shownPnl, { sign: true })}
            </span>
          ) : (
            <span className="text-[11px] text-white/35">
              {hasPosition ? NA : "no position"}
            </span>
          )}
        </LiveStat>
        <LiveStat label="Time in position">
          <span className="mono text-sm text-white/75">
            {battle.started_at ? formatDuration(livePosition.secondsInPosition) : NA}
          </span>
        </LiveStat>
      </div>

      <div className="mb-2 terminal-label">Thesis at entry</div>
      <p className="mb-4 text-sm leading-relaxed text-white/70">{t.summary}</p>
      <div className="mb-4 rounded-md border border-white/[0.07] bg-white/[0.018] px-3 py-2 text-xs italic text-white/45">&ldquo;{agent.voice}&rdquo;</div>

      <div className="mb-2 terminal-label">
        Factor weights {liveSignal.state === "ready" ? "· live" : "· at entry"}
      </div>
      <FactorBars
        factors={liveSignal.state === "ready" && liveSignal.factors.length ? liveSignal.factors : t.factors}
        accent={accent}
        highlight={recalc?.attackedFactor}
        compareWeights={oldWeights}
      />

      <AnimatePresence>
        {recalc && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 rounded-lg border border-aura-accent/20 bg-aura-accent/[0.06] p-3 text-sm text-white/70"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-aura-accent">
              <RefreshCw size={12} /> Recalculated
            </div>
            {recalc.explanation}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Compact label + value cell used throughout the live agent panel. */
function LiveStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="terminal-label">{label}</div>
      <div className="mt-1 flex items-center">{children}</div>
    </div>
  );
}

/* ---------------------------- Human column ---------------------------- */

function HumanColumn({
  battle,
  message,
  setMessage,
  challenging,
  onSubmit,
  disabled,
}: {
  battle: Battle;
  message: string;
  setMessage: (s: string) => void;
  challenging: boolean;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const canChallenge = battle.status === "ACTIVE" || battle.status === "WAITING";
  return (
    <div className="glass flex flex-col p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-3xl">👤</span>
        <div>
          <div className="font-display text-lg font-bold">YOU</div>
          <div className="text-[11px] uppercase tracking-wider text-white/40">
            Challenger
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-white/45">Your side</span>
          <DirectionBadge direction={battle.human_direction} />
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/50">
        <Swords size={14} /> Challenge a factor
      </div>
      <p className="mb-3 text-xs text-white/45">
        Attack a specific assumption with evidence. Soft signals (social) move
        the needle; hard market data resists. Example: “Your social signal is
        inflated by bot accounts.”
      </p>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={disabled || challenging}
        rows={3}
        placeholder="Type your evidence-backed challenge…"
        className="focus-ring mb-3 w-full resize-none rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm outline-none focus:border-aura-accent/50 disabled:opacity-50"
      />
      <Button
        variant="secondary"
        className="w-full"
        disabled={disabled || challenging || !canChallenge || !message.trim()}
        onClick={onSubmit}
      >
        {challenging ? (
          <>
            <Search size={15} className="animate-spin" /> Verifying evidence…
          </>
        ) : (
          <>
            <Send size={15} /> Submit challenge
          </>
        )}
      </Button>

      <div className="mt-5 flex-1">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-white/40">
          Challenge log ({battle.challenges.length})
        </div>
        <div className="space-y-2">
          {battle.challenges.length === 0 && (
            <div className="text-xs text-white/30">No challenges yet.</div>
          )}
          {[...battle.challenges].reverse().map((c) => (
            <ChallengeItem key={c.id} recalc={c.recalculation} message={c.message} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChallengeItem({
  recalc,
  message,
}: {
  recalc: Recalculation | null;
  message: string;
}) {
  const valid = recalc?.materiallyValid;
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <p className="mb-2 text-xs text-white/70">“{message}”</p>
      {recalc ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-semibold",
              valid
                ? "bg-aura-long/15 text-aura-long"
                : "bg-white/[0.06] text-white/45",
            )}
          >
            {valid ? "Material" : "No material change"}
          </span>
          <span className="mono text-white/50">
            {recalc.old_confidence}% → {recalc.new_confidence}%
          </span>
          {recalc.old_direction !== recalc.new_direction && (
            <span className="mono text-aura-wait">
              {recalc.old_direction} → {recalc.new_direction}
            </span>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-white/30">No recalculation.</div>
      )}
    </div>
  );
}

/* ---------------------------- Center column --------------------------- */

function fmtClock(sec: number | null): string {
  if (sec == null) return "00:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ArenaCenter({
  battle,
  candles,
  candleError,
  livePrice,
  remaining,
  priceStale,
  settleError,
  finishing,
  verifying,
  onStart,
  onFinish,
  onVerify,
  wallet,
}: {
  battle: Battle;
  candles: LiveCandle[];
  candleError: string | null;
  livePrice: number | null;
  remaining: number | null;
  priceStale: boolean;
  settleError: string | null;
  finishing: boolean;
  verifying: boolean;
  onStart: () => void;
  onFinish: () => void;
  onVerify: () => void;
  wallet: ReturnType<typeof useWallet>;
}) {
  const finished =
    battle.status === "FINISHED" ||
    battle.status === "SETTLING" ||
    battle.status === "VERIFIED";

  // Once settled the recorded exit price is the truth; while running, the live
  // stream is. Neither case invents a number.
  const shownPrice = finished
    ? battle.exit_price ?? battle.current_price
    : livePrice;

  const priceMove =
    battle.entry_price > 0 && shownPrice != null && Number.isFinite(shownPrice)
      ? ((shownPrice - battle.entry_price) / battle.entry_price) * 100
      : null;

  // Both sides are valued from the SAME live price. Once settled the recorded
  // server-authoritative figures take over — the live feed no longer applies.
  const canValue = !finished && livePrice != null && Number.isFinite(livePrice) && battle.entry_price > 0;
  const liveAiPnl = canValue
    ? positionPnl(battle.ai_direction, battle.ai_amount, battle.entry_price, livePrice as number, battle.leverage)
    : battle.ai_pnl;
  const liveHumanPnl = canValue
    ? positionPnl(battle.human_direction, battle.human_amount, battle.entry_price, livePrice as number, battle.leverage)
    : battle.human_pnl;

  return (
    <div className="glass flex flex-col p-5">
      {/* header: asset + clock */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenIcon symbol={battle.asset.split("-")[0]} size={22} />
          <div className="chip border-white/[0.12] text-white/80">{formatPair(battle.asset)}</div>
          {!finished && <LiveStatus showLabel={false} />}
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-white/40" />
          <span
            className={cn(
            "mono text-2xl font-bold tabular-nums",
              remaining != null && remaining <= 30 && battle.status === "ACTIVE"
                ? "text-aura-short"
                : "text-white",
            )}
          >
            {battle.status === "ACTIVE"
              ? fmtClock(remaining)
              : finished
                ? "00:00"
                : fmtClock(battle.duration_seconds)}
          </span>
        </div>
      </div>

      {/* price */}
      <div className="mb-4 border-y border-white/[0.07] py-4 text-center">
        <div className="terminal-label">
          {finished
            ? "Settled exit price"
            : priceStale
              ? "Last known price · OKX unavailable"
              : "Live market price"}
        </div>
        <div className="mono mt-1 text-4xl font-bold">
          {shownPrice == null ? NA : fmtPrice(shownPrice)}
        </div>
        <div className={cn("text-sm font-medium", pnlColorOrNa(priceMove))}>
          {priceMove === null ? NA : fmtPct(priceMove)} since entry (
          {battle.entry_price > 0 ? fmtPrice(battle.entry_price) : NA})
        </div>
        {priceStale && !finished && (
          <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-aura-wait">
            not refreshing — no substitute price is shown
          </div>
        )}
      </div>

      <div className="mb-4 overflow-hidden rounded-lg border border-white/[0.07] bg-[#070a12]">
        {candles.length > 0 ? (
          <LivePriceChart
            candles={candles}
            bar={BATTLE_BAR}
            livePrice={finished ? null : livePrice}
            height={160}
            showVolume={false}
          />
        ) : (
          <div className="grid h-[160px] place-items-center px-3 text-center text-xs text-white/30">
            {candleError ?? "chart unavailable"}
          </div>
        )}
      </div>

      {/* live P&L */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <PnlCard
          label={`${getBattleAgent(battle).name} (AI)`}
          direction={battle.ai_direction}
          pnl={liveAiPnl}
          amount={battle.ai_amount}
          leverage={battle.leverage}
          leader={liveHumanPnl < liveAiPnl}
        />
        <PnlCard
          label="YOU"
          direction={battle.human_direction}
          pnl={liveHumanPnl}
          amount={battle.human_amount}
          leverage={battle.leverage}
          leader={liveHumanPnl > liveAiPnl}
        />
      </div>

      {/* controls / result */}
      {battle.status === "WAITING" && (
        <Button className="w-full" onClick={onStart}>
          <Zap size={15} /> Start battle — {fmtClock(battle.duration_seconds)}
        </Button>
      )}

      {battle.status === "ACTIVE" && (
        <>
          <Button
            variant="danger"
            className="w-full"
            disabled={finishing || remaining !== 0}
            onClick={onFinish}
          >
            {finishing ? (
              <>
                <RefreshCw size={15} className="animate-spin" /> Settling…
              </>
            ) : remaining === 0 ? "Expired — awaiting settlement" : "Battle active"}
          </Button>
          {settleError && (
            <p className="mt-2 text-center text-[11px] leading-4 text-aura-wait">
              {settleError} Retrying — the battle stays open until a real exit price is available.
            </p>
          )}
        </>
      )}

      {finished && (
        <ResultBlock
          battle={battle}
        />
      )}
    </div>
  );
}

function PnlCard({
  label,
  direction,
  pnl,
  amount,
  leverage,
  leader,
}: {
  label: string;
  direction: Battle["ai_direction"];
  pnl: number;
  amount: number;
  leverage: number;
  leader: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        leader ? "border-aura-long/30 bg-aura-long/[0.04]" : "border-white/[0.07]",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/70">{label}</span>
        <DirectionBadge direction={direction} size="sm" />
      </div>
      <div className={cn("mono text-xl font-bold", pnlColor(pnl))}>
        {fmtAura(pnl, { sign: true })}
      </div>
        <div className="text-[11px] text-white/35">{fmtAura(amount)} stake · {leverage}x</div>
    </div>
  );
}

function ResultBlock({
  battle,
}: {
  battle: Battle;
}) {
  const won = battle.winner === "HUMAN";
  const draw = battle.winner === "DRAW";
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-lg border p-4 text-center",
          won
            ? "border-aura-long/40 bg-aura-long/10"
            : draw
              ? "border-white/15 bg-white/[0.04]"
              : "border-aura-short/40 bg-aura-short/10",
        )}
      >
        <Trophy
          size={22}
          className={cn(
            "mx-auto mb-1",
            won ? "text-aura-long" : draw ? "text-white/60" : "text-aura-short",
          )}
        />
          <div className="font-display text-xl font-bold">
          {won ? "You beat the AI" : draw ? "Dead heat" : `${getBattleAgent(battle).name} wins`}
        </div>
        <div className="mono mt-1 text-sm text-white/60">
          You {fmtAura(battle.human_pnl, { sign: true })} · AI{" "}
          {fmtAura(battle.ai_pnl, { sign: true })}
        </div>
        <div className="mono mt-2 text-xs text-white/45">AI {battle.ai_direction} · {fmtAura(battle.ai_amount)} · {battle.leverage}x · YOU {battle.human_direction} · {fmtAura(battle.human_amount)} · {battle.leverage}x</div>
        <div className="mono mt-1 text-xs text-white/45">Entry {fmtPrice(battle.entry_price)} · Settlement {battle.exit_price == null ? NA : fmtPrice(battle.exit_price)}</div>
      </div>

      {battle.status === "VERIFIED" && (
        <a
          href={battle.xlayer_explorer_url || `${publicConfig.explorer}/tx/${battle.xlayer_tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border border-aura-long/30 bg-aura-long/10 px-4 py-3 text-sm transition-colors hover:bg-aura-long/15"
        >
          <span className="flex items-center gap-2 font-semibold text-aura-long">
            <ShieldCheck size={16} /> X LAYER VERIFIED
          </span>
          <span className="mono text-xs text-white/50">
            {shortHash(battle.xlayer_tx_hash)}
          </span>
        </a>
      )}

      {(battle.xlayer_status === "PENDING" || battle.status === "SETTLING") && (
        <div className="rounded-xl border border-aura-wait/30 bg-aura-wait/[0.07] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-aura-wait">
            <RefreshCw size={15} className="animate-spin" /> Verification pending
          </div>
          {battle.xlayer_tx_hash && (
            <a
              href={battle.xlayer_explorer_url || `${publicConfig.explorer}/tx/${battle.xlayer_tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mono mt-2 flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70"
            >
              {shortHash(battle.xlayer_tx_hash)} <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
          Off-chain data hash
        </div>
        <div className="mono break-all text-[11px] text-white/50">
          {shortHash(battle.xlayer_data_hash || battle.thesis_hash, 10)}
        </div>
      </div>

      <ShareCard battle={battle} />

      <Link
        href="/arena"
        className="block text-center text-sm text-aura-accent hover:underline"
      >
        Start another battle →
      </Link>
    </div>
  );
}

