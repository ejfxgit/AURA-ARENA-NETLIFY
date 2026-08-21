"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  AtSign,
  BadgeCheck,
  BarChart3,
  Bell,
  Bot,
  Camera,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Copy,
  ExternalLink,
  Gauge,
  Globe2,
  History,
  Info,
  LogOut,
  Network,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Target,
  Trash2,
  Trophy,
  Upload,
  UserRound,
  Wallet,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AGENT_LIST, getAgent } from "@/lib/agents";
import { getBattleAgent, type BattleAgentView } from "@/lib/battle-agents";
import { customAgentAccent } from "@/lib/custom-agents";
import {
  DECISION_BEHAVIORS,
  DEFAULT_STRATEGIES,
  LANGUAGE_OPTIONS,
  NOTIFICATION_TOGGLES,
  PROFILE_AVATAR_STYLES,
  RISK_PREFERENCES,
  TIMEZONE_OPTIONS,
  USERNAME_TAKEN_MESSAGE,
  normalizeUsername,
  profileAvatarAccent,
  usernameFormatIssue,
} from "@/lib/account";
import { api, ApiError } from "@/lib/client";
import {
  AURA_ECONOMY_EXPLANATION,
  AURA_RATE_LABEL,
  BATTLE_STAKE_DECIMALS,
  BATTLE_STAKE_PRESETS,
  DEFAULT_BATTLE_STAKE_AURA,
  MIN_BATTLE_STAKE_AURA,
  MIN_WITHDRAWAL_AURA,
  TESTNET_NOTICE,
  WITHDRAWAL_STATUS_META,
  auraToUsdt,
  battleStakeIssue,
  canRedeem,
  fmtAura,
  fmtUsdtTestnet,
  isInFlight,
  maxBattleStake,
  redeemableAura,
  withdrawalAmountIssue,
} from "@/lib/aura-economy";
import { MarketSelector } from "@/components/market-selector";
import { useLiveTickers } from "@/lib/market/use-live-market";
import { TokenIcon } from "@/components/ui/token-icon";
import type { NormalizedMarket } from "@/lib/market/okx-types";
import {
  PROFILE_AVATAR_ACCEPT,
  profileAvatarFileError,
} from "@/lib/profile-avatar";
import { removeProfileAvatar, uploadProfileAvatar } from "@/lib/supabase/avatar-storage";
import type {
  Agent,
  AgentDecisionState,
  AgentId,
  Battle,
  CustomAgent,
  CustomAgentAvatarStyle,
  DemoAccount,
  Direction,
  ProfileDraft,
  UserSettings,
  UserSettingsDraft,
  WalletProfile,
  Withdrawal,
} from "@/lib/types";
import {
  CANONICAL_DECISION_SYMBOL,
  formatDecisionAge,
} from "@/lib/agents/decisions";
import { BATTLE_DURATIONS_SECONDS, DEFAULT_BATTLE_DURATION_SECONDS } from "@/lib/battle/timing";
import { DEFAULT_LEVERAGE, SUPPORTED_LEVERAGES } from "@/lib/battle/leverage";
import { useWallet, XLAYER_TESTNET } from "@/lib/use-wallet";
import { cn, fmtCompact, fmtCompactOrNa, fmtPct, fmtPctOrNa, fmtPrice, fmtUsd, formatPair, pnlColor, pnlColorOrNa, shortHash } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DirectionBadge } from "@/components/ui/direction-badge";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
// Aliased: this file keeps two local sizing wrappers named AgentAvatar /
// BattleAgentAvatar, both of which delegate identity to the shared roster art.
import { AgentAvatar as AgentIdentityAvatar } from "@/components/ui/agent-avatar";
import { CustomAgents } from "@/components/custom-agents";

export type ArenaView =
  | "overview"
  | "arena"
  | "my-battles"
  | "my-agents"
  | "agents"
  | "performance"
  | "leaderboard"
  | "portfolio"
  | "withdraw"
  | "transactions"
  | "profile"
  | "proof"
  | "markets"
  | "settings";

interface HumanRank {
  userId: string;
  realized_pnl: number;
  wins: number;
  losses: number;
  win_rate: number;
  valid_challenges: number;
  reputation_score: number;
}

interface AgentRank extends Agent {
  challenge_success?: number;
  challenge_defense?: number;
}

interface ArenaData {
  battles: Battle[];
  customAgents: CustomAgent[];
  markets: NormalizedMarket[];
  humans: HumanRank[];
  agents: AgentRank[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const VIEW_META: Record<ArenaView, { eyebrow: string; title: string; subtitle: string }> = {
  overview: { eyebrow: "Command center", title: "Overview", subtitle: "Your capital, competition, and market intelligence at a glance." },
  arena: { eyebrow: "Battle lobby", title: "Enter the Arena", subtitle: "Configure a supported market battle against an AURA specialist." },
  "my-battles": { eyebrow: "Competition history", title: "My Battles", subtitle: "Track every live, settled, and verified battle owned by this wallet." },
  "my-agents": { eyebrow: "Personal intelligence", title: "My Agents", subtitle: "Your private custom agents. They belong to this wallet only and never appear on the public site." },
  agents: { eyebrow: "Intelligence roster", title: "Competitive Agents", subtitle: "Choose the specialist whose edge matches the market you want to challenge." },
  performance: { eyebrow: "Account analytics", title: "Performance", subtitle: "Inspect realized outcomes across time, agents, assets, and battle results." },
  leaderboard: { eyebrow: "Competitive rankings", title: "Leaderboard", subtitle: "Compare the current competitive record of AURA specialists and arena participants." },
  portfolio: { eyebrow: "Rewards and positions", title: "Portfolio", subtitle: "Monitor your AURA reward balance, simulated positions, and account performance." },
  withdraw: { eyebrow: "AURA redemption", title: "Withdraw", subtitle: "Redeem earned AURA for USDT on X Layer Testnet at a fixed 1,000 AURA = 1 USDT." },
  transactions: { eyebrow: "Account activity", title: "Transactions", subtitle: "Simulated AURA activity, real redemption payouts, and proof transactions stay clearly separated." },
  profile: { eyebrow: "Account identity", title: "Profile", subtitle: "The AURA identity bound to your authenticated wallet session." },
  proof: { eyebrow: "Verifiable history", title: "Battle Proof", subtitle: "Review settlement records and X Layer anchoring state without fabricated confirmations." },
  markets: { eyebrow: "Market intelligence", title: "Markets", subtitle: "Live OKX Exchange spot data. Unavailable values are shown as such, never estimated." },
  settings: { eyebrow: "Workspace controls", title: "Settings", subtitle: "Review the active product mode, network, and account session boundaries." },
};

const BATTLE_STATUS: Record<Battle["status"], { label: string; tone: string }> = {
  ACTIVE: { label: "Live", tone: "text-aura-long border-aura-long/25 bg-aura-long/[0.08]" },
  WAITING: { label: "Ready", tone: "text-aura-accent border-aura-accent/25 bg-aura-accent/[0.08]" },
  STARTING: { label: "Starting", tone: "text-aura-wait border-aura-wait/25 bg-aura-wait/[0.08]" },
  FINISHED: { label: "Finished", tone: "text-white/55 border-white/[0.1] bg-white/[0.03]" },
  SETTLING: { label: "Settling", tone: "text-aura-wait border-aura-wait/25 bg-aura-wait/[0.08]" },
  VERIFIED: { label: "Verified", tone: "text-aura-long border-aura-long/25 bg-aura-long/[0.08]" },
};

export function ArenaWorkspace({ view }: { view: ArenaView }) {
  const wallet = useWallet();
  const data = useArenaData();

  if (wallet.initializing) {
    return <WorkspaceLoading label="Restoring your AURA account" />;
  }

  if (!wallet.ready) {
    return <ProtectedWorkspace />;
  }

  const meta = VIEW_META[view];
  return (
    <div className="mx-auto min-w-0 w-full max-w-[1440px] px-3 py-4 sm:px-6 sm:py-7 xl:px-8">
      <div className="mb-6 flex flex-col gap-3 border-b border-white/[0.07] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em]">
            <span className="text-aura-accent">Demo trading</span>
            <span className="text-white/15">/</span>
            <span className="text-white/32">{meta.eyebrow}</span>
          </div>
          <h1 className="mt-1.5 font-display text-2xl font-bold text-white sm:text-[28px]">{meta.title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-white/42">{meta.subtitle}</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-[10px] font-semibold text-white/38 sm:inline-flex"><Network size={11} className="text-aura-long" /> X Layer Testnet</span>
      </div>

      {data.error && <InlineNotice tone="warning" icon={<Activity size={14} />}>{data.error}</InlineNotice>}
      {view === "overview" && <Overview data={data} />}
      {view === "arena" && <ArenaLobby data={data} />}
      {view === "my-battles" && <MyBattles data={data} />}
      {view === "my-agents" && <CustomAgents />}
      {view === "agents" && <AgentsView data={data} />}
      {view === "performance" && <Performance data={data} />}
      {view === "leaderboard" && <Leaderboard data={data} />}
      {view === "portfolio" && <Portfolio data={data} />}
      {view === "withdraw" && <Withdraw />}
      {view === "transactions" && <Transactions data={data} />}
      {view === "profile" && <Profile data={data} />}
      {view === "proof" && <Proof data={data} />}
      {view === "markets" && <Markets data={data} />}
      {view === "settings" && <SettingsView />}
    </div>
  );
}

function useArenaData(): ArenaData {
  const wallet = useWallet();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [markets, setMarkets] = useState<NormalizedMarket[]>([]);
  const [humans, setHumans] = useState<HumanRank[]>([]);
  const [agents, setAgents] = useState<AgentRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);

  useEffect(() => {
    if (!wallet.ready || !wallet.session) {
      setBattles([]);
      setCustomAgents([]);
      setMarkets([]);
      setHumans([]);
      setAgents([]);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      api<{ battles: Battle[] }>("/api/battles?scope=mine", { headers: { Authorization: `Bearer ${wallet.session.access_token}` } }),
      api<{ agents: CustomAgent[] }>("/api/custom-agents", { headers: { Authorization: `Bearer ${wallet.session.access_token}` } }),
      api<{ markets: NormalizedMarket[] }>("/api/markets?limit=60&sort=volume"),
      api<{ humans: HumanRank[]; agents: AgentRank[] }>("/api/leaderboard"),
    ]).then((results) => {
      if (!active) return;
      const [battleResult, customAgentResult, marketResult, rankResult] = results;
      if (battleResult.status === "fulfilled") setBattles(battleResult.value.battles);
      else setError(battleResult.reason instanceof Error ? battleResult.reason.message : "Unable to load battle history");
      if (customAgentResult.status === "fulfilled") setCustomAgents(customAgentResult.value.agents);
      if (marketResult.status === "fulfilled") setMarkets(marketResult.value.markets);
      else if (battleResult.status === "fulfilled") {
        setError(marketResult.reason instanceof Error ? marketResult.reason.message : "Unable to load market data");
      }
      if (rankResult.status === "fulfilled") {
        setHumans(rankResult.value.humans);
        setAgents(rankResult.value.agents);
      } else if (battleResult.status === "fulfilled" && marketResult.status === "fulfilled") {
        setError(rankResult.reason instanceof Error ? rankResult.reason.message : "Unable to load leaderboard data");
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [refreshKey, wallet.ready, wallet.session]);

  return { battles, customAgents, markets, humans, agents, loading, error, refresh };
}

function Overview({ data }: { data: ArenaData }) {
  const wallet = useWallet();
  const account = wallet.account!;
  const active = data.battles.find((battle) => !["FINISHED", "VERIFIED"].includes(battle.status));
  const completed = data.battles.filter((battle) => ["FINISHED", "VERIFIED"].includes(battle.status));
  const openBattles = data.battles.filter((battle) => !["FINISHED", "VERIFIED"].includes(battle.status));
  const locked = openBattles.reduce((sum, battle) => sum + (battle.stake_reserved ? battle.human_amount : 0), 0);
  const openPnl = openBattles.reduce((sum, battle) => sum + battle.human_pnl, 0);
  const available = account.current_balance;
  const equity = account.current_balance + locked + openPnl;
  const today = todayPnl(completed);
  const latestAgentBattle = active ?? data.battles[0] ?? null;
  const competitiveAgent = latestAgentBattle ? getBattleAgent(latestAgentBattle) : null;
  const competitiveStats = competitiveAgent && !competitiveAgent.isCustom ? data.agents.find((agent) => agent.id === competitiveAgent.id) : null;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Welcome back";

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.72fr)]">
        <div className="relative overflow-hidden rounded-lg border border-white/[0.09] bg-[#0a0d18] p-5 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-aura-accent via-aura-long/50 to-transparent" />
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs text-white/38">{greeting},</div>
              <div className="mt-1 font-display text-xl font-bold text-white">{wallet.profile?.displayName}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-white/32"><span>{shortHash(wallet.address, 6)}</span><span className="text-white/15">/</span><span className="text-aura-long/75">Connected</span></div>
            </div>
            <div className="sm:text-right">
              <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/38">Available AURA balance</div>
              <div className="mt-1 font-mono text-3xl font-bold text-white sm:text-4xl">{fmtAura(available, { unit: false })} <span className="text-xl text-aura-accent sm:text-2xl">AURA</span></div>
              <div className="mt-1 text-xs text-white/35">≈ {fmtUsdtTestnet(auraToUsdt(redeemableAura(available)))} redeemable · <span className="text-aura-wait">{TESTNET_NOTICE}</span></div>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            <LinkButton href="/arena/battles" icon={<Swords size={14} />}>Enter Arena</LinkButton>
            <LinkButton href="/arena/withdraw" variant="secondary" icon={<ArrowDownLeft size={14} />}>Withdraw</LinkButton>
          </div>
        </div>

        <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018]">
          <MiniStat label="AURA equity" value={fmtAura(equity)} icon={<WalletCards size={14} />} />
          <MiniStat label="Today’s AURA P&L" value={fmtAura(today, { sign: true })} tone={pnlColor(today)} icon={<BarChart3 size={14} />} />
           <MiniStat label="Unrealized AURA P&L" value={fmtAura(openPnl, { sign: true })} tone={pnlColor(openPnl)} icon={<Activity size={14} />} />
          <MiniStat label="Open positions" value={String(openBattles.length)} icon={<Swords size={14} />} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]">
        <Panel title="Current battle" icon={<Radio size={14} />} action={active ? <Link href={`/arena/${active.id}`} className="text-xs font-semibold text-aura-accent hover:text-white">View battle</Link> : undefined}>
          {active ? <CurrentBattle battle={active} /> : <EmptyState icon={<Swords size={18} />} title="No active battle" detail="Configure a supported market and challenge an AURA specialist." action={<LinkButton href="/arena/battles" size="sm">Enter Arena</LinkButton>} />}
        </Panel>

        <Panel title="Recent agent" icon={<Bot size={14} />}>
          {competitiveAgent ? <>
            <div className="flex items-start gap-3">
              <BattleAgentAvatar agent={competitiveAgent} />
              <div className="min-w-0 flex-1"><div className="font-display text-base font-bold" style={{ color: competitiveAgent.accent }}>{competitiveAgent.name}</div><div className="mt-0.5 text-[10px] uppercase tracking-[0.1em] text-white/35">{competitiveAgent.role}</div><p className="mt-3 text-xs leading-5 text-white/42">{competitiveAgent.specialty}</p></div>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-3"><CompactMetric label="Confidence" value={latestAgentBattle ? `${latestAgentBattle.thesis.confidence}%` : "-"} /><CompactMetric label="Win rate" value={competitiveStats?.wins || competitiveStats?.losses ? `${competitiveStats.win_rate}%` : "-"} /><CompactMetric label="Battles" value={competitiveStats?.wins || competitiveStats?.losses ? competitiveStats.wins + competitiveStats.losses : "-"} /></div>
          </> : <EmptyState icon={<Bot size={18} />} title="No agent deployed yet" detail="Choose a specialist when you create your first battle." />}
          <Link href="/arena/agents" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-aura-accent hover:text-white">Browse agents <ArrowRight size={13} /></Link>
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.72fr)]">
        <Panel title="Recent battles" icon={<History size={14} />} action={<Link href="/arena/my-battles" className="text-xs font-semibold text-white/42 hover:text-white">View all</Link>} noPadding>
          <BattleTable battles={data.battles.slice(0, 5)} loading={data.loading} compact />
        </Panel>
        <Panel title="Market pulse" icon={<Activity size={14} />} action={<Link href="/arena/markets" className="text-xs font-semibold text-white/42 hover:text-white">All markets</Link>} noPadding>
          {data.markets.length ? data.markets.slice(0, 4).map((market) => <MarketRow key={market.symbol} market={market} />) : <EmptyRows label="Market feed unavailable" />}
        </Panel>
      </section>
    </div>
  );
}

function ArenaLobby({ data }: { data: ArenaData }) {
  const wallet = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAgent = searchParams.get("agent");
  // Empty until the market registry supplies a default (highest-volume listed
  // market). No symbol is hardcoded here.
  const [symbol, setSymbol] = useState("");
  const [agentKey, setAgentKey] = useState(requestedAgent && AGENT_LIST.some((agent) => agent.id === requestedAgent) ? requestedAgent : "volt");
  const [direction, setDirection] = useState<Direction>("LONG");
  // The stake is held as the typed text so a custom amount can be entered
  // freely; `amount` is the parsed value and battleStakeIssue() is the single
  // rule that decides whether it may fund a battle. The server applies the same
  // function to its own balance read, which is the authoritative verdict.
  const [stakeText, setStakeText] = useState(String(DEFAULT_BATTLE_STAKE_AURA));
  const [durationSeconds, setDurationSeconds] = useState(DEFAULT_BATTLE_DURATION_SECONDS);
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const active = data.battles.filter((battle) => ["ACTIVE", "WAITING", "STARTING", "SETTLING"].includes(battle.status));
  const completed = data.battles.filter((battle) => ["FINISHED", "VERIFIED"].includes(battle.status));
  useEffect(() => {
    if (!requestedAgent?.startsWith("custom:")) return;
    const customId = requestedAgent.slice("custom:".length);
    if (data.customAgents.some((agent) => agent.id === customId)) setAgentKey(requestedAgent);
  }, [data.customAgents, requestedAgent]);

  const customAgentId = agentKey.startsWith("custom:") ? agentKey.slice("custom:".length) : null;
  const selectedCustomAgent = customAgentId ? data.customAgents.find((agent) => agent.id === customAgentId) ?? null : null;
  const builtInAgent = selectedCustomAgent ? null : getAgent(agentKey as AgentId);
  const selectedAgentName = selectedCustomAgent?.name ?? builtInAgent?.name ?? "VOLT";

  const availableAura = wallet.account?.current_balance ?? 0;
  const amount = Number.parseFloat(stakeText);
  const stakeIssue = battleStakeIssue(amount, availableAura);
  // Exposure is only meaningful for a stake that could actually be committed.
  const exposureStake = stakeIssue === null ? amount : 0;
  const maxStake = maxBattleStake(availableAura);

  const createBattle = async () => {
    if (!wallet.ready) return wallet.openConnect();
    if (stakeIssue) return setCreateError(stakeIssue);
    setCreating(true);
    setCreateError(null);
    try {
      const result = await api<{ battle: Battle }>("/api/battles", {
        method: "POST",
        body: selectedCustomAgent
          ? { customAgentId: selectedCustomAgent.id, symbol, human_direction: direction, human_amount: amount, duration_seconds: durationSeconds, leverage }
          : { agentId: builtInAgent?.id ?? "volt", symbol, human_direction: direction, human_amount: amount, duration_seconds: durationSeconds, leverage },
      });
      router.push(`/arena/${result.battle.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create battle");
      setCreating(false);
    }
  };

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Panel title="Battle configuration" icon={<SlidersHorizontal size={14} />} className="h-fit w-full max-w-full xl:sticky xl:top-[78px]">
        <FieldLabel label="Market" value={formatPair(symbol)} />
        {/* Every live OKX spot market, from the real instrument catalogue. */}
        <MarketSelector value={symbol} onChange={setSymbol} />
        <FieldLabel label="Competitive agent" value={selectedAgentName} className="mt-5" />
        <div className="grid grid-cols-2 gap-2 min-[390px]:grid-cols-3">{AGENT_LIST.map((item) => <button key={item.id} type="button" title={item.name} onClick={() => setAgentKey(item.id)} className={cn("focus-ring flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-md border px-1.5 text-xs font-bold", agentKey === item.id ? "border-aura-accent/45 bg-aura-accent/[0.1]" : "border-white/[0.08] bg-white/[0.02] text-white/42 hover:text-white")} style={agentKey === item.id ? { color: item.accent } : undefined}><AgentIdentityAvatar agent={item} className="h-6 w-6 rounded-[5px]" glyphClassName="text-[9px]" /><span className="min-w-0 truncate">{item.name}</span></button>)}</div>
        {data.customAgents.length > 0 && <div className="mt-4 border-t border-white/[0.07] pt-4"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-aura-accent">Your custom agents</span><span className="text-[9px] uppercase tracking-[0.12em] text-white/25">Private</span></div><div className="grid grid-cols-2 gap-2">{data.customAgents.map((item) => { const key = `custom:${item.id}`; const activeAgent = agentKey === key; return <button key={item.id} type="button" title={`${item.name} / custom private agent`} onClick={() => setAgentKey(key)} className={cn("focus-ring min-h-11 rounded-md border px-2 py-2 text-left", activeAgent ? "border-aura-accent/45 bg-aura-accent/[0.1]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]")}><span className="block truncate text-xs font-bold" style={{ color: customAgentAccent(item.avatarStyle) }}>{item.name}</span><span className="mt-0.5 block text-[8px] font-bold uppercase tracking-[0.1em] text-white/28">Custom / private</span></button>; })}</div></div>}
        <FieldLabel label="Your position" value={direction} className="mt-5" />
        <div className="grid grid-cols-3 gap-2">{(["LONG", "SHORT", "WAIT"] as Direction[]).map((value) => <Segment key={value} active={direction === value} onClick={() => setDirection(value)} tone={value}>{value}</Segment>)}</div>
        <FieldLabel label="Leverage" value={`${leverage}x`} className="mt-5" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{SUPPORTED_LEVERAGES.map((value) => <Segment key={value} active={leverage === value} onClick={() => setLeverage(value)}>{value}x</Segment>)}</div>
        <FieldLabel label="AURA stake" value={`Available ${fmtAura(availableAura)}`} className="mt-5" />
        {/* Presets are shortcuts only — any amount clearing battleStakeIssue() is valid. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{BATTLE_STAKE_PRESETS.map((value) => <Segment key={value} active={amount === value} onClick={() => setStakeText(String(value))}>{value} AURA</Segment>)}</div>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-white/[0.09] bg-[#070a12] px-3">
          <input
            value={stakeText}
            onChange={(event) => setStakeText(sanitizeStakeInput(event.target.value))}
            inputMode="decimal"
            aria-label="Custom AURA stake"
            aria-invalid={stakeIssue !== null}
            placeholder={String(MIN_BATTLE_STAKE_AURA)}
            className="h-11 min-w-0 flex-1 bg-transparent font-mono text-base font-semibold text-white outline-none placeholder:text-white/25"
          />
          <span className="shrink-0 text-xs font-bold tracking-[0.12em] text-aura-accent">AURA</span>
          <Segment compact active={maxStake > 0 && amount === maxStake} onClick={() => setStakeText(String(maxStake))}>Max</Segment>
        </div>
        {stakeIssue && <div className="mt-2 text-[11px] leading-4 text-aura-short">{stakeIssue}</div>}
        <FieldLabel label="Battle duration" value={`${durationSeconds / 60} MIN`} className="mt-5" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{BATTLE_DURATIONS_SECONDS.map((value) => <Segment key={value} active={durationSeconds === value} onClick={() => setDurationSeconds(value)}>{value / 60} MIN</Segment>)}</div>
        <div className="mt-4 rounded-md border border-white/[0.07] bg-black/20 px-3 py-2.5 text-xs"><div className="flex items-center justify-between"><span className="text-white/38">Position exposure</span><span className="font-mono font-semibold text-white/75">{fmtAura(exposureStake * leverage)}</span></div><div className="mt-1 text-[10px] leading-4 text-white/28">A 1% favorable move estimates {fmtAura(exposureStake * leverage * 0.01, { sign: true })}. Maximum loss is capped at the stake.</div></div>
        <div className="mt-4 flex items-center justify-between rounded-md border border-white/[0.07] bg-black/20 px-3 py-2.5 text-xs"><span className="text-white/38">Available AURA</span><span className="font-mono font-semibold text-white/75">{fmtAura(availableAura)}</span></div>
        {createError && <div className="mt-3 text-xs leading-5 text-aura-short">{createError}</div>}
        <Button className="mt-4 w-full" onClick={() => void createBattle()} disabled={creating || !symbol || stakeIssue !== null}>{creating ? <RefreshCw size={14} className="animate-spin" /> : <Swords size={14} />}{creating ? "Creating battle" : "Enter battle"}</Button>
        <p className="mt-3 text-center text-[10px] leading-4 text-white/28">Simulated execution using live market inputs. No on-chain funds are transferred.</p>
      </Panel>

      <div className="min-w-0 space-y-5">
        <LobbySection title="Live" count={active.length} tone="live" battles={active} loading={data.loading} empty="No live battles for this account." />
        <LobbySection title="Upcoming" count={0} battles={[]} empty="Scheduled matchmaking is not exposed by the current backend." />
        <LobbySection title="Completed" count={completed.length} battles={completed.slice(0, 6)} empty="Completed battles will appear here." />
      </div>
    </div>
  );
}

function MyBattles({ data }: { data: ArenaData }) {
  const [filter, setFilter] = useState<"All" | "Live" | "Won" | "Lost" | "Completed">("All");
  const visible = useMemo(() => data.battles.filter((battle) => {
    if (filter === "Live") return !["FINISHED", "VERIFIED"].includes(battle.status);
    if (filter === "Won") return battle.winner === "HUMAN";
    if (filter === "Lost") return battle.winner === "AI";
    if (filter === "Completed") return ["FINISHED", "VERIFIED"].includes(battle.status);
    return true;
  }), [data.battles, filter]);
  return <div><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1 rounded-md border border-white/[0.07] bg-white/[0.018] p-1">{(["All", "Live", "Won", "Lost", "Completed"] as const).map((value) => <Segment key={value} active={filter === value} onClick={() => setFilter(value)} compact>{value}</Segment>)}</div><LinkButton href="/arena/battles" size="sm" icon={<Swords size={13} />}>New battle</LinkButton></div><Panel title={`${filter} battles`} icon={<History size={14} />} noPadding><BattleTable battles={visible} loading={data.loading} /></Panel></div>;
}

/**
 * The canonical agent decisions for the roster cards.
 *
 * Reads are free (one query, no model requests), so they poll. A refresh — the
 * only call that can bill a model request — is issued once per mount and only
 * when something is actually missing or stale, never on a timer.
 *
 * Nothing is computed here. The states rendered are exactly what the backend
 * persisted, so a card cannot show a decision the battle route would disagree
 * with.
 */
function useAgentDecisions(ready: boolean) {
  const [decisions, setDecisions] = useState<Record<string, AgentDecisionState>>({});
  const [symbol, setSymbol] = useState(CANONICAL_DECISION_SYMBOL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshed = useRef(false);

  const load = useCallback(async () => {
    const response = await api<{
      symbol: string;
      decisions: Record<string, AgentDecisionState>;
    }>("/api/agents/decisions");
    setSymbol(response.symbol);
    setDecisions(response.decisions);
    return response.decisions;
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const run = async () => {
      try {
        const current = await load();
        if (cancelled) return;
        setError(null);
        // Fill gaps once per mount. Agents already inside their TTL are not
        // re-requested by the server, so this is cheap when nothing is stale.
        const needsRefresh = Object.values(current).some((state) => state.status !== "ready");
        if (needsRefresh && !refreshed.current) {
          refreshed.current = true;
          const refreshedResponse = await api<{
            symbol: string;
            decisions: Record<string, AgentDecisionState>;
          }>("/api/agents/decisions", { method: "POST", body: {} });
          if (!cancelled) setDecisions(refreshedResponse.decisions);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to read agent decisions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    const poll = setInterval(() => void load().catch(() => undefined), 60_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [load, ready]);

  return { decisions, symbol, loading, error };
}

function AgentsView({ data }: { data: ArenaData }) {
  const wallet = useWallet();
  const { decisions, symbol: decisionSymbol, loading: decisionsLoading, error: decisionsError } =
    useAgentDecisions(wallet.ready);
  const lastBattle = data.battles[0] ?? null;
  const lastAgent = lastBattle ? getBattleAgent(lastBattle) : null;
  const lastAgentBattles = lastBattle ? data.battles.filter((battle) => battle.agentId === lastBattle.agentId && battle.customAgentId === lastBattle.customAgentId) : [];
  const settledAgentBattles = lastAgentBattles.filter((battle) => ["FINISHED", "VERIFIED"].includes(battle.status));
  const agentWins = settledAgentBattles.filter((battle) => battle.winner === "HUMAN").length;
  return (
    <div className="space-y-5">
      <Panel title="Recent deployment" icon={<Sparkles size={14} />}>
        {lastAgent && lastBattle ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-start gap-4"><BattleAgentAvatar agent={lastAgent} large /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold" style={{ color: lastAgent.accent }}>{lastAgent.name}</h2><span className="rounded-full border border-aura-long/20 bg-aura-long/[0.07] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-aura-long">Last deployed</span>{lastAgent.isCustom && <span className="rounded-full border border-aura-accent/25 bg-aura-accent/[0.08] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-aura-accent">Custom / private</span>}</div><div className="mt-1 text-xs uppercase tracking-[0.12em] text-white/35">{lastAgent.role}</div><p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">{lastAgent.strategy}. {lastAgent.description}</p></div></div>
          <div className="grid grid-cols-3 gap-5 lg:min-w-[320px]"><CompactMetric label="Win rate" value={settledAgentBattles.length ? `${((agentWins / settledAgentBattles.length) * 100).toFixed(1)}%` : "-"} /><CompactMetric label="Entry confidence" value={`${lastBattle.thesis.confidence}%`} /><CompactMetric label="Battles" value={lastAgentBattles.length} /></div>
        </div> : <EmptyState icon={<Bot size={18} />} title="No agent history" detail="Select a specialist in the Arena to create your first recorded deployment." action={<LinkButton href="/arena/battles" size="sm">Choose an agent</LinkButton>} />}
      </Panel>
      <div>
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-white/78">Available agents</h2><p className="mt-1 text-xs text-white/35">Canonical AURA roster. Each agent&apos;s current decision on {formatPair(decisionSymbol)}. Performance appears only after recorded battles.</p></div></div>
        {decisionsError && <div className="mb-3 text-[11px] leading-4 text-aura-short">{decisionsError}</div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(data.agents.length ? data.agents : AGENT_LIST).map((agent) => <AgentCard key={agent.id} agent={agent} decision={decisions[agent.id]} loading={decisionsLoading} />)}</div>
      </div>
    </div>
  );
}

function Performance({ data }: { data: ArenaData }) {
  const account = useWallet().account!;
  const [range, setRange] = useState<"7D" | "30D" | "ALL">("ALL");
  const settled = useMemo(() => data.battles.filter((battle) => ["FINISHED", "VERIFIED"].includes(battle.status)), [data.battles]);
  const visible = useMemo(() => {
    if (range === "ALL") return settled;
    const days = range === "7D" ? 7 : 30;
    const cutoff = Date.now() - days * 86400000;
    return settled.filter((battle) => new Date(battle.ended_at || battle.createdAt).getTime() >= cutoff);
  }, [range, settled]);
  const decided = account.wins + account.losses;
  const averageReturn = visible.length ? visible.reduce((sum, battle) => sum + returnPct(battle), 0) / visible.length : 0;
  const chart = cumulativePnl(visible);
  const byAgent = groupPerformance(visible, (battle) => getBattleAgent(battle).name);
  const byAsset = groupPerformance(visible, (battle) => battle.asset);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricCard label="Total AURA P&L" value={fmtAura(account.realized_pnl, { sign: true })} tone={pnlColor(account.realized_pnl)} icon={<CircleDollarSign size={15} />} /><MetricCard label="Win rate" value={`${decided ? ((account.wins / decided) * 100).toFixed(1) : "0.0"}%`} icon={<Target size={15} />} /><MetricCard label="Total battles" value={String(account.total_battles)} icon={<Swords size={15} />} /><MetricCard label="Average return" value={fmtPct(averageReturn)} tone={pnlColor(averageReturn)} icon={<Gauge size={15} />} /></div>
      <Panel title="Realized performance" icon={<BarChart3 size={14} />} action={<div className="flex gap-1">{(["7D", "30D", "ALL"] as const).map((value) => <Segment key={value} active={range === value} onClick={() => setRange(value)} compact>{value}</Segment>)}</div>}>
        {chart.length ? <PerformanceChart data={chart} /> : <EmptyState icon={<BarChart3 size={18} />} title="No settled performance yet" detail="The chart is generated only from this account’s completed battle outcomes." />}
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2"><PerformanceBreakdown title="Agent performance" rows={byAgent} /><PerformanceBreakdown title="Asset performance" rows={byAsset} /></div>
      <Panel title="Win / loss history" icon={<History size={14} />} noPadding><BattleTable battles={visible} loading={data.loading} compact /></Panel>
    </div>
  );
}

function Leaderboard({ data }: { data: ArenaData }) {
  const [tab, setTab] = useState<"Agents" | "Players">("Agents");
  const wallet = useWallet();
  const rankedAgents = data.agents.filter((agent) => agent.wins + agent.losses > 0);
  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-md border border-white/[0.07] bg-white/[0.018] p-1 w-fit"><Segment active={tab === "Agents"} onClick={() => setTab("Agents")} compact>Agents</Segment><Segment active={tab === "Players"} onClick={() => setTab("Players")} compact>Players</Segment></div>
      <Panel title={`${tab} ranking`} icon={<Trophy size={14} />} noPadding>
        <div className="overflow-x-auto"><div className="min-w-[720px]"><div className="grid grid-cols-[56px_minmax(180px,1.6fr)_repeat(4,1fr)] gap-3 border-b border-white/[0.07] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28"><span>Rank</span><span>Competitor</span><span className="text-right">Battles</span><span className="text-right">Wins</span><span className="text-right">Win rate</span><span className="text-right">Reputation</span></div>
        {tab === "Agents" ? rankedAgents.length ? rankedAgents.map((agent, index) => <div key={agent.id} className="grid grid-cols-[56px_minmax(180px,1.6fr)_repeat(4,1fr)] items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-0"><Rank index={index} /><div className="flex items-center gap-3"><AgentAvatar agent={agent} small /><div><div className="text-sm font-semibold" style={{ color: agent.accent }}>{agent.name}</div><div className="text-[10px] text-white/30">{agent.role}</div></div></div><TableNumber>{agent.wins + agent.losses}</TableNumber><TableNumber>{agent.wins}</TableNumber><TableNumber>{agent.win_rate}%</TableNumber><TableNumber strong>{agent.reputation_score}</TableNumber></div>) : <EmptyRows label="No agent rankings yet. Complete a battle to generate recorded performance." /> : data.humans.length ? data.humans.map((human, index) => { const mine = human.userId.endsWith(wallet.profile!.id.slice(-8)); return <div key={human.userId} className={cn("grid grid-cols-[56px_minmax(180px,1.6fr)_repeat(4,1fr)] items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-0", mine && "bg-aura-accent/[0.06]")}><Rank index={index} /><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025]"><UserRound size={14} /></span><div><div className="text-sm font-semibold text-white/75">{mine ? wallet.profile?.displayName : human.userId}</div><div className="text-[10px] text-white/30">{mine ? "You" : "Arena player"}</div></div></div><TableNumber>{human.wins + human.losses}</TableNumber><TableNumber>{human.wins}</TableNumber><TableNumber>{human.win_rate}%</TableNumber><TableNumber strong>{human.reputation_score}</TableNumber></div>; }) : <EmptyRows label="No ranked players yet" />}</div></div>
      </Panel>
    </div>
  );
}

function Portfolio({ data }: { data: ArenaData }) {
  const account = useWallet().account!;
  const openPositions = data.battles.filter((battle) => ["ACTIVE", "SETTLING"].includes(battle.status));
  const locked = openPositions.reduce((sum, battle) => sum + (battle.stake_reserved ? battle.human_amount : 0), 0);
  const openPnl = openPositions.reduce((sum, battle) => sum + battle.human_pnl, 0);
  const available = account.current_balance;
  const equity = account.current_balance + locked + openPnl;
  const completed = data.battles.filter((battle) => ["FINISHED", "VERIFIED"].includes(battle.status));
  const allocation = [...openPositions.reduce((groups, battle) => {
    if (battle.stake_reserved) groups.set(battle.asset, (groups.get(battle.asset) || 0) + battle.human_amount);
    return groups;
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#080b14]">
        <div className="flex flex-col gap-5 border-b border-white/[0.07] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/32">Available AURA balance</div>
            <div className="mt-2 font-mono text-3xl font-bold text-white sm:text-4xl">{fmtAura(available)}</div>
            <div className="mt-2 text-xs text-white/35">Demo reward balance for simulated execution · USDT Testnet redemption shown separately</div>
          </div>
          <div className="flex flex-wrap gap-2"><LinkButton href="/arena/battles" icon={<Swords size={13} />}>Enter Arena</LinkButton><LinkButton href="/arena/withdraw" variant="secondary" icon={<ArrowDownLeft size={13} />}>Withdraw</LinkButton></div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-3 xl:grid-cols-5">
          <MiniStat label="AURA equity" value={fmtAura(equity)} />
          <MiniStat label="Today's AURA P&L" value={fmtAura(todayPnl(completed), { sign: true })} tone={pnlColor(todayPnl(completed))} />
          <MiniStat label="Unrealized AURA P&L" value={fmtAura(openPnl, { sign: true })} tone={pnlColor(openPnl)} />
          <MiniStat label="AURA in battles" value={fmtAura(locked)} />
          <MiniStat label="Open positions" value={String(openPositions.length)} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <Panel title="Open positions" icon={<Activity size={14} />} noPadding>
          <PositionTable battles={openPositions} loading={data.loading} />
        </Panel>
        <Panel title="Asset allocation" icon={<CircleDollarSign size={14} />}>
          {allocation.length ? <div className="space-y-4">{allocation.map(([asset, value]) => <div key={asset}><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-white/60">{formatPair(asset)}</span><span className="font-mono text-xs text-white/65">{fmtAura(value)}</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-aura-accent" style={{ width: `${locked ? (value / locked) * 100 : 0}%` }} /></div></div>)}</div> : <EmptyState icon={<CircleDollarSign size={18} />} title="No asset allocation" detail="AURA allocation appears here when you have an active battle position." />}
        </Panel>
      </div>

      <Panel title="Recent execution activity" icon={<History size={14} />} noPadding><ActivityTable battles={data.battles} loading={data.loading} /></Panel>
      <InlineNotice tone="neutral" icon={<Info size={14} />}>Demo capital and simulated positions are internal account records. They are separate from any real assets held by the connected wallet.</InlineNotice>
    </div>
  );
}

/**
 * Payload of GET /api/wallet/withdrawals. `treasury.configured` is false when the
 * deployment has no server-side treasury, and the UI then says so instead of
 * offering a button that cannot pay out.
 */
interface WithdrawalsPayload {
  walletAddress: string;
  withdrawals: Withdrawal[];
  account: DemoAccount | null;
  economy: { auraPerUsdt: number; minimumAura: number; chainId: number };
  treasury: { configured: boolean; error: string | null };
}

/**
 * Loads the caller's persisted redemption records.
 *
 * Every value comes from Supabase through the API: there is no client-side
 * withdrawal state, so a refresh or a server restart shows the same history. The
 * GET also reconciles any broadcast-but-unconfirmed payout, which is why the
 * Withdraw and Transactions views both read through this hook.
 */
function useWithdrawals() {
  const wallet = useWallet();
  const session = wallet.session;
  const [data, setData] = useState<WithdrawalsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api<WithdrawalsPayload>("/api/wallet/withdrawals", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      setData(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load withdrawals");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  return { data, loading, error, reload: load };
}

/**
 * AURA -> USDT (X Layer Testnet) redemption.
 *
 * The balance shown here is the persisted AURA balance that battle settlements
 * credit. Submitting posts an amount only: the destination is the authenticated
 * session wallet, the USDT value is recomputed server-side from the debited AURA,
 * and the treasury signs the transfer on the server. Nothing about a payout is
 * decided or displayed as done in the browser — a completed row always carries
 * the real transaction hash.
 */
function Withdraw() {
  const wallet = useWallet();
  const balance = wallet.account?.current_balance ?? 0;
  const redeemable = redeemableAura(balance);
  const { data, loading, error: loadError, reload } = useWithdrawals();
  const [amountText, setAmountText] = useState(String(MIN_WITHDRAWAL_AURA));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const amount = Number.parseInt(amountText, 10);
  const requested = Number.isFinite(amount) ? amount : 0;
  const usdt = auraToUsdt(requested);
  const amountIssue = withdrawalAmountIssue(requested, balance);
  const inFlight = data?.withdrawals.find((row) => isInFlight(row.status)) ?? null;
  const treasuryError = data?.treasury.configured === false ? data.treasury.error : null;
  const openRealTrading = () => window.dispatchEvent(new Event("aura:open-real-mode"));

  const blocked = Boolean(
    treasuryError || inFlight || amountIssue || !wallet.address || !wallet.isXLayerTestnet,
  );

  const submit = useCallback(async () => {
    if (!wallet.session || !wallet.address) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<{ withdrawal: Withdrawal; warning?: string }>("/api/wallet/withdrawals", {
        method: "POST",
        headers: { Authorization: `Bearer ${wallet.session.access_token}` },
        body: { auraAmount: requested, destinationAddress: wallet.address },
      });
      setConfirming(false);
      setToast({
        tone: "success",
        message: result.warning
          ?? `${fmtAura(result.withdrawal.auraAmount)} redeemed for ${fmtUsdtTestnet(result.withdrawal.usdtAmount)} on X Layer Testnet`,
      });
    } catch (requestError) {
      const message = requestError instanceof ApiError
        ? requestError.message
        : requestError instanceof Error
          ? requestError.message
          : "Unable to submit this withdrawal";
      setSubmitError(message);
      setConfirming(false);
      setToast({ tone: "error", message });
    } finally {
      // The record and the balance are both persisted server-side, so the UI is
      // re-read rather than patched locally — including after a failure, where
      // the reserved AURA has been restored.
      await wallet.refreshAccount();
      await reload();
      setSubmitting(false);
    }
  }, [reload, requested, wallet]);

  return (
    <div className="space-y-5">
      {toast && <Toast tone={toast.tone} message={toast.message} onDone={() => setToast(null)} />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.55fr)]">
        <section className="overflow-hidden rounded-lg border border-white/[0.09] bg-[#080b14]">
          <div className="border-b border-white/[0.07] p-5 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold uppercase tracking-[0.18em] text-white/32">
              <span className="inline-flex items-center gap-1.5"><ArrowDownLeft size={13} /> Redeem AURA</span>
              <span className="text-white/15">/</span>
              <span className="text-aura-wait">{TESTNET_NOTICE}</span>
            </div>
            <h2 className="mt-4 max-w-xl font-display text-2xl font-bold text-white sm:text-3xl">Redeem AURA for USDT on X Layer Testnet.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">{AURA_ECONOMY_EXPLANATION}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-aura-accent/25 bg-aura-accent/[0.08] px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] text-aura-accent"><Coins size={11} /> {AURA_RATE_LABEL}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.025] px-2.5 py-1 text-[10px] font-semibold tracking-[0.1em] text-white/45"><Network size={11} className="text-aura-long" /> {XLAYER_TESTNET.name}</span>
            </div>
          </div>
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="AURA balance" value={fmtAura(balance)} icon={<Coins size={13} />} />
            <MiniStat label="Redemption value" value={fmtUsdtTestnet(auraToUsdt(redeemable))} tone="text-aura-long" />
            <MiniStat label="Minimum" value={fmtAura(MIN_WITHDRAWAL_AURA)} />
            <MiniStat label="Lifetime redeemed" value={fmtAura(wallet.account?.aura_withdrawn_total ?? 0)} />
          </div>
        </section>

        <Panel title="Redemption terms" icon={<ShieldCheck size={14} />}>
          <div className="space-y-4">
            <BalanceLine label="Rate" value="1,000 AURA = 1 USDT" tone="text-white/65" />
            <BalanceLine label="Minimum" value={fmtAura(MIN_WITHDRAWAL_AURA)} tone="text-white/65" />
            <BalanceLine label="Token" value="USDT (Testnet)" tone="text-white/65" />
            <BalanceLine label="Network" value={`${XLAYER_TESTNET.name} / ${data?.economy.chainId ?? XLAYER_TESTNET.chainId}`} tone="text-white/65" />
            <BalanceLine label="Destination" value={wallet.address ? shortHash(wallet.address, 6) : "Not connected"} tone="text-white/65" />
          </div>
          <p className="mt-5 border-t border-white/[0.07] pt-4 text-[10px] leading-4 text-white/28">
            Payouts are signed by the AURA treasury on the server and sent to the wallet this account is registered to. Testnet USDT is a test asset and has no monetary value.
          </p>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.55fr)]">
        <Panel title="Withdraw AURA" icon={<ArrowDownLeft size={14} />}>
          {loading && !data ? (
            <SettingsSkeleton rows={4} />
          ) : (
            <div className="space-y-5">
              {treasuryError && <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{treasuryError}</InlineNotice>}
              {loadError && <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{loadError}</InlineNotice>}
              {inFlight && (
                <InlineNotice tone="warning" icon={<Clock3 size={14} />}>
                  A withdrawal of {fmtAura(inFlight.auraAmount)} is {WITHDRAWAL_STATUS_META[inFlight.status].label.toLowerCase()}. Only one withdrawal runs at a time.
                </InlineNotice>
              )}

              <div>
                <FieldLabel label="Amount to redeem" value={`Available ${fmtAura(redeemable)}`} />
                <div className="grid grid-cols-4 gap-2">
                  {[1000, 5000, 10000].map((preset) => (
                    <Segment key={preset} active={requested === preset} onClick={() => setAmountText(String(preset))}>{preset.toLocaleString("en-US")}</Segment>
                  ))}
                  <Segment active={requested === redeemable && redeemable > 0} onClick={() => setAmountText(String(redeemable))}>Max</Segment>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-md border border-white/[0.09] bg-[#070a12] px-3">
                  <input
                    value={amountText}
                    onChange={(event) => setAmountText(event.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    aria-label="AURA amount to redeem"
                    placeholder={String(MIN_WITHDRAWAL_AURA)}
                    className="h-11 w-full bg-transparent font-mono text-base font-semibold text-white outline-none placeholder:text-white/25"
                  />
                  <span className="shrink-0 text-xs font-bold tracking-[0.12em] text-aura-accent">AURA</span>
                </div>
              </div>

              <div className="grid gap-px overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
                <div className="bg-[#080b14] p-4">
                  <div className="field-label">You redeem</div>
                  <div className="mt-1.5 font-mono text-lg font-bold text-white">{fmtAura(requested)}</div>
                </div>
                <div className="bg-[#080b14] p-4">
                  <div className="field-label">You receive</div>
                  <div className="mt-1.5 font-mono text-lg font-bold text-aura-long">{fmtUsdtTestnet(usdt)}</div>
                  <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.14em] text-aura-wait">{TESTNET_NOTICE}</div>
                </div>
              </div>

              <div className="rounded-md border border-white/[0.07] bg-black/15 px-3 py-3">
                <div className="field-label">Destination wallet / connected session</div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[11px] font-semibold text-white/70">{wallet.address || "No wallet connected"}</span>
                  <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-[0.12em]", wallet.isXLayerTestnet ? "text-aura-long" : "text-aura-wait")}>
                    {wallet.isXLayerTestnet ? "Verified" : "Wrong network"}
                  </span>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-white/28">Payouts always go to this address. It cannot be changed from the browser.</p>
              </div>

              {(submitError || amountIssue) && (
                <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{submitError ?? amountIssue}</InlineNotice>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button className="w-full sm:w-auto" disabled={blocked || submitting} onClick={() => setConfirming(true)}>
                  {submitting ? <><RefreshCw size={14} className="animate-spin" /> Sending USDT...</> : <><ArrowDownLeft size={14} /> Withdraw {fmtAura(requested)}</>}
                </Button>
                <Button variant="secondary" className="w-full sm:w-auto" disabled={loading} onClick={() => void reload()}>
                  <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh status
                </Button>
              </div>
              {!canRedeem(balance) && !treasuryError && (
                <p className="text-[10px] leading-4 text-white/28">Win battles to earn AURA. {fmtAura(MIN_WITHDRAWAL_AURA)} is the smallest redeemable amount.</p>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Real Trading withdrawals" icon={<Wallet size={14} />}>
          <p className="text-sm leading-6 text-white/45">Real Trading — real assets, live execution and real-money withdrawals — is not implemented in this build.</p>
          <div className="mt-5 space-y-4 border-t border-white/[0.07] pt-5">
            <BalanceLine label="Real balance" value="Not available" tone="text-white/65" />
            <BalanceLine label="Settlement network" value="X Layer" tone="text-white/65" />
            <BalanceLine label="Availability" value="Coming soon" tone="text-aura-wait" />
          </div>
          <div className="mt-5 border-y border-aura-wait/20 py-3 text-center text-[10px] font-bold uppercase tracking-[0.16em] text-aura-wait">COMING SOON</div>
          <Button variant="secondary" className="mt-4 w-full" onClick={openRealTrading}>Learn about Real Trading <ArrowRight size={14} /></Button>
        </Panel>
      </div>

      <Panel title="Withdrawal history" icon={<History size={14} />} noPadding>
        <WithdrawalTable withdrawals={data?.withdrawals ?? []} loading={loading && !data} />
      </Panel>

      <InlineNotice tone="neutral" icon={<Info size={14} />}>
        AURA is a demo reward unit with no monetary value. Redemptions pay real X Layer <span className="font-semibold">Testnet</span> USDT — a test token that also has no monetary value. Completed rows link to the actual on-chain transaction.
      </InlineNotice>

      {confirming && (
        <ConfirmDialog
          title="Confirm withdrawal"
          message={`Redeem ${fmtAura(requested)} for ${fmtUsdtTestnet(usdt)}?`}
          detail={`${fmtAura(requested)} is deducted from your AURA balance and ${fmtUsdtTestnet(usdt)} testnet USDT is sent from the AURA treasury to ${wallet.address ?? "your wallet"} on ${XLAYER_TESTNET.name}. If the transfer fails, the AURA is returned to your balance.`}
          confirmLabel={`Withdraw ${fmtAura(requested)}`}
          busy={submitting}
          onCancel={() => setConfirming(false)}
          onConfirm={() => void submit()}
        />
      )}
    </div>
  );
}

/** Persisted redemption records. Shared by the Withdraw and Transactions views. */
function WithdrawalTable({ withdrawals, loading }: { withdrawals: Withdrawal[]; loading?: boolean }) {
  if (loading) return <LoadingRows />;
  if (!withdrawals.length) {
    return <EmptyRows label="No AURA withdrawals yet. Redeem at least 1,000 AURA to create your first testnet USDT payout." />;
  }
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-[minmax(150px,1.1fr)_1fr_1fr_minmax(180px,1.4fr)_auto] gap-3 border-b border-white/[0.07] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28">
          <span>Requested</span>
          <span className="text-right">AURA</span>
          <span className="text-right">USDT (Testnet)</span>
          <span>Transaction</span>
          <span className="text-right">Status</span>
        </div>
        {withdrawals.map((row) => {
          const meta = WITHDRAWAL_STATUS_META[row.status];
          return (
            <div key={row.id} className="grid grid-cols-[minmax(150px,1.1fr)_1fr_1fr_minmax(180px,1.4fr)_auto] items-center gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white/68">{formatDateTime(row.createdAt)}</div>
                <div className="mt-0.5 truncate font-mono text-[9px] text-white/25">{shortHash(row.destinationAddress, 5)}</div>
              </div>
              <TableNumber strong>{fmtAura(row.auraAmount, { unit: false })}</TableNumber>
              <TableNumber className="text-aura-long/85">{fmtUsdtTestnet(row.usdtAmount, { unit: false })}</TableNumber>
              <div className="min-w-0">
                {row.txHash ? (
                  <a
                    href={row.explorerUrl || `${XLAYER_TESTNET.explorerUrl}/tx/${row.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring inline-flex min-w-0 items-center gap-1.5 rounded font-mono text-[10px] text-aura-accent hover:text-white"
                  >
                    <span className="truncate">{shortHash(row.txHash, 8)}</span>
                    <ExternalLink size={11} className="shrink-0" />
                  </a>
                ) : (
                  <span className="text-[10px] text-white/28">{row.error ? row.error : "No transaction broadcast"}</span>
                )}
                {row.txHash && row.error && <div className="mt-0.5 text-[9px] leading-4 text-aura-short/80">{row.error}</div>}
              </div>
              <div className="flex justify-end">
                <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em]", meta.tone)} title={meta.detail}>
                  {meta.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Transactions({ data }: { data: ArenaData }) {
  const proofTx = data.battles.filter((battle) => battle.xlayer_tx_hash);
  return <div className="space-y-5"><Panel title="Demo account activity" icon={<WalletCards size={14} />} noPadding><ActivityTable battles={data.battles} loading={data.loading} /></Panel><Panel title="X Layer proof transactions" icon={<ShieldCheck size={14} />} noPadding>{proofTx.length ? proofTx.map((battle) => <ProofRow key={battle.id} battle={battle} />) : <EmptyRows label="No blockchain proof transactions have been submitted for this account." />}</Panel><InlineNotice tone="neutral" icon={<Info size={14} />}>Demo battle activity is simulated execution inside AURA. Only entries with a real X Layer transaction hash are blockchain transactions.</InlineNotice></div>;
}

function Profile({ data }: { data: ArenaData }) {
  const wallet = useWallet();
  const account = wallet.account!;
  const profile = wallet.profile!;
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const decided = account.wins + account.losses;
  const accent = profileAvatarAccent(profile.avatarStyle);
  const best = useMemo(() => bestCustomAgent(data.battles, data.customAgents), [data.battles, data.customAgents]);
  return (
    <div className="space-y-5">
      {toast && <Toast tone={toast.tone} message={toast.message} onDone={() => setToast(null)} />}
      <Panel title="Profile" icon={<UserRound size={14} />}>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
            <ProfileAvatar
              avatarUrl={profile.avatarUrl}
              displayName={profile.displayName}
              className="h-20 w-20 rounded-lg border border-white/[0.09]"
              fallback={<span className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border font-display text-2xl font-bold" style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}14` }}>{(profile.displayName || "A").slice(0, 1).toUpperCase()}</span>}
            />
            <div className="min-w-0">
              <h2 className="font-display text-2xl font-bold text-white">{profile.displayName}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {profile.username
                  ? <span className="inline-flex items-center gap-0.5 font-mono text-xs text-aura-accent"><AtSign size={11} />{profile.username}</span>
                  : <span className="text-xs text-white/28">No username set</span>}
                <span className="inline-flex items-center gap-1 rounded-full border border-aura-long/20 bg-aura-long/[0.07] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-aura-long"><BadgeCheck size={10} /> Wallet verified</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/35"><Network size={10} className="text-aura-long" /> {XLAYER_TESTNET.name}</span>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">{profile.bio || "No bio yet. Add one so competitors know the edge you trade."}</p>
            </div>
          </div>
          <Button variant="secondary" className="shrink-0" onClick={() => setEditing(true)}><Pencil size={14} /> Edit Profile</Button>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.75fr)_minmax(320px,0.45fr)]">
        <Panel title="Profile information" icon={<ShieldCheck size={14} />}>
          <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-white/[0.07] bg-black/15 px-3 py-3"><div className="min-w-0"><div className="field-label">Wallet address</div><div className="mt-1.5 truncate font-mono text-[10px] font-semibold text-white/65">{wallet.address || "-"}</div></div><CopyButton value={wallet.address || ""} /></div>
          <div className="grid gap-3 sm:grid-cols-2"><ReadOnlyField label="Network" value={XLAYER_TESTNET.name} /><ReadOnlyField label="Account ID" value={profile.id} mono /><ReadOnlyField label="Member since" value={formatDate(profile.createdAt)} /><ReadOnlyField label="Session state" value="Authenticated" /><ReadOnlyField label="Timezone" value={profile.timezone} /><ReadOnlyField label="Language" value={languageLabel(profile.language)} /></div>
          <p className="mt-3 text-[10px] leading-4 text-white/28">Wallet address and account ID are derived from your authenticated session and cannot be edited.</p>
        </Panel>
        <Panel title="Trading identity" icon={<Trophy size={14} />}>
          {account.total_battles ? (
            <>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.07]"><MiniStat label="Battles" value={String(account.total_battles)} /><MiniStat label="Win rate" value={`${decided ? ((account.wins / decided) * 100).toFixed(1) : "0.0"}%`} /><MiniStat label="Total AURA P&L" value={fmtAura(account.realized_pnl, { sign: true })} tone={pnlColor(account.realized_pnl)} /><MiniStat label="Reputation" value={String(profile.reputationScore)} /></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><ReadOnlyField label="Agents created" value={String(data.customAgents.length)} /><ReadOnlyField label="Battle records" value={String(data.battles.length)} /></div>
              {best ? (
                <div className="mt-3 rounded-md border border-white/[0.07] bg-black/15 p-3.5">
                  <div className="field-label">Top performing agent</div>
                  <div className="mt-2 flex items-center justify-between gap-3"><span className="truncate font-display text-lg font-bold" style={{ color: best.accent }}>{best.name}</span><span className={cn("shrink-0 font-mono text-sm font-bold", pnlColor(best.pnl))}>{fmtAura(best.pnl, { sign: true })}</span></div>
                  <div className="mt-1 text-[10px] text-white/30">{best.battles} settled battle{best.battles === 1 ? "" : "s"} / {best.wins} agent win{best.wins === 1 ? "" : "s"}</div>
                </div>
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-white/[0.09] px-4 py-3 text-center text-[11px] text-white/28">No settled custom-agent battles yet</div>
              )}
            </>
          ) : (
            <>
              <EmptyState icon={<Swords size={18} />} title="No battles yet" detail="Enter the Arena to start building your competitive record." action={<LinkButton href="/arena/battles" size="sm">Enter Arena</LinkButton>} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><ReadOnlyField label="Agents created" value={String(data.customAgents.length)} /><ReadOnlyField label="Reputation" value={String(profile.reputationScore)} /></div>
            </>
          )}
        </Panel>
      </div>
      {editing && (
        <ProfileEditor
          profile={profile}
          onClose={() => setEditing(false)}
          onAvatarSaved={async () => {
            // The photo is already persisted: refresh so the profile header and
            // the account switcher show it without closing the editor.
            await wallet.refreshAccount();
            setToast({ tone: "success", message: "Profile photo updated" });
          }}
          onSaved={async () => {
            setEditing(false);
            await wallet.refreshAccount();
            setToast({ tone: "success", message: "Profile updated" });
          }}
        />
      )}
    </div>
  );
}

function Proof({ data }: { data: ArenaData }) {
  const verified = data.battles.filter((battle) => battle.xlayer_status === "VERIFIED").length;
  const pending = data.battles.filter((battle) => battle.xlayer_status === "PENDING").length;
  const unconfigured = data.battles.filter((battle) => !battle.xlayer_status || battle.xlayer_status === "UNCONFIGURED").length;
  return <div className="space-y-5"><div className="grid grid-cols-3 gap-3"><MetricCard label="Verified" value={String(verified)} tone="text-aura-long" icon={<Check size={15} />} /><MetricCard label="Pending" value={String(pending)} tone="text-aura-wait" icon={<Clock3 size={15} />} /><MetricCard label="Not anchored" value={String(unconfigured)} icon={<XCircle size={15} />} /></div><Panel title="Proof history" icon={<ShieldCheck size={14} />} noPadding>{data.loading ? <LoadingRows /> : data.battles.length ? data.battles.map((battle) => <ProofRow key={battle.id} battle={battle} />) : <EmptyRows label="No battle proof records for this account." />}</Panel></div>;
}

function Markets({ data }: { data: ArenaData }) {
  const [search, setSearch] = useState("");
  const liveTickers = useLiveTickers(data.markets.map((market) => market.instId));
  const liveMarkets = data.markets.map((market) => {
    const ticker = liveTickers[market.instId.toUpperCase()];
    if (!ticker) return market;
    return {
      ...market,
      price: ticker.last,
      change24hPercent: ticker.changePercent,
      high24h: ticker.high24h,
      low24h: ticker.low24h,
      volume24hQuote: ticker.volCcy24h,
      status: "LIVE" as const,
    };
  });
  const term = search.trim().toUpperCase();
  const filtered = liveMarkets.filter((market) => !term || market.instId.includes(term) || market.baseName.toUpperCase().includes(term));
  return <div className="space-y-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative w-full sm:max-w-xs"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search real OKX markets" className="h-10 w-full rounded-md border border-white/[0.08] bg-white/[0.02] pl-9 pr-3 text-sm outline-none placeholder:text-white/25 focus:border-aura-accent/40" /></div><div className="flex items-center gap-2"><Link href="/markets" className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-md border border-white/[0.08] px-3 text-xs text-white/45 hover:text-white">Full market terminal</Link><button type="button" onClick={data.refresh} className="focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-md border border-white/[0.08] px-3 text-xs text-white/45 hover:text-white"><RefreshCw size={13} /> Refresh</button></div></div><Panel title="Market overview · OKX spot" icon={<Activity size={14} />} noPadding><div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[minmax(180px,1.5fr)_repeat(5,1fr)] gap-3 border-b border-white/[0.07] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28"><span>Market</span><span className="text-right">Price</span><span className="text-right">24h</span><span className="text-right">High</span><span className="text-right">Low</span><span className="text-right">Volume</span></div>{data.loading ? <LoadingRows /> : filtered.length ? filtered.map((market) => <Link key={market.instId} href={`/arena/markets/${market.instId.toLowerCase()}`} className="grid grid-cols-[minmax(180px,1.5fr)_repeat(5,1fr)] items-center gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0 hover:bg-white/[0.025]"><div className="flex min-w-0 items-center gap-3"><TokenIcon symbol={market.baseCurrency} size={36} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-white/80">{market.instId}</div><div className="truncate text-[10px] text-white/30">{market.baseName} · {market.status.toLowerCase()}</div></div></div><TableNumber>{fmtPrice(market.price)}</TableNumber><TableNumber className={pnlColorOrNa(market.change24hPercent)}>{fmtPctOrNa(market.change24hPercent)}</TableNumber><TableNumber>{fmtPrice(market.high24h)}</TableNumber><TableNumber>{fmtPrice(market.low24h)}</TableNumber><TableNumber>{fmtCompactOrNa(market.volume24hQuote, "$")}</TableNumber></Link>) : <EmptyRows label={data.markets.length ? "No OKX market matches this search." : "Market data unavailable."} />}</div></div></Panel></div>;
}

function SettingsView() {
  const wallet = useWallet();
  const account = wallet.account!;
  const session = wallet.session;
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [confirming, setConfirming] = useState<"reset" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    api<{ settings: UserSettings }>("/api/settings", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((result) => { if (!active) return; setSettings(result.settings); setLoadError(null); })
      .catch((error) => { if (active) setLoadError(error instanceof Error ? error.message : "Unable to load workspace settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session]);

  // Each control persists on change. The optimistic value is rolled back if the
  // request fails, so the UI never shows a preference the database rejected.
  const save = useCallback(async (patch: Partial<UserSettingsDraft>, key: string) => {
    if (!session || !settings) return;
    const previous = settings;
    setSavingKey(key);
    setSettings({ ...settings, ...patch });
    try {
      const result = await api<{ settings: UserSettings }>("/api/settings", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: patch,
      });
      setSettings(result.settings);
      setToast({ tone: "success", message: "Settings saved" });
    } catch (error) {
      setSettings(previous);
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Unable to save settings" });
    } finally {
      setSavingKey(null);
    }
  }, [session, settings]);

  const resetBalance = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api("/api/wallet/demo-account/reset", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
      await wallet.refreshAccount();
      setConfirming(null);
      setToast({ tone: "success", message: "Demo balance reset to 1,000 AURA." });
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Unable to reset demo balance" });
    } finally {
      setBusy(false);
    }
  }, [session, wallet]);

  const deleteAccount = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api("/api/wallet/account", { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
      setConfirming(null);
      // Reuses the existing wallet session teardown: clears state, signs out of
      // Supabase and returns to the landing page in its disconnected state.
      await wallet.disconnect();
    } catch (error) {
      setToast({ tone: "error", message: error instanceof Error ? error.message : "Unable to delete account" });
      setBusy(false);
    }
  }, [session, wallet]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {toast && <Toast tone={toast.tone} message={toast.message} onDone={() => setToast(null)} />}

      <Panel title="Trading mode" icon={<Gauge size={14} />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeCard title="Demo Trading" detail="Virtual capital, live market intelligence and simulated execution." active badge="Active" />
          <ModeCard title="Real Trading" detail="Real X Layer assets, execution and settlement are not implemented yet." disabled badge="Coming soon" />
        </div>
        <p className="mt-3 text-[10px] leading-4 text-white/28">Demo is the only mode this build can execute. Real trading stays disabled until the live execution layer ships.</p>
      </Panel>

      <Panel title="Demo account" icon={<CircleDollarSign size={14} />}>
        <div className="rounded-md border border-aura-accent/20 bg-aura-accent/[0.06] p-4">
          <div className="mono text-2xl font-bold text-white">{fmtAura(account.current_balance)}</div>
          <div className="terminal-label mt-1 text-aura-accent">Persisted AURA balance</div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><ReadOnlyField label="Starting AURA" value={fmtAura(account.starting_balance)} /><ReadOnlyField label="Realized AURA P&L" value={fmtAura(account.realized_pnl, { sign: true })} /></div>
        <Button variant="secondary" className="mt-4 w-full" onClick={() => setConfirming("reset")}><RotateCcw size={14} /> Reset Demo Balance</Button>
      </Panel>

      <Panel title="Trading preferences" icon={<SlidersHorizontal size={14} />} className="lg:col-span-2">
        {loading ? <SettingsSkeleton rows={3} /> : loadError ? <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{loadError}</InlineNotice> : settings ? (
          <div className="space-y-5">
            <div>
              <FieldLabel label="Risk preference" value={savingKey === "riskPreference" ? "Saving..." : ""} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {RISK_PREFERENCES.map((item) => (
                  <button key={item.value} type="button" aria-pressed={settings.riskPreference === item.value} disabled={Boolean(savingKey)} onClick={() => void save({ riskPreference: item.value }, "riskPreference")} className={cn("focus-ring rounded-md border px-3 py-2.5 text-left transition-colors disabled:opacity-60", settings.riskPreference === item.value ? "border-aura-accent/50 bg-aura-accent/10" : "border-white/[0.08] bg-white/[0.015] hover:border-white/[0.14]")}>
                    <div className={cn("text-xs font-semibold", settings.riskPreference === item.value ? "text-white" : "text-white/55")}>{item.label}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-white/30">{item.detail}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsSelect label="Default strategy" value={settings.defaultStrategy} saving={savingKey === "defaultStrategy"} options={DEFAULT_STRATEGIES} disabled={Boolean(savingKey)} onChange={(value) => void save({ defaultStrategy: value as UserSettings["defaultStrategy"] }, "defaultStrategy")} />
              <SettingsSelect label="Decision behavior" value={settings.decisionBehavior} saving={savingKey === "decisionBehavior"} options={DECISION_BEHAVIORS} disabled={Boolean(savingKey)} onChange={(value) => void save({ decisionBehavior: value as UserSettings["decisionBehavior"] }, "decisionBehavior")} />
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel title="Notifications" icon={<Bell size={14} />}>
        {loading ? <SettingsSkeleton rows={5} /> : loadError ? <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{loadError}</InlineNotice> : settings ? (
          <div>
            {NOTIFICATION_TOGGLES.map((item) => (
              <SettingsToggle
                key={item.key}
                title={item.label}
                detail={item.detail}
                checked={settings[item.key]}
                saving={savingKey === item.key}
                disabled={Boolean(savingKey)}
                onChange={(next) => void save({ [item.key]: next } as Partial<UserSettingsDraft>, item.key)}
              />
            ))}
          </div>
        ) : null}
      </Panel>

      <Panel title="Account preferences" icon={<Globe2 size={14} />}>
        {loading ? <SettingsSkeleton rows={2} /> : loadError ? <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{loadError}</InlineNotice> : settings ? (
          <div className="space-y-4">
            <SettingsSelect label="Timezone" value={settings.timezone} saving={savingKey === "timezone"} options={TIMEZONE_OPTIONS} disabled={Boolean(savingKey)} onChange={(value) => void save({ timezone: value }, "timezone")} />
            <SettingsSelect label="Language" value={settings.language} saving={savingKey === "language"} options={LANGUAGE_OPTIONS} disabled={Boolean(savingKey)} onChange={(value) => void save({ language: value }, "language")} />
            <p className="text-[10px] leading-4 text-white/28">Used to format times and copy across the workspace. Your profile keeps its own copy of these values.</p>
          </div>
        ) : null}
      </Panel>

      <Panel title="Wallet session" icon={<Wallet size={14} />} className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-3"><ReadOnlyField label="Connected wallet" value={wallet.address || "Not connected"} mono /><ReadOnlyField label="Network" value={wallet.isXLayerTestnet ? `${XLAYER_TESTNET.name} / ${XLAYER_TESTNET.chainId}` : "Wrong network"} /><ReadOnlyField label="Authentication" value={wallet.session ? "Authenticated" : "No session"} /></div>
        <Button variant="secondary" className="mt-4" onClick={() => void wallet.disconnect()}><LogOut size={14} /> Disconnect Wallet</Button>
      </Panel>

      <Panel title="Danger zone" icon={<AlertTriangle size={14} />} className="lg:col-span-2">
        <div className="flex flex-col gap-4 rounded-md border border-aura-short/25 bg-aura-short/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white/78">Delete account</div>
            <p className="mt-1 max-w-xl text-xs leading-5 text-white/40">Permanently removes your profile, demo account, battle history and custom agents. This cannot be undone.</p>
          </div>
          <Button variant="danger" className="shrink-0" onClick={() => setConfirming("delete")}><Trash2 size={14} /> Delete Account</Button>
        </div>
      </Panel>

      {confirming === "reset" && (
        <ConfirmDialog
          title="Reset demo balance"
          message="Reset your demo balance to the available AURA grant?"
          detail="This restores your virtual capital and clears realized P&L. Your battle history and competitive record are kept."
          confirmLabel="Reset Balance"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void resetBalance()}
        />
      )}

      {confirming === "delete" && (
        <ConfirmDialog
          title="Delete account"
          message="Permanently delete your AURA account?"
          detail="Your profile, demo account, battle history and custom agents are deleted immediately. This cannot be undone."
          confirmLabel="Delete Account"
          danger
          requireText="DELETE"
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void deleteAccount()}
        />
      )}
    </div>
  );
}

function ProtectedWorkspace() {
  const wallet = useWallet();
  const needsNetwork = wallet.connected && !wallet.isXLayerTestnet;
  const needsAuth = wallet.connected && wallet.isXLayerTestnet && !wallet.session;
  const title = needsNetwork ? "Switch to X Layer Testnet" : needsAuth ? "Authenticate your wallet" : "Connect to your AURA account";
  return <div className="grid min-h-[calc(100vh-57px)] min-w-0 place-items-center px-4"><div className="w-full min-w-0 max-w-md text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/[0.08] text-aura-accent"><Wallet size={20} /></span><h1 className="mt-4 break-words font-display text-xl font-bold">{title}</h1><p className="mt-2 break-words text-sm leading-6 text-white/42">The authenticated workspace is bound to the active wallet session and X Layer Testnet identity.</p><Button className="mt-5" onClick={wallet.openConnect}><Wallet size={14} /> Continue</Button></div></div>;
}

function WorkspaceLoading({ label }: { label: string }) { return <div className="flex min-h-[calc(100vh-57px)] items-center justify-center gap-2 text-sm text-white/38"><RefreshCw size={14} className="animate-spin text-aura-accent" />{label}</div>; }

function Panel({ title, icon, action, children, noPadding = false, className }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; noPadding?: boolean; className?: string }) {
  return <section className={cn("min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018]", className)}><div className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45"><span className="text-aura-accent">{icon}</span>{title}</div>{action}</div><div className={cn(!noPadding && "p-4 sm:p-5")}>{children}</div></section>;
}

function MetricCard({ label, value, tone = "text-white", icon }: { label: string; value: string; tone?: string; icon: React.ReactNode }) { return <div className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.018] p-4"><div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-white/32"><span>{label}</span><span className="text-white/25">{icon}</span></div><div className={cn("mt-2 truncate font-mono text-xl font-bold sm:text-2xl", tone)}>{value}</div></div>; }
function MiniStat({ label, value, tone = "text-white", icon }: { label: string; value: string; tone?: string; icon?: React.ReactNode }) { return <div className="min-w-0 bg-[#080b14] p-4"><div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.13em] text-white/28"><span>{label}</span><span>{icon}</span></div><div className={cn("mt-2 truncate font-mono text-base font-bold sm:text-lg", tone)}>{value}</div></div>; }
function CompactMetric({ label, value }: { label: string; value: React.ReactNode }) { return <div className="min-w-0 px-2 text-center"><div className="font-mono text-sm font-bold text-white/80">{value}</div><div className="mt-1 truncate text-[8px] font-bold uppercase tracking-[0.12em] text-white/25">{label}</div></div>; }

function CurrentBattle({ battle }: { battle: Battle }) { const agent = getBattleAgent(battle); return <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center"><div><div className="flex items-center gap-2"><AssetBadge symbol={battle.asset} /><div><div className="font-display text-lg font-bold">{formatPair(battle.asset)}</div><div className="text-[10px] text-white/32">Leveraged battle · {battle.leverage}x</div></div></div><div className="mt-4"><StatusBadge battle={battle} /></div></div><div className="flex items-center gap-3 text-center"><div><div className="text-[9px] uppercase tracking-[0.13em] text-white/25">AI Agent</div><div className="mt-1 font-bold" style={{ color: agent.accent }}>{agent.name}</div></div><span className="grid h-8 w-8 place-items-center rounded-full border border-white/[0.09] bg-black/20 text-[9px] font-bold text-white/30">VS</span><div><div className="text-[9px] uppercase tracking-[0.13em] text-white/25">Human</div><div className="mt-1 font-bold text-white/75">YOU</div></div></div><div className="grid grid-cols-3 gap-4 md:text-right"><CompactMetric label="Position" value={battle.human_direction} /><CompactMetric label="AURA stake" value={fmtAura(battle.human_amount)} /><CompactMetric label="Current AURA P&L" value={<span className={pnlColor(battle.human_pnl)}>{fmtAura(battle.human_pnl, { sign: true })}</span>} /></div></div>; }

function LobbySection({ title, count, tone, battles, loading, empty }: { title: string; count: number; tone?: "live"; battles: Battle[]; loading?: boolean; empty: string }) { return <section><div className="mb-2 flex items-center gap-2"><span className={cn("h-1.5 w-1.5 rounded-full", tone === "live" ? "bg-aura-long" : "bg-white/20")} /><h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/48">{title}</h2><span className="rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[9px] text-white/30">{count}</span></div>{loading ? <LoadingRows /> : battles.length ? <div className="grid gap-3 md:grid-cols-2">{battles.map((battle) => <BattleCard key={battle.id} battle={battle} />)}</div> : <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.012] px-4 py-7 text-center text-xs text-white/30">{empty}</div>}</section>; }
function BattleCard({ battle }: { battle: Battle }) { const agent = getBattleAgent(battle); return <Link href={`/arena/${battle.id}`} className="group rounded-lg border border-white/[0.08] bg-white/[0.018] p-4 transition hover:border-white/[0.14] hover:bg-white/[0.03]"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><AssetBadge symbol={battle.asset} /><div><div className="font-semibold text-white/85">{formatPair(battle.asset)}</div><div className="mt-0.5 text-[10px] text-white/30">{battle.leverage}x leveraged battle</div></div></div><StatusBadge battle={battle} /></div><div className="my-5 flex items-center justify-between"><div><div className="text-[9px] uppercase tracking-[0.12em] text-white/25">AI Agent</div><div className="mt-1 text-sm font-bold" style={{ color: agent.accent }}>{agent.name}</div></div><span className="text-[10px] font-bold text-white/20">VS</span><div className="text-right"><div className="text-[9px] uppercase tracking-[0.12em] text-white/25">Your position</div><div className="mt-1"><DirectionBadge direction={battle.human_direction} size="sm" /></div></div></div><div className="grid grid-cols-3 border-t border-white/[0.07] pt-3"><CompactMetric label="AURA stake" value={fmtAura(battle.human_amount)} /><CompactMetric label="Leverage" value={`${battle.leverage}x`} /><CompactMetric label="AURA P&L" value={<span className={pnlColor(battle.human_pnl)}>{fmtAura(battle.human_pnl, { sign: true })}</span>} /></div><div className="mt-4 flex items-center justify-end gap-1 text-xs font-semibold text-aura-accent">View battle <ChevronRight size={13} className="transition-transform group-hover:translate-x-0.5" /></div></Link>; }

function BattleTable({ battles, loading, compact = false }: { battles: Battle[]; loading?: boolean; compact?: boolean }) {
  if (loading) return <LoadingRows />;
  if (!battles.length) return <EmptyRows label="No battles match this view." />;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px]">
        <div className="grid grid-cols-[minmax(230px,1.8fr)_minmax(150px,1.2fr)_repeat(6,1fr)] gap-3 border-b border-white/[0.07] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28">
          <span>Battle</span><span>Positions</span><span className="text-right">Stake</span><span className="text-right">Lev.</span><span className="text-right">Human P&L</span><span className="text-right">AI P&L</span><span className="text-right">Result</span><span className="text-right">Time</span>
        </div>
        {battles.map((battle) => {
          const agent = getBattleAgent(battle);
          return (
            <Link key={battle.id} href={`/arena/${battle.id}`} className={cn("grid grid-cols-[minmax(230px,1.8fr)_minmax(150px,1.2fr)_repeat(6,1fr)] items-center gap-3 border-b border-white/[0.05] px-5 last:border-0 hover:bg-white/[0.025]", compact ? "py-3" : "py-4")}>
              <div className="flex min-w-0 items-center gap-2.5"><TokenIcon symbol={battle.asset.split("-")[0]} size={26} /><div className="min-w-0"><div className="truncate text-sm font-semibold text-white/78">{formatPair(battle.asset)}</div><div className="mt-0.5 font-mono text-[9px] text-white/25">Entry {fmtPrice(battle.entry_price)} · Settlement {battle.exit_price == null ? "—" : fmtPrice(battle.exit_price)}</div><div className="mt-0.5 text-[9px] text-white/25">{battle.duration_seconds / 60}m · {battle.status} · {shortHash(battle.id, 5)}</div></div></div>
              <div className="text-xs"><div className="text-white/58">YOU {battle.human_direction}</div><div className="mt-1 font-semibold" style={{ color: agent.accent }}>{agent.name} {battle.ai_direction}</div></div>
              <TableNumber>{fmtAura(battle.human_amount)}</TableNumber><TableNumber>{battle.leverage}x</TableNumber><TableNumber className={pnlColor(battle.human_pnl)}>{fmtAura(battle.human_pnl, { sign: true })}</TableNumber><TableNumber className={pnlColor(battle.ai_pnl)}>{fmtAura(battle.ai_pnl, { sign: true })}</TableNumber><div className="text-right"><ResultLabel battle={battle} /></div><TableNumber>{formatRelative(battle.ended_at || battle.createdAt)}</TableNumber>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function PositionTable({ battles, loading }: { battles: Battle[]; loading?: boolean }) { if (loading) return <LoadingRows />; if (!battles.length) return <EmptyState icon={<Activity size={18} />} title="No active positions" detail="Your portfolio currently has no open battle positions." action={<LinkButton href="/arena/battles" size="sm">Enter Arena</LinkButton>} />; return <div className="overflow-x-auto"><div className="min-w-[790px]"><div className="grid grid-cols-[minmax(150px,1.25fr)_repeat(6,1fr)] gap-3 border-b border-white/[0.07] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28"><span>Market</span><span className="text-right">Direction</span><span className="text-right">Stake</span><span className="text-right">Lev.</span><span className="text-right">Entry</span><span className="text-right">Current</span><span className="text-right">AURA P&L</span></div>{battles.map((battle) => <Link key={battle.id} href={`/arena/${battle.id}`} className="grid grid-cols-[minmax(150px,1.25fr)_repeat(6,1fr)] items-center gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0 hover:bg-white/[0.025]"><div><div className="text-sm font-semibold text-white/75">{formatPair(battle.asset)}</div><div className="mt-0.5 text-[10px] text-white/28">{getBattleAgent(battle).name} battle</div></div><div className="flex justify-end"><DirectionBadge direction={battle.human_direction} size="sm" /></div><TableNumber>{fmtAura(battle.human_amount)}</TableNumber><TableNumber>{battle.leverage}x</TableNumber><TableNumber>{fmtUsd(battle.entry_price)}</TableNumber><TableNumber>{fmtUsd(battle.current_price)}</TableNumber><TableNumber className={pnlColor(battle.human_pnl)}>{fmtAura(battle.human_pnl, { sign: true })}</TableNumber></Link>)}</div></div>; }

function ActivityTable({ battles, loading }: { battles: Battle[]; loading?: boolean }) { if (loading) return <LoadingRows />; const events = battles.flatMap((battle) => [{ id: `${battle.id}-opened`, type: "Battle opened", detail: `${battle.leverage}x · ${battle.human_direction} · ${battle.stake_reserved ? "stake reserved" : "stake pending start"}`, asset: formatPair(battle.asset), value: battle.human_amount, valueLabel: "AURA stake", isPnl: false, date: battle.started_at || battle.createdAt }, ...(["FINISHED", "VERIFIED"].includes(battle.status) ? [{ id: `${battle.id}-settled`, type: "Battle settled", detail: `${battle.leverage}x · ${battle.winner || "DRAW"}`, asset: formatPair(battle.asset), value: battle.human_pnl, valueLabel: "AURA P&L", isPnl: true, date: battle.ended_at || battle.createdAt }] : [])]).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); if (!events.length) return <EmptyRows label="No application activity yet. Enter the Arena to open your first position." />; return <div className="overflow-x-auto"><div className="min-w-[680px]"><div className="grid grid-cols-[minmax(190px,1.5fr)_1fr_1fr_1fr] gap-3 border-b border-white/[0.07] px-5 py-3 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28"><span>Activity</span><span>Market</span><span className="text-right">Value</span><span className="text-right">Time</span></div>{events.map((event) => <div key={event.id} className="grid grid-cols-[minmax(190px,1.5fr)_1fr_1fr_1fr] items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-0"><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025] text-white/35">{event.isPnl ? <CircleDollarSign size={13} /> : <Swords size={13} />}</span><div><div className="text-sm font-semibold text-white/72">{event.type}</div><div className="text-[10px] text-white/28">{event.detail}</div></div></div><span className="text-xs text-white/42">{event.asset}</span><div className="text-right"><div className={cn("font-mono text-xs font-semibold", event.isPnl ? pnlColor(event.value) : "text-white/60")}>{fmtAura(event.value, { sign: event.isPnl })}</div><div className="mt-0.5 text-[9px] text-white/25">{event.valueLabel}</div></div><span className="text-right text-[10px] text-white/30">{formatDateTime(event.date)}</span></div>)}</div></div>; }

function ProofRow({ battle }: { battle: Battle }) { const status = battle.xlayer_status || "UNCONFIGURED"; const tone = status === "VERIFIED" ? "text-aura-long" : status === "PENDING" ? "text-aura-wait" : status === "FAILED" ? "text-aura-short" : "text-white/35"; return <div className="grid gap-3 border-b border-white/[0.05] px-5 py-4 last:border-0 lg:grid-cols-[minmax(180px,1.3fr)_1fr_1fr_1.5fr_auto] lg:items-center"><div><div className="text-sm font-semibold text-white/75">{formatPair(battle.asset)}</div><div className="mt-0.5 font-mono text-[9px] text-white/25">{shortHash(battle.id, 6)}</div></div><div><div className="field-label">Result</div><div className="mt-1"><ResultLabel battle={battle} /></div></div><div><div className="field-label">Settlement</div><div className="mt-1 text-xs text-white/55">{battle.settlement_applied ? "Applied" : "Not applied"}</div></div><div className="min-w-0"><div className="field-label">Transaction / hash</div><div className="mt-1 truncate font-mono text-[10px] text-white/42">{battle.xlayer_tx_hash || battle.xlayer_data_hash || "No chain transaction"}</div></div><div className="flex items-center justify-between gap-3 lg:justify-end"><span className={cn("text-[9px] font-bold uppercase tracking-[0.12em]", tone)}>{status.replace("UNCONFIGURED", "Not anchored")}</span>{battle.xlayer_explorer_url && battle.xlayer_tx_hash ? <a href={battle.xlayer_explorer_url} target="_blank" rel="noreferrer" title="View on explorer" className="focus-ring text-white/35 hover:text-aura-accent"><ExternalLink size={14} /></a> : null}</div></div>; }

/**
 * One roster card: identity, the agent's current decision, then its recorded
 * performance.
 *
 * The decision block renders backend state only. `missing` and a failed load
 * both read DECISION UNAVAILABLE, `stale` shows the last real decision with its
 * true age and is labelled as such, and nothing here can produce a decision the
 * backend did not persist.
 */
function AgentCard({ agent, decision, loading }: { agent: AgentRank; decision?: AgentDecisionState; loading?: boolean }) {
  const battles = agent.wins + agent.losses;
  const current = decision && decision.status !== "missing" ? decision.decision : null;
  return (
    <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018] p-4">
      <span className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: agent.accent }} />
      <AgentAvatar agent={agent} />
      <div className="mt-4">
        <div className="font-display text-lg font-bold" style={{ color: agent.accent }}>{agent.name}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-white/32">{agent.specialty}</div>
      </div>

      <div className="mt-3 rounded-md border border-white/[0.07] bg-black/25 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/38">Current decision</span>
          {decision?.status === "stale" && <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-aura-wait">Stale</span>}
        </div>
        {current ? (
          <>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <DirectionBadge direction={current.decision} />
              <span className="mono text-sm font-bold" style={{ color: agent.accent }}>{current.confidence}%</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
              <span className="truncate text-white/38">{formatPair(current.symbol)}</span>
              <span className="text-right text-white/38">{current.horizonMinutes} MIN</span>
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-white/25">Updated {formatDecisionAge(current)}</div>
          </>
        ) : (
          <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">
            {loading ? "Loading decision" : "Decision unavailable"}
          </div>
        )}
      </div>

      {battles ? <div className="mt-3 grid grid-cols-3 border-y border-white/[0.07] py-3"><CompactMetric label="Win rate" value={`${agent.win_rate}%`} /><CompactMetric label="Wins" value={agent.wins} /><CompactMetric label="Battles" value={battles} /></div> : <div className="mt-3 border-y border-white/[0.07] py-3 text-center"><div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">No performance data</div><div className="mt-1 text-[10px] text-white/24">Complete a battle to generate statistics.</div></div>}
      <Link href={`/arena/battles?agent=${agent.id}`} className="mt-4 flex h-9 items-center justify-center gap-2 rounded-md border border-white/[0.09] bg-white/[0.035] text-xs font-semibold text-white/65 hover:border-aura-accent/30 hover:text-white">Select agent <ArrowRight size={13} /></Link>
    </div>
  );
}
function AgentAvatar({ agent, large = false, small = false }: { agent: Agent; large?: boolean; small?: boolean }) { return <AgentIdentityAvatar agent={agent} className={cn("rounded-md border-white/[0.09]", large ? "h-16 w-16" : small ? "h-8 w-8" : "h-11 w-11")} glyphClassName={large ? "text-xl" : small ? "text-xs" : "text-base"} />; }
function BattleAgentAvatar({ agent, large = false }: { agent: BattleAgentView; large?: boolean }) { return <AgentIdentityAvatar agent={agent} className={cn("rounded-md border-white/[0.09]", large ? "h-16 w-16" : "h-11 w-11")} glyphClassName={large ? "text-xl" : "text-base"} />; }
/**
 * Battle-card asset mark. Renders the real token icon rather than a bordered
 * text box; `symbol` may be a bare base currency or a full instrument id.
 */
function AssetBadge({ symbol }: { symbol: string }) { return <TokenIcon symbol={(symbol || "").split("-")[0]} size={40} />; }
function StatusBadge({ battle }: { battle: Battle }) { const status = BATTLE_STATUS[battle.status]; return <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em]", status.tone)}>{status.label}</span>; }
function ResultLabel({ battle }: { battle: Battle }) { if (!battle.winner) return <StatusBadge battle={battle} />; const won = battle.winner === "HUMAN"; const draw = battle.winner === "DRAW"; return <span className={cn("text-[10px] font-bold uppercase tracking-[0.1em]", won ? "text-aura-long" : draw ? "text-white/45" : "text-aura-short")}>{won ? "Won" : draw ? "Draw" : "Lost"}</span>; }

function MarketRow({ market }: { market: NormalizedMarket }) { return <Link href={`/markets/${market.instId.toLowerCase()}`} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white/[0.05] px-4 py-3 last:border-0 hover:bg-white/[0.02]"><div className="min-w-0"><div className="truncate text-sm font-semibold text-white/72">{market.baseCurrency}</div><div className="truncate text-[9px] text-white/25">{market.instId}</div></div><div className="text-right"><div className="font-mono text-xs text-white/72">{fmtPrice(market.price)}</div><div className={cn("mt-0.5 text-[9px]", pnlColorOrNa(market.change24hPercent))}>{fmtPctOrNa(market.change24hPercent)}</div></div></Link>; }

function PerformanceChart({ data }: { data: { label: string; pnl: number }[] }) { return <div className="h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}><defs><linearGradient id="arenaPnlFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c5cff" stopOpacity={0.3} /><stop offset="100%" stopColor="#7c5cff" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} /><XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} width={52} tickFormatter={(value) => `${value} AURA`} /><Tooltip contentStyle={{ background: "#0a0d18", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, fontSize: 11 }} formatter={(value: number) => [fmtAura(value, { sign: true }), "Cumulative P&L"]} /><Area type="monotone" dataKey="pnl" stroke="#8b70ff" strokeWidth={2} fill="url(#arenaPnlFill)" /></AreaChart></ResponsiveContainer></div>; }
function PerformanceBreakdown({ title, rows }: { title: string; rows: { label: string; battles: number; pnl: number; wins: number }[] }) { return <Panel title={title} icon={<BarChart3 size={14} />} noPadding>{rows.length ? rows.map((row) => <div key={row.label} className="grid grid-cols-[1.3fr_repeat(3,1fr)] items-center gap-3 border-b border-white/[0.05] px-4 py-3 last:border-0"><span className="text-xs font-semibold text-white/65">{row.label}</span><TableNumber>{row.battles} battles</TableNumber><TableNumber>{row.battles ? ((row.wins / row.battles) * 100).toFixed(1) : "0.0"}%</TableNumber><TableNumber className={pnlColor(row.pnl)}>{fmtAura(row.pnl, { sign: true })}</TableNumber></div>) : <EmptyRows label="No settled data for this range." />}</Panel>; }

function Segment({ active, onClick, children, tone, compact = false }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: Direction; compact?: boolean }) { const activeTone = tone === "LONG" ? "border-aura-long/35 bg-aura-long/[0.09] text-aura-long" : tone === "SHORT" ? "border-aura-short/35 bg-aura-short/[0.09] text-aura-short" : tone === "WAIT" ? "border-aura-wait/35 bg-aura-wait/[0.09] text-aura-wait" : "border-aura-accent/35 bg-aura-accent/[0.09] text-white"; return <button type="button" onClick={onClick} className={cn("focus-ring rounded-md border font-semibold transition-colors", compact ? "h-8 px-3 text-[10px]" : "h-10 px-2 text-xs", active ? activeTone : "border-transparent bg-transparent text-white/35 hover:bg-white/[0.035] hover:text-white/70")}>{children}</button>; }
function FieldLabel({ label, value, className }: { label: string; value: string; className?: string }) { return <div className={cn("mb-2 flex items-center justify-between gap-3", className)}><span className="field-label">{label}</span><span className="text-[10px] font-semibold text-white/48">{value}</span></div>; }

/**
 * Keeps the stake field to digits and a single fraction of the allowed length
 * while typing. It only restrains the keystrokes — whether the resulting amount
 * may fund a battle is battleStakeIssue()'s call, on both sides of the wire.
 */
function sanitizeStakeInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, BATTLE_STAKE_DECIMALS)}`;
}
function ReadOnlyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="min-w-0 rounded-md border border-white/[0.07] bg-black/15 px-3 py-3"><div className="field-label">{label}</div><div className={cn("mt-1.5 truncate text-xs font-semibold text-white/65", mono && "font-mono text-[10px]")}>{value}</div></div>; }
function BalanceLine({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="flex items-center justify-between gap-3"><span className="text-xs text-white/38">{label}</span><span className={cn("font-mono text-sm font-semibold", tone)}>{value}</span></div>; }
function SettingRow({ title, detail, active = false, mono = false }: { title: string; detail: string; active?: boolean; mono?: boolean }) { return <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-4 first:pt-0 last:border-0 last:pb-0"><div><div className="text-sm font-semibold text-white/68">{title}</div><div className={cn("mt-1 text-xs leading-5 text-white/32", mono && "font-mono text-[10px]")}>{detail}</div></div><span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", active ? "bg-aura-long" : "bg-white/15")} /></div>; }
function InlineNotice({ tone, icon, children }: { tone: "warning" | "neutral"; icon: React.ReactNode; children: React.ReactNode }) { return <div className={cn("flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-xs leading-5", tone === "warning" ? "border-aura-wait/20 bg-aura-wait/[0.055] text-aura-wait/80" : "border-white/[0.08] bg-white/[0.018] text-white/42")}><span className="mt-0.5 shrink-0">{icon}</span><span>{children}</span></div>; }
function EmptyState({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) { return <div className="grid min-h-[150px] place-items-center text-center"><div><span className="mx-auto grid h-9 w-9 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025] text-white/28">{icon}</span><div className="mt-3 text-sm font-semibold text-white/58">{title}</div><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-white/30">{detail}</p>{action && <div className="mt-4">{action}</div>}</div></div>; }
function EmptyRows({ label }: { label: string }) { return <div className="grid min-h-[120px] place-items-center px-5 text-center text-xs text-white/28">{label}</div>; }
function LoadingRows() { return <div className="space-y-px bg-white/[0.04]">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-14 animate-pulse bg-[#090c15]" />)}</div>; }
function TableNumber({ children, strong = false, className }: { children: React.ReactNode; strong?: boolean; className?: string }) { return <span className={cn("text-right font-mono text-xs text-white/45", strong && "font-bold text-white/75", className)}>{children}</span>; }
function Rank({ index }: { index: number }) { return <span className={cn("font-mono text-xs font-bold", index === 0 ? "text-aura-gold" : index < 3 ? "text-white/62" : "text-white/28")}>#{index + 1}</span>; }
function CopyButton({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <button type="button" title="Copy wallet address" onClick={() => { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="focus-ring text-white/28 hover:text-white">{copied ? <Check size={13} /> : <Copy size={13} />}</button>; }
function LinkButton({ href, children, icon, variant = "primary", size = "md" }: { href: string; children: React.ReactNode; icon?: React.ReactNode; variant?: "primary" | "secondary"; size?: "sm" | "md" }) { return <Link href={href} className={cn("focus-ring inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors", size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm", variant === "primary" ? "bg-aura-accent text-white hover:bg-[#8b70ff]" : "border border-white/[0.1] bg-white/[0.035] text-white/65 hover:bg-white/[0.06] hover:text-white")}>{icon}{children}</Link>; }

function todayPnl(battles: Battle[]) { const today = new Date().toDateString(); return battles.filter((battle) => new Date(battle.ended_at || battle.createdAt).toDateString() === today).reduce((sum, battle) => sum + battle.human_pnl, 0); }
function returnPct(battle: Battle) { return battle.human_amount ? (battle.human_pnl / battle.human_amount) * 100 : 0; }
function cumulativePnl(battles: Battle[]) { let total = 0; return [...battles].sort((a, b) => new Date(a.ended_at || a.createdAt).getTime() - new Date(b.ended_at || b.createdAt).getTime()).map((battle) => { total += battle.human_pnl; return { label: new Date(battle.ended_at || battle.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }), pnl: Number(total.toFixed(2)) }; }); }
function groupPerformance(battles: Battle[], key: (battle: Battle) => string) { const groups = new Map<string, { label: string; battles: number; pnl: number; wins: number }>(); battles.forEach((battle) => { const label = key(battle); const row = groups.get(label) || { label, battles: 0, pnl: 0, wins: 0 }; row.battles += 1; row.pnl += battle.human_pnl; if (battle.winner === "HUMAN") row.wins += 1; groups.set(label, row); }); return [...groups.values()].sort((a, b) => b.pnl - a.pnl); }
function formatRelative(value: string) { const delta = Date.now() - new Date(value).getTime(); const minutes = Math.floor(delta / 60000); if (minutes < 1) return "Now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return `${days}d ago`; }
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-"; }
function formatDateTime(value: string) { return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }

function languageLabel(code: string) { return LANGUAGE_OPTIONS.find((item) => item.value === code)?.label ?? code; }

/**
 * Highest realized-P&L custom agent across the caller's settled battles.
 * Derived entirely from the loaded battle records and owned agents: returns null
 * rather than inventing a placeholder when nothing has settled yet.
 */
function bestCustomAgent(battles: Battle[], agents: CustomAgent[]) {
  const totals = new Map<string, { pnl: number; battles: number; wins: number }>();
  for (const battle of battles) {
    if (!battle.customAgentId || !battle.settlement_applied) continue;
    const row = totals.get(battle.customAgentId) ?? { pnl: 0, battles: 0, wins: 0 };
    row.pnl += battle.ai_pnl;
    row.battles += 1;
    if (battle.winner === "AI") row.wins += 1;
    totals.set(battle.customAgentId, row);
  }
  let best: { name: string; accent: string; pnl: number; battles: number; wins: number } | null = null;
  for (const [id, row] of totals) {
    const agent = agents.find((item) => item.id === id);
    if (!agent) continue;
    if (!best || row.pnl > best.pnl) {
      best = { name: agent.name, accent: customAgentAccent(agent.avatarStyle), ...row };
    }
  }
  return best;
}

function Toast({ tone, message, onDone }: { tone: "success" | "error"; message: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), 2800);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-live="polite" className={cn("fixed bottom-5 right-5 z-[260] flex max-w-[calc(100vw-2.5rem)] items-start gap-2 rounded-lg border px-4 py-3 text-xs font-semibold shadow-2xl", tone === "success" ? "border-aura-long/30 bg-[#0b1a14] text-aura-long" : "border-aura-short/30 bg-[#1a0d10] text-aura-short")}>
      <span className="mt-0.5 shrink-0">{tone === "success" ? <Check size={14} /> : <AlertTriangle size={14} />}</span>
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

function ConfirmDialog({ title, message, detail, confirmLabel, onConfirm, onCancel, busy = false, danger = false, requireText }: { title: string; message: string; detail?: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean; danger?: boolean; requireText?: string }) {
  const [typed, setTyped] = useState("");
  const unlocked = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();
  return (
    <div className="fixed inset-0 z-[250] grid items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm sm:py-16">
      <div className="my-auto w-full max-w-md rounded-lg border border-white/[0.1] bg-[#090c16] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
          <div><div className="section-kicker">AURA ARENA</div><h2 className="mt-1 font-display text-lg font-bold">{title}</h2></div>
          <button type="button" title="Close" aria-label="Close" onClick={onCancel} className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-white/45 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm font-semibold leading-6 text-white/78">{message}</p>
          {detail && <p className="text-xs leading-5 text-white/40">{detail}</p>}
          {requireText && (
            <label className="grid gap-1.5 text-xs font-semibold text-white/65">Type {requireText} to confirm
              <input value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white" />
            </label>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Button variant={danger ? "danger" : "primary"} className="w-full sm:w-auto" disabled={busy || !unlocked} onClick={onConfirm}>
              {busy ? <><RefreshCw size={14} className="animate-spin" /> Working...</> : confirmLabel}
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={onCancel}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeCard({ title, detail, badge, active = false, disabled = false }: { title: string; detail: string; badge: string; active?: boolean; disabled?: boolean }) {
  return (
    <div aria-disabled={disabled} className={cn("rounded-md border p-4", active ? "border-aura-accent/45 bg-aura-accent/[0.08]" : "border-white/[0.08] bg-white/[0.015] opacity-70")}>
      <div className="flex items-center justify-between gap-3">
        <div className={cn("text-sm font-semibold", active ? "text-white" : "text-white/55")}>{title}</div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]", active ? "border-aura-long/25 bg-aura-long/[0.08] text-aura-long" : "border-aura-wait/25 bg-aura-wait/[0.08] text-aura-wait")}>{badge}</span>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-white/35">{detail}</p>
    </div>
  );
}

function SettingsSelect({ label, value, options, onChange, saving = false, disabled = false }: { label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void; saving?: boolean; disabled?: boolean }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-white/65">
      <span className="flex items-center justify-between gap-2">{label}{saving && <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-aura-accent">Saving...</span>}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white disabled:opacity-60">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SettingsToggle({ title, detail, checked, onChange, saving = false, disabled = false }: { title: string; detail: string; checked: boolean; onChange: (next: boolean) => void; saving?: boolean; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] py-3.5 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white/68">{title}</div>
        <div className="mt-0.5 text-[11px] leading-5 text-white/32">{saving ? "Saving..." : detail}</div>
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={title} disabled={disabled} onClick={() => onChange(!checked)} className={cn("focus-ring mt-1 grid h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-60", checked ? "border-aura-accent/50 bg-aura-accent/30" : "border-white/[0.12] bg-white/[0.04]")}>
        <span className={cn("h-3.5 w-3.5 rounded-full bg-white transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} style={{ marginTop: 1.5 }} />
      </button>
    </div>
  );
}

function SettingsSkeleton({ rows }: { rows: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-md bg-white/[0.04]" />)}</div>;
}

/**
 * Profile editor. Persists through PATCH /api/wallet/account, which resolves the
 * owner from the authenticated session, then asks the wallet provider to reload
 * the account so the workspace reflects the change without a page refresh.
 *
 * The photo is the one field that saves on its own: an upload writes the file to
 * the profile-avatars bucket and immediately persists the resulting public URL,
 * so every avatar surface updates straight away. It deliberately sends the
 * already-saved values for the other fields, so an unsaved name or bio edit is
 * not committed as a side effect of changing the photo.
 */
function ProfileEditor({ profile, onClose, onSaved, onAvatarSaved }: { profile: WalletProfile; onClose: () => void; onSaved: () => void | Promise<void>; onAvatarSaved: () => void | Promise<void> }) {
  const wallet = useWallet();
  const session = wallet.session;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    avatarStyle: profile.avatarStyle,
    avatarUrl: profile.avatarUrl,
    timezone: profile.timezone,
    language: profile.language,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingPhoto, setRemovingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The last username the database said was taken, kept in canonical form. */
  const [takenUsername, setTakenUsername] = useState<string | null>(null);
  const photoBusy = uploading || removingPhoto;

  const update = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  // What would actually be stored, so a leading @, mixed case and stray
  // whitespace all count as the same edit.
  const username = normalizeUsername(draft.username);
  const savedUsername = normalizeUsername(profile.username);

  // Mirrors profileUpdateSchema so problems surface before the request. The
  // server re-validates every field regardless of what the client checked.
  const validationError = useMemo(() => {
    const name = draft.displayName.trim();
    if (name.length < 2) return "Display name must be at least 2 characters";
    if (name.length > 40) return "Display name must be 40 characters or fewer";
    const usernameIssue = usernameFormatIssue(normalizeUsername(draft.username));
    if (usernameIssue) return usernameIssue;
    if (draft.bio.trim().length > 240) return "Bio must be 240 characters or fewer";
    return null;
  }, [draft]);

  /**
   * Availability while typing. It has to go through the API: the
   * profiles_select_own policy hides other users' rows from the browser, so a
   * direct query would call every taken name free. Purely a courtesy -- the
   * PATCH re-checks and the unique index on lower(username) decides -- so a
   * failed probe is swallowed rather than blocking a save that might succeed.
   */
  useEffect(() => {
    if (!session || !username || username === savedUsername) return;
    if (usernameFormatIssue(username)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void api<{ available: boolean }>(`/api/wallet/username?username=${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((result) => { if (!cancelled) setTakenUsername(result.available ? null : username); })
        .catch(() => { /* the save path asks the database again */ });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [session, username, savedUsername]);

  // Only blocks the exact name the database rejected, so editing it frees Save.
  const usernameTaken = username !== null && username === takenUsername;
  const blockingError = validationError ?? (usernameTaken ? USERNAME_TAKEN_MESSAGE : null);

  const submit = useCallback(async () => {
    if (!session) return;
    if (blockingError) { setError(blockingError); return; }
    setSaving(true);
    setError(null);
    try {
      await api("/api/wallet/account", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          displayName: draft.displayName.trim(),
          username,
          bio: draft.bio.trim(),
          avatarStyle: draft.avatarStyle,
          avatarUrl: draft.avatarUrl,
          timezone: draft.timezone,
          language: draft.language,
        },
      });
      await onSaved();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save profile";
      // Claimed in the meantime, or between the check and the write. Recording it
      // as the taken name rather than as a generic error keeps the message tied
      // to the field, so it clears itself as soon as the username is edited.
      if (message === USERNAME_TAKEN_MESSAGE && username) setTakenUsername(username);
      else setError(message);
    } finally {
      setSaving(false);
    }
  }, [blockingError, draft, onSaved, session, username]);

  /**
   * Writes only the photo, keeping every other field at its persisted value.
   * The API re-checks that the URL sits in this user's own bucket folder.
   */
  const persistAvatarUrl = useCallback(async (avatarUrl: string | null) => {
    if (!session) throw new Error("Wallet session required to save the photo");
    await api("/api/wallet/account", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: {
        displayName: profile.displayName,
        username: savedUsername,
        bio: profile.bio,
        avatarStyle: profile.avatarStyle,
        avatarUrl,
        timezone: profile.timezone,
        language: profile.language,
      },
    });
  }, [profile, savedUsername, session]);

  const uploadPhoto = useCallback(async (file: File) => {
    const invalid = profileAvatarFileError(file);
    if (invalid) { setError(invalid); return; }
    const previousUrl = profile.avatarUrl;
    setUploading(true);
    setError(null);
    try {
      const publicUrl = await uploadProfileAvatar(profile.id, file);
      try {
        await persistAvatarUrl(publicUrl);
      } catch (saveError) {
        // Nothing points at the new object yet, so drop it rather than leaving an
        // orphan behind in the bucket.
        await removeProfileAvatar(profile.id, publicUrl);
        throw saveError;
      }
      setDraft((current) => ({ ...current, avatarUrl: publicUrl }));
      if (previousUrl && previousUrl !== publicUrl) {
        await removeProfileAvatar(profile.id, previousUrl);
      }
      await onAvatarSaved();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the image");
    } finally {
      setUploading(false);
    }
  }, [onAvatarSaved, persistAvatarUrl, profile.avatarUrl, profile.id]);

  /** Clears the photo and falls back to the selected AURA avatar style. */
  const removePhoto = useCallback(async () => {
    const previousUrl = profile.avatarUrl ?? draft.avatarUrl;
    setRemovingPhoto(true);
    setError(null);
    try {
      await persistAvatarUrl(null);
      setDraft((current) => ({ ...current, avatarUrl: null }));
      await removeProfileAvatar(profile.id, previousUrl);
      await onAvatarSaved();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove the photo");
    } finally {
      setRemovingPhoto(false);
    }
  }, [draft.avatarUrl, onAvatarSaved, persistAvatarUrl, profile.avatarUrl, profile.id]);

  const accent = profileAvatarAccent(draft.avatarStyle);
  return (
    <div className="fixed inset-0 z-[250] grid items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm sm:py-14">
      <div className="my-auto w-full max-w-lg rounded-lg border border-white/[0.1] bg-[#090c16] shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div><div className="section-kicker">AURA ARENA</div><h2 className="mt-1 font-display text-lg font-bold">Edit profile</h2></div>
          <button type="button" title="Close" aria-label="Close" onClick={onClose} className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-white/45 hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={photoBusy || saving}
              title={draft.avatarUrl ? "Change photo" : "Upload photo"}
              aria-label={draft.avatarUrl ? "Change profile photo" : "Upload profile photo"}
              className="focus-ring group relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border disabled:cursor-not-allowed"
              style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}14` }}
            >
              <ProfileAvatar
                avatarUrl={draft.avatarUrl}
                displayName={draft.displayName}
                className="h-full w-full"
                fallback={<span className="font-display text-xl font-bold">{(draft.displayName || "A").slice(0, 1).toUpperCase()}</span>}
              />
              <span className="absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera size={16} /></span>
              {photoBusy && <span className="absolute inset-0 grid place-items-center bg-black/70 text-white"><RefreshCw size={16} className="animate-spin" /></span>}
            </button>
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold text-white">{draft.displayName || "Your name"}</div>
              <div className="truncate font-mono text-[11px] text-aura-accent">{username ? `@${username}` : "no username"}</div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={photoBusy || saving} className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.035] px-2.5 text-[11px] font-semibold text-white/70 hover:bg-white/[0.06] hover:text-white disabled:opacity-60">
                  {uploading ? <><RefreshCw size={12} className="animate-spin" /> Uploading...</> : <><Upload size={12} /> {draft.avatarUrl ? "Change photo" : "Upload photo"}</>}
                </button>
                {draft.avatarUrl && (
                  <button type="button" onClick={() => void removePhoto()} disabled={photoBusy || saving} className="focus-ring inline-flex h-7 items-center rounded-md px-2 text-[11px] font-semibold text-white/40 hover:text-aura-short disabled:opacity-60">
                    {removingPhoto ? "Removing..." : "Remove"}
                  </button>
                )}
              </div>
              <div className="mt-1.5 text-[9px] leading-4 text-white/25">JPG, PNG, WEBP or GIF. Up to 5 MB. Without a photo your avatar style is used.</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={PROFILE_AVATAR_ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Cleared so re-picking the same file still fires a change event.
                event.target.value = "";
                if (file) void uploadPhoto(file);
              }}
            />
          </div>

          {photoBusy && (
            <div role="progressbar" aria-label={uploading ? "Uploading profile photo" : "Removing profile photo"} className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-full animate-pulse rounded-full bg-aura-accent/70" />
            </div>
          )}

          <label className="grid gap-1.5 text-xs font-semibold text-white/65">Display name
            <input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} maxLength={40} placeholder="Your arena name" className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white" />
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-white/65">Username
            <input value={draft.username ?? ""} onChange={(event) => update("username", event.target.value)} maxLength={20} placeholder="lowercase_handle" className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 font-mono text-sm text-white" />
            <span className="text-[9px] font-normal text-white/25">3-20 characters. Letters, numbers and underscores. Leave blank to remove.</span>
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-white/65">Bio
            <textarea value={draft.bio} onChange={(event) => update("bio", event.target.value)} maxLength={240} rows={3} placeholder="How do you trade?" className="focus-ring resize-none rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm leading-6 text-white" />
            <span className="text-right text-[9px] font-normal text-white/25">{draft.bio.length}/240</span>
          </label>

          <div>
            <div className="mb-1.5 text-xs font-semibold text-white/65">Avatar / style</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              <button type="button" aria-pressed={draft.avatarStyle === null} onClick={() => update("avatarStyle", null)} className={cn("focus-ring grid place-items-center gap-1 rounded-lg border px-2 py-2", draft.avatarStyle === null ? "border-white/30 bg-white/[0.08]" : "border-white/[0.08] bg-white/[0.015]")}>
                <span className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.1] text-xs font-bold text-aura-accent">A</span>
                <span className="text-[9px] text-white/40">Default</span>
              </button>
              {PROFILE_AVATAR_STYLES.map((style) => (
                <button key={style.value} type="button" aria-pressed={draft.avatarStyle === style.value} onClick={() => update("avatarStyle", style.value as CustomAgentAvatarStyle)} className={cn("focus-ring grid place-items-center gap-1 rounded-lg border px-2 py-2", draft.avatarStyle === style.value ? "border-white/30 bg-white/[0.08]" : "border-white/[0.08] bg-white/[0.015]")}>
                  <span className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.1] text-xs font-bold" style={{ color: style.accent }}>{style.label.slice(0, 1)}</span>
                  <span className="text-[9px] text-white/40">{style.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsSelect label="Timezone" value={draft.timezone} options={TIMEZONE_OPTIONS} onChange={(value) => update("timezone", value)} />
            <SettingsSelect label="Preferred language" value={draft.language} options={LANGUAGE_OPTIONS} onChange={(value) => update("language", value)} />
          </div>

          {(error ?? blockingError) && <InlineNotice tone="warning" icon={<AlertTriangle size={14} />}>{error ?? blockingError}</InlineNotice>}

          <div className="flex flex-col gap-2 border-t border-white/[0.07] pt-4 sm:flex-row-reverse">
            <Button className="w-full sm:w-auto" disabled={saving || Boolean(blockingError)} onClick={() => void submit()}>
              {saving ? <><RefreshCw size={15} className="animate-spin" /> Saving...</> : <><Save size={15} /> Save Changes</>}
            </Button>
            <Button variant="secondary" className="w-full sm:w-auto" disabled={saving} onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
