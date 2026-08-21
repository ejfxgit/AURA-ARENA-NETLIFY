"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  ReceiptText,
  ShieldCheck,
  Trophy,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/client";
import { getAgent } from "@/lib/agents";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { getBattleAgent } from "@/lib/battle-agents";
import { publicConfig } from "@/lib/public-config";
import { fmtAura } from "@/lib/aura-economy";
import { useWallet } from "@/lib/use-wallet";
import { LandingArenaButton } from "@/components/landing-arena-button";
import { cn, fmtPctOrNa, fmtPrice, fmtUsd, formatPair, pnlColor, pnlColorOrNa, shortHash } from "@/lib/utils";
import type { Agent, Battle } from "@/lib/types";
import type { NormalizedMarket } from "@/lib/market/okx-types";

type RankedAgent = Agent & {
  challenge_success: number;
  challenge_defense: number;
  challenge_defense_rate: number;
};

type RankedHuman = {
  userId: string;
  realized_pnl: number;
  wins: number;
  losses: number;
  win_rate: number;
  valid_challenges: number;
  invalid_challenges: number;
  challenge_success_rate: number;
  reputation_score: number;
};

export function LandingBattlePreview() {
  const [battles, setBattles] = useState<Battle[] | null>(null);

  useEffect(() => {
    api<{ battles: Battle[] }>("/api/battles")
      .then((data) => setBattles(data.battles))
      .catch(() => setBattles([]));
  }, []);

  const battle = useMemo(() => {
    if (!battles?.length) return null;
    return (
      battles.find((item) => item.status === "ACTIVE") ||
      battles.find((item) => item.status === "WAITING") ||
      battles[0]
    );
  }, [battles]);

  if (battles === null) return <BattleSkeleton />;

  if (!battle) {
    return (
      <div className="landing-terminal overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
          <StatusBadge label="AWAITING MATCH" tone="neutral" />
          <span className="terminal-label">Battle format preview</span>
        </div>
        <div className="grid items-center gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
          <Competitor avatar={getAgent("volt").avatar} avatarImage={getAgent("volt").avatarImage} name="VOLT" role="Momentum specialist" accent="#22e39a" />
          <div className="text-center">
            <div className="mono text-4xl font-bold tabular-nums">05:00</div>
            <div className="terminal-label mt-2">Battle clock</div>
            <div className="mt-4 inline-flex rounded-md border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-white/65">
              BTC / ETH / SOL
            </div>
          </div>
          <Competitor avatar="H" name="HUMAN" role="Evidence challenger" />
        </div>
        <div className="grid gap-px border-t border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
          <BattleDatum label="Entry price" value="Captured at start" />
          <BattleDatum label="P&L" value="Server-calculated" />
          <BattleDatum label="Result" value="No battle created" />
        </div>
        <div className="flex flex-col gap-3 border-t border-white/[0.07] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-white/45">Create a match to populate this panel with actual battle data.</p>
          <LandingArenaButton className="landing-text-link">
            Enter Arena <ArrowRight size={14} />
          </LandingArenaButton>
        </div>
      </div>
    );
  }

  const agent = getBattleAgent(battle);
  const finished = battle.status === "FINISHED" || battle.status === "VERIFIED" || battle.status === "SETTLING";
  const status = battle.status === "ACTIVE" ? "LIVE" : battle.status === "WAITING" ? "READY" : battle.status;
  const winner = !finished ? "IN PROGRESS" : battle.winner === "HUMAN" ? "HUMAN" : battle.winner === "AI" ? agent.name : "DRAW";

  return (
    <div className="landing-terminal overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-6">
        <StatusBadge label={status} tone={battle.status === "ACTIVE" ? "positive" : "neutral"} pulse={battle.status === "ACTIVE"} />
        <span className="terminal-label">Real battle state</span>
      </div>
      <div className="grid items-center gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto_1fr]">
        <Competitor avatar={agent.avatar} avatarImage={agent.avatarImage} name={agent.name} role={`${battle.ai_direction} · ${battle.ai_confidence_after}% confidence`} accent={agent.accent} />
        <div className="text-center">
          <div className="mono text-4xl font-bold tabular-nums">{battle.status === "ACTIVE" ? "LIVE" : finished ? "00:00" : "05:00"}</div>
          <div className="terminal-label mt-2">Battle clock</div>
          <div className="mt-4 inline-flex rounded-md border border-white/[0.1] px-3 py-1.5 text-xs font-semibold text-white/75">
            {formatPair(battle.asset)}
          </div>
        </div>
        <Competitor avatar="YOU" name="HUMAN" role={`${battle.human_direction} · ${fmtAura(battle.human_amount)} virtual`} />
      </div>
      <div className="grid gap-px border-t border-white/[0.07] bg-white/[0.07] sm:grid-cols-3">
        <BattleDatum label="Entry price" value={fmtUsd(battle.entry_price)} />
        <BattleDatum label="Current / exit" value={fmtUsd(battle.exit_price ?? battle.current_price)} />
        <BattleDatum label="Winner" value={winner} accent={finished} />
      </div>
      <div className="grid gap-px border-t border-white/[0.07] bg-white/[0.07] sm:grid-cols-2">
        <BattleDatum label={`${agent.name} AURA P&L`} value={fmtAura(battle.ai_pnl, { sign: true })} valueClass={pnlColor(battle.ai_pnl)} />
        <BattleDatum label="Human AURA P&L" value={fmtAura(battle.human_pnl, { sign: true })} valueClass={pnlColor(battle.human_pnl)} />
      </div>
      <div className="flex flex-col gap-3 border-t border-white/[0.07] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap gap-2">
          <StatusBadge label="MARKET DATA" tone="info" />
          <StatusBadge label="SERVER SETTLED" tone="neutral" />
          <StatusBadge label="SIMULATED EXECUTION" tone="neutral" />
        </div>
        <Link href={`/arena/${battle.id}`} className="landing-text-link">
          Open battle <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export function LandingMarketPreview() {
  const [markets, setMarkets] = useState<NormalizedMarket[] | null>(null);
  const [battles, setBattles] = useState<Battle[]>([]);

  useEffect(() => {
    Promise.all([
      // The three deepest live OKX spot markets by real 24h quote volume. The
      // symbols are whatever OKX ranks highest, not a hardcoded selection.
      api<{ markets: NormalizedMarket[] }>("/api/markets?limit=3&sort=volume"),
      api<{ battles: Battle[] }>("/api/battles"),
    ])
      .then(([marketData, battleData]) => {
        setMarkets(marketData.markets);
        setBattles(battleData.battles);
      })
      .catch(() => setMarkets([]));
  }, []);

  if (markets === null) {
    return <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-52 animate-pulse rounded-lg border border-white/[0.07] bg-white/[0.02]" />)}</div>;
  }

  if (markets.length === 0) {
    return <div className="landing-empty">Market data is temporarily unavailable. The market engine will retry without inventing values.</div>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {markets.map((market) => {
        const related = battles.filter((battle) => battle.asset === market.baseCurrency || battle.asset === market.instId);
        const active = related.filter((battle) => battle.status === "ACTIVE").length;
        const latest = related[0];
        const leader = !latest
          ? "NO MATCH"
          : latest.status === "ACTIVE"
            ? latest.human_pnl > latest.ai_pnl ? "HUMAN" : latest.human_pnl < latest.ai_pnl ? getBattleAgent(latest).name : "TIED"
            : latest.winner === "HUMAN" ? "HUMAN" : latest.winner === "AI" ? getBattleAgent(latest).name : latest.winner || "READY";
        return (
          <Link key={market.instId} href={`/markets/${market.instId.toLowerCase()}`} className="landing-market group">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-lg font-bold">{market.baseCurrency}<span className="text-white/25"> / {market.quoteCurrency}</span></div>
                <div className="mt-1 text-xs text-white/35">{market.baseName}</div>
              </div>
              <StatusBadge label={market.status} tone={market.status === "LIVE" ? "positive" : "warning"} pulse={market.status === "LIVE"} />
            </div>
            <div className="mt-7">
              <div className="terminal-label">Price</div>
              <div className="mono mt-1 text-2xl font-bold">{fmtPrice(market.price)}</div>
              <div className={cn("mt-1 text-sm font-semibold", pnlColorOrNa(market.change24hPercent))}>{fmtPctOrNa(market.change24hPercent)} 24H</div>
            </div>
            <div className="mt-6 grid grid-cols-2 border-t border-white/[0.07] pt-4">
              <div><div className="terminal-label">Active battles</div><div className="mono mt-1 text-sm text-white/75">{active}</div></div>
              <div className="border-l border-white/[0.07] pl-4"><div className="terminal-label">Current leader</div><div className="mono mt-1 text-sm text-white/75">{leader}</div></div>
            </div>
            <ArrowRight size={15} className="absolute right-4 top-1/2 text-white/15 transition group-hover:translate-x-0.5 group-hover:text-aura-accent" />
          </Link>
        );
      })}
    </div>
  );
}

export function LandingReputationPreview() {
  const wallet = useWallet();
  const [agents, setAgents] = useState<RankedAgent[] | null>(null);
  const [humans, setHumans] = useState<RankedHuman[]>([]);

  useEffect(() => {
    api<{ agents: RankedAgent[]; humans: RankedHuman[] }>("/api/leaderboard")
      .then((leaderboard) => {
        setAgents(leaderboard.agents);
        setHumans(leaderboard.humans);
      })
      .catch(() => setAgents([]));
  }, []);

  if (agents === null) return <div className="h-80 animate-pulse rounded-lg border border-white/[0.07] bg-white/[0.02]" />;

  const current = wallet.profile
    ? humans.find((human) => human.userId.endsWith(wallet.profile!.id.slice(-8)))
    : undefined;
  const rankedAgents = agents.filter((agent) => agent.wins + agent.losses > 0);
  const lead = rankedAgents[0];

  return (
    <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
      <div className="landing-terminal p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="terminal-label">Highest reputation</div>
            <div className="mt-2 font-display text-2xl font-bold" style={{ color: lead?.accent }}>{lead?.name || "UNAVAILABLE"}</div>
          </div>
          <Trophy size={24} className="text-aura-gold" />
        </div>
        <div className="mt-7 grid grid-cols-3 gap-3 border-y border-white/[0.07] py-4">
          <Metric label="Rep" value={lead?.reputation_score ?? "-"} />
          <Metric label="Wins" value={lead?.wins ?? "-"} />
          <Metric label="Win rate" value={lead ? `${lead.win_rate}%` : "-"} />
        </div>
        <div className="mt-6 flex items-center gap-3 border-b border-white/[0.07] pb-5">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025]"><UserRound size={18} className="text-white/50" /></span>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Your human record</div>
            <div className="mt-1 text-xs text-white/40">{wallet.account?.total_battles ? `${wallet.account.total_battles} settled battles` : wallet.ready ? "Complete a battle to build your record" : "Connect your wallet to view your record"}</div>
          </div>
          <div className="mono ml-auto text-sm font-bold text-aura-accent">{current ? `${current.reputation_score} REP` : "-"}</div>
        </div>
        <Link href="/leaderboard" className="landing-text-link mt-5">
          View leaderboard <ArrowRight size={14} />
        </Link>
      </div>

      <div className="landing-terminal overflow-hidden">
        <div className="grid grid-cols-[42px_1fr_72px_72px] gap-3 border-b border-white/[0.07] px-4 py-3 sm:grid-cols-[52px_1fr_100px_100px_100px] sm:px-5">
          <span className="terminal-label">Rank</span><span className="terminal-label">Competitor</span><span className="terminal-label text-right">Win rate</span><span className="terminal-label text-right">Rep</span><span className="terminal-label hidden text-right sm:block">Avg P&L</span>
        </div>
        {rankedAgents.length ? rankedAgents.slice(0, 3).map((agent, index) => (
          <div key={agent.id} className="grid grid-cols-[42px_1fr_72px_72px] items-center gap-3 border-b border-white/[0.06] px-4 py-4 sm:grid-cols-[52px_1fr_100px_100px_100px] sm:px-5">
            <span className="mono text-sm text-white/35">{String(index + 1).padStart(2, "0")}</span>
            <span className="flex min-w-0 items-center gap-2.5"><AgentAvatar agent={agent} className="h-7 w-7 rounded-md" glyphClassName="text-[10px]" /><span className="truncate text-sm font-semibold" style={{ color: agent.accent }}>{agent.name}</span></span>
            <span className="mono text-right text-sm text-white/70">{agent.win_rate}%</span>
            <span className="mono text-right text-sm font-semibold">{agent.reputation_score}</span>
            <span className="mono hidden text-right text-sm text-white/60 sm:block">{agent.avg_pnl}%</span>
          </div>
        )) : <div className="grid min-h-40 place-items-center border-b border-white/[0.06] px-5 text-center text-sm text-white/35">No recorded agent rankings yet.</div>}
        <div className="grid grid-cols-[42px_1fr_72px_72px] items-center gap-3 bg-aura-accent/[0.055] px-4 py-4 sm:grid-cols-[52px_1fr_100px_100px_100px] sm:px-5">
          <span className="mono text-sm text-aura-accent">YOU</span>
          <span className="text-sm font-semibold">HUMAN</span>
          <span className="mono text-right text-sm text-white/70">{current ? `${current.win_rate}%` : "-"}</span>
          <span className="mono text-right text-sm font-semibold">{current?.reputation_score ?? "-"}</span>
          <span className="mono hidden text-right text-sm text-white/60 sm:block">{current ? fmtAura(current.realized_pnl, { sign: true }) : "-"}</span>
        </div>
      </div>
    </div>
  );
}

export function LandingProofState() {
  const [battle, setBattle] = useState<Battle | null | undefined>(undefined);

  useEffect(() => {
    api<{ battles: Battle[] }>("/api/battles")
      .then((data) => {
        const proof = data.battles.find((item) => item.xlayer_status && item.status !== "WAITING" && item.status !== "ACTIVE");
        setBattle(proof || null);
      })
      .catch(() => setBattle(null));
  }, []);

  const verified = battle?.xlayer_status === "VERIFIED" && Boolean(battle.xlayer_tx_hash);
  const state = verified
    ? "VERIFIED"
    : battle?.xlayer_status === "PENDING"
      ? "PENDING"
      : battle?.xlayer_status === "FAILED"
        ? "FAILED"
        : publicConfig.contract
          ? "READY"
          : "UNCONFIGURED";
  const tone = verified ? "positive" : state === "FAILED" ? "negative" : state === "PENDING" ? "warning" : "neutral";

  return (
    <div className="landing-terminal p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="terminal-label">X Layer proof state</div>
          <div className="mt-3"><StatusBadge label={battle === undefined ? "CHECKING" : state} tone={tone} pulse={state === "PENDING"} /></div>
        </div>
        <ShieldCheck size={24} className={verified ? "text-aura-long" : "text-white/25"} />
      </div>
      <p className="mt-5 text-sm leading-6 text-white/50">
        {verified
          ? "A real finalization transaction exists for the displayed battle."
          : state === "PENDING"
            ? "A transaction was submitted and is waiting for confirmation."
            : state === "FAILED"
              ? "The battle remains server-settled and on-chain verification can be retried."
              : state === "READY"
                ? "The public contract is configured. VERIFIED still requires a real battle transaction."
                : "No public contract is configured. No transaction or verification claim is displayed."}
      </p>
      {verified && battle?.xlayer_tx_hash && (
        <a href={battle.xlayer_explorer_url || `${publicConfig.explorer}/tx/${battle.xlayer_tx_hash}`} target="_blank" rel="noreferrer" className="landing-text-link mt-5">
          {shortHash(battle.xlayer_tx_hash, 8)} <ExternalLink size={13} />
        </a>
      )}
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.07]">
        <BattleDatum label="Network" value="X Layer" />
        <BattleDatum label="Contract" value={publicConfig.contract ? shortHash(publicConfig.contract, 5) : "Not configured"} />
      </div>
    </div>
  );
}

export function LandingRecordPreview() {
  const [battles, setBattles] = useState<Battle[] | null>(null);

  useEffect(() => {
    api<{ battles: Battle[] }>("/api/battles")
      .then((data) => setBattles(data.battles))
      .catch(() => setBattles([]));
  }, []);

  const battle = useMemo(() => {
    if (!battles?.length) return null;
    return battles.find((item) => item.status !== "WAITING" && item.status !== "ACTIVE") || null;
  }, [battles]);

  if (battles === null) return <div className="h-[430px] animate-pulse rounded-lg border border-white/[0.07] bg-white/[0.02]" />;

  const agent = battle ? getBattleAgent(battle) : null;
  const challenge = battle?.challenges[0];
  const verified = battle?.xlayer_status === "VERIFIED" && Boolean(battle.xlayer_tx_hash);
  const proofStatus = verified ? "VERIFIED" : battle?.xlayer_status || "UNCONFIGURED";

  const rows = [
    ["AI / Human", battle && agent ? `${agent.name} / HUMAN` : "AWAITING SETTLED BATTLE"],
    ["Market", battle ? formatPair(battle.asset) : "-"],
    ["Thesis", battle ? `${battle.ai_direction} / ${battle.thesis.summary}` : "-"],
    ["Challenge", challenge?.message || (battle ? "No challenge submitted" : "-")],
    ["Confidence before", battle ? `${battle.ai_confidence_before}%` : "-"],
    ["Confidence after", battle ? `${battle.ai_confidence_after}%` : "-"],
    ["Battle duration", battle ? `${String(Math.floor(battle.duration_seconds / 60)).padStart(2, "0")}:00` : "05:00 FORMAT"],
    ["Final AURA P&L", battle && agent ? `${agent.name} ${fmtAura(battle.ai_pnl, { sign: true })} / HUMAN ${fmtAura(battle.human_pnl, { sign: true })}` : "-"],
  ];

  return (
    <div className="landing-terminal overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/[0.08] text-aura-accent"><ReceiptText size={17} /></span>
          <div><div className="terminal-label">Battle record</div><div className="mono mt-1 text-xs text-white/55">{battle ? shortHash(battle.id, 7) : "NO RECORD YET"}</div></div>
        </div>
        <StatusBadge label={proofStatus} tone={verified ? "positive" : proofStatus === "FAILED" ? "negative" : proofStatus === "PENDING" ? "warning" : "neutral"} pulse={proofStatus === "PENDING"} />
      </div>

      <div className="grid lg:grid-cols-2">
        {rows.map(([label, value], index) => (
          <div key={label} className={cn("min-w-0 border-white/[0.07] px-5 py-4 sm:px-6", index < rows.length - 2 && "border-b", index % 2 === 0 && "lg:border-r")}>
            <div className="terminal-label">{label}</div>
            <div className={cn("mt-1 text-sm leading-6 text-white/70", label !== "Thesis" && label !== "Challenge" && "mono")}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.07] bg-white/[0.015] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <div className="terminal-label">Transaction / proof</div>
          <div className="mono mt-1 text-xs text-white/55">{verified && battle?.xlayer_tx_hash ? shortHash(battle.xlayer_tx_hash, 10) : "Not available until confirmed"}</div>
        </div>
        {verified && battle?.xlayer_tx_hash ? (
          <a href={battle.xlayer_explorer_url || `${publicConfig.explorer}/tx/${battle.xlayer_tx_hash}`} target="_blank" rel="noreferrer" className="landing-text-link">
            Inspect proof <ExternalLink size={13} />
          </a>
        ) : battle ? (
          <Link href={`/arena/${battle.id}`} className="landing-text-link">Open record <ArrowRight size={14} /></Link>
        ) : (
          <LandingArenaButton className="landing-text-link">Create first record <ArrowRight size={14} /></LandingArenaButton>
        )}
      </div>
    </div>
  );
}

function BattleSkeleton() {
  return <div className="h-[430px] animate-pulse rounded-lg border border-white/[0.07] bg-white/[0.02]" />;
}

function Competitor({ avatar, avatarImage, name, role, accent }: { avatar: string; avatarImage?: string | null; name: string; role: string; accent?: string }) {
  return (
    <div className="text-center">
      {/* Agents carry roster art; the HUMAN side keeps its plain glyph box. */}
      {avatarImage
        ? <AgentAvatar agent={{ name, accent: accent ?? "#7c5cff", avatar, avatarImage }} className="mx-auto h-14 w-14" glyphClassName="text-xl" />
        : <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-xl" aria-hidden="true">{avatar}</div>}
      <div className="mt-3 font-display text-xl font-bold" style={{ color: accent }}>{name}</div>
      <div className="mt-1 text-xs text-white/40">{role}</div>
    </div>
  );
}

function BattleDatum({ label, value, accent = false, valueClass }: { label: string; value: string; accent?: boolean; valueClass?: string }) {
  return (
    <div className="min-w-0 bg-[#070a12] px-4 py-4 sm:px-5">
      <div className="terminal-label">{label}</div>
      <div className={cn("mono mt-1 truncate text-sm font-semibold text-white/75", accent && "text-aura-accent", valueClass)}>{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><div className="mono text-base font-bold">{value}</div><div className="terminal-label mt-1">{label}</div></div>;
}

function StatusBadge({ label, tone, pulse = false }: { label: string; tone: "positive" | "negative" | "warning" | "info" | "neutral"; pulse?: boolean }) {
  const classes = {
    positive: "border-aura-long/25 bg-aura-long/[0.08] text-aura-long",
    negative: "border-aura-short/25 bg-aura-short/[0.08] text-aura-short",
    warning: "border-aura-wait/25 bg-aura-wait/[0.08] text-aura-wait",
    info: "border-aura-quant/25 bg-aura-quant/[0.08] text-aura-quant",
    neutral: "border-white/[0.1] bg-white/[0.035] text-white/50",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold tracking-[0.13em]", classes[tone])}>
      {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}{label}
    </span>
  );
}
