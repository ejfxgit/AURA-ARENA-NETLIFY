"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, History as HistoryIcon, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { useWallet } from "@/lib/use-wallet";
import { getBattleAgent } from "@/lib/battle-agents";
import { fmtAura } from "@/lib/aura-economy";
import { cn, formatPair, pnlColor } from "@/lib/utils";
import { DirectionBadge } from "@/components/ui/direction-badge";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { Button } from "@/components/ui/button";
import type { Battle } from "@/lib/types";

type Filter = "ALL" | "AI" | "HUMAN" | "VERIFIED" | "PENDING";

export default function HistoryPage() {
  const wallet = useWallet();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  useEffect(() => {
    if (wallet.initializing) return;
    if (!wallet.ready) {
      setLoading(false);
      wallet.openConnect();
      return;
    }
    api<{ battles: Battle[] }>("/api/battles?scope=mine")
      .then((data) => setBattles(data.battles.filter((battle) => battle.status === "FINISHED" || battle.status === "VERIFIED" || battle.status === "SETTLING").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())))
      .finally(() => setLoading(false));
  }, [wallet, wallet.initializing, wallet.ready]);
  const visible = useMemo(() => battles.filter((battle) => filter === "ALL" || filter === "AI" || filter === "HUMAN" || (filter === "VERIFIED" ? battle.xlayer_status === "VERIFIED" && Boolean(battle.xlayer_tx_hash) : battle.xlayer_status !== "VERIFIED")), [battles, filter]);

  return <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10"><div className="mb-8 max-w-2xl"><div className="section-kicker">Battle record</div><h1 className="mt-2 font-display text-3xl font-bold">Every battle leaves a record.</h1><p className="mt-3 text-sm leading-6 text-white/50">The same battle records power Arena, History, reputation and verification. No disconnected result datasets.</p></div><div className="mb-5 flex flex-wrap gap-2">{(["ALL", "AI", "HUMAN", "VERIFIED", "PENDING"] as Filter[]).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={cn("focus-ring rounded-lg border px-3 py-2 text-[10px] font-bold tracking-[0.12em]", filter === value ? "border-aura-accent/40 bg-aura-accent/10 text-white" : "border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white")}>{value}</button>)}</div>{loading ? <div className="flex min-h-64 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.015] text-sm text-white/35"><RefreshCw size={14} className="animate-spin" /> Loading battle record...</div> : visible.length === 0 ? <EmptyHistory /> : <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.015]">{visible.map((battle) => <HistoryRow key={battle.id} battle={battle} />)}</div>}</div>;
}

function HistoryRow({ battle }: { battle: Battle }) {
  const agent = getBattleAgent(battle); const won = battle.winner === "HUMAN"; const draw = battle.winner === "DRAW"; const verified = battle.xlayer_status === "VERIFIED" && Boolean(battle.xlayer_tx_hash);
  return <Link href={`/arena/${battle.id}`} className="group grid gap-4 border-b border-white/[0.06] px-4 py-4 last:border-0 hover:bg-white/[0.03] sm:grid-cols-[minmax(200px,1fr)_minmax(190px,1fr)_auto] sm:items-center sm:px-5"><div className="flex min-w-0 items-center gap-3"><AgentAvatar agent={agent} className="h-10 w-10" glyphClassName="text-sm" /><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-semibold">{formatPair(battle.asset)}</span>{verified && <ShieldCheck size={13} className="text-aura-long" />}</div><div className="mt-1 text-xs text-white/35">{agent.name} vs HUMAN · {new Date(battle.createdAt).toLocaleString()}</div><div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">{battle.xlayer_status || "UNCONFIGURED"}</div></div></div><div className="flex items-center gap-3"><DirectionBadge direction={battle.human_direction} size="sm" /><span className="text-xs text-white/25">vs</span><DirectionBadge direction={battle.ai_direction} size="sm" /><span className="mono text-xs text-white/35">{battle.ai_confidence_before}% to {battle.ai_confidence_after}%</span></div><div className="flex items-center justify-between gap-5 sm:justify-end"><div className="text-right"><div className={cn("text-sm font-bold", won ? "text-aura-long" : draw ? "text-white/60" : "text-aura-short")}>{won ? "HUMAN WON" : draw ? "DRAW" : "AI WON"}</div><div className={cn("mono mt-1 text-xs", pnlColor(battle.human_pnl))}>{fmtAura(battle.human_pnl, { sign: true })}</div></div><ChevronRight size={16} className="text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-aura-accent" /></div></Link>;
}

function EmptyHistory() { return <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018] px-6 py-14 text-center sm:py-20"><div className="pointer-events-none absolute inset-0 grid-bg opacity-25" /><div className="relative mx-auto max-w-md"><span className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-white/[0.08] bg-[#090c16] text-white/25"><HistoryIcon size={24} /></span><div className="mt-5 section-kicker">No matching settled battles</div><h2 className="mt-2 font-display text-2xl font-bold">Your arena record starts here.</h2><p className="mt-3 text-sm leading-6 text-white/45">Completed Human vs AI battles will appear here with the real result, final P&L, confidence change and verification state.</p><Link href="/arena" className="mt-6 inline-block"><Button>Enter Arena <ArrowRight size={16} /></Button></Link></div></div>; }
