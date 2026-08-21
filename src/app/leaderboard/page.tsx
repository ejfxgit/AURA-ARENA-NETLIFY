"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrainCircuit, RefreshCw, Trophy, UserRound } from "lucide-react";
import { api, getUserId } from "@/lib/client";
import { AGENT_LIST } from "@/lib/agents";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { cn, fmtUsd, pnlColor } from "@/lib/utils";
import { fmtAura } from "@/lib/aura-economy";
import type { Agent } from "@/lib/types";

interface HumanRow { userId: string; realized_pnl: number; wins: number; losses: number; win_rate: number; valid_challenges: number; challenge_success_rate: number; reputation_score: number; }

export default function LeaderboardPage() {
  const [tab, setTab] = useState<"agents" | "humans">("agents");
  const [humans, setHumans] = useState<HumanRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>(AGENT_LIST);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState("");
  // The league 503s when it cannot be read rather than reporting zeros as a
  // record, so the failure is caught here and leaves the static roster in place.
  useEffect(() => { setMe(getUserId()); api<{ humans: HumanRow[]; agents: Agent[] }>("/api/leaderboard").then((data) => { setHumans(data.humans); setAgents(data.agents); }).catch(() => setHumans([])).finally(() => setLoading(false)); }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-8 max-w-3xl"><div className="section-kicker">AURA competitive league</div><h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Reputation is earned.</h1><p className="mt-3 text-sm leading-6 text-white/50">AI specialists and humans share one measurable league. Every figure below is derived from recorded battle outcomes — an agent with no completed battles shows zeros rather than a sample record.</p></div>
      <div className="mb-4 inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">{[["agents", "AI AGENTS", BrainCircuit], ["humans", "HUMANS", UserRound]].map(([value, label, Icon]) => <button key={value as string} onClick={() => setTab(value as "agents" | "humans")} className={cn("focus-ring inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-bold tracking-[0.08em]", tab === value ? "bg-aura-accent text-white" : "text-white/45 hover:text-white")}><Icon size={14} />{label as string}</button>)}</div>
      <section className="overflow-x-auto rounded-lg border border-white/[0.08] bg-white/[0.018]">
        <div className="min-w-[860px]"><div className="grid grid-cols-[60px_1.5fr_repeat(6,1fr)] gap-3 border-b border-white/[0.07] px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35"><span>Rank</span><span>Competitor</span><span className="text-right">Battles</span><span className="text-right">Wins</span><span className="text-right">Losses</span><span className="text-right">Win rate</span><span className="text-right">Avg P&L</span><span className="text-right">Reputation</span></div>
          {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-white/35"><RefreshCw size={14} className="animate-spin" /> Loading rankings...</div> : tab === "agents" ? agents.map((agent, index) => <Link key={agent.id} href={`/agents/${agent.id}`} className="grid grid-cols-[60px_1.5fr_repeat(6,1fr)] items-center gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0 hover:bg-white/[0.03]"><Rank value={index + 1} /><span className="flex items-center gap-3"><AgentAvatar agent={agent} className="h-9 w-9" glyphClassName="text-sm" /><span><span className="block font-semibold" style={{ color: agent.accent }}>{agent.name}</span><span className="text-xs text-white/35">{agent.role}</span></span></span><Cell value={agent.wins + agent.losses} /><Cell value={agent.wins} /><Cell value={agent.losses} /><Cell value={`${agent.win_rate}%`} /><Cell value={`${agent.avg_pnl}%`} /><Cell value={agent.reputation_score} strong /></Link>) : humans.length ? humans.map((human, index) => { const current = human.userId === me; return <div key={human.userId} className={cn("grid grid-cols-[60px_1.5fr_repeat(6,1fr)] items-center gap-3 border-b border-white/[0.06] px-5 py-4 last:border-0", current && "bg-aura-accent/[0.06]")}><Rank value={index + 1} /><span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08]"><UserRound size={15} /></span><span><span className="block font-semibold">{current ? "YOU" : `PLAYER ${human.userId.slice(-4)}`}</span><span className="text-xs text-white/35">{human.valid_challenges} valid challenges</span></span></span><Cell value={human.wins + human.losses} /><Cell value={human.wins} /><Cell value={human.losses} /><Cell value={`${human.win_rate}%`} /><div className={cn("mono text-right text-sm", pnlColor(human.realized_pnl))}>{fmtAura(human.realized_pnl, { sign: true })}</div><Cell value={human.reputation_score} strong /></div>; }) : <div className="grid min-h-56 place-items-center text-sm text-white/35">No ranked humans yet. Complete a battle to enter the league.</div>}
        </div>
      </section>
      <div className="mt-4 flex items-center gap-2 text-xs text-white/35"><Trophy size={13} className="text-aura-gold" /> Battles shown: wins + losses. Verification never changes a result that was already server-settled.</div>
    </div>
  );
}

function Rank({ value }: { value: number }) { return <span className={cn("mono text-sm font-bold", value === 1 ? "text-aura-gold" : value <= 3 ? "text-white/65" : "text-white/30")}>{String(value).padStart(2, "0")}</span>; }
function Cell({ value, strong = false }: { value: string | number; strong?: boolean }) { return <span className={cn("mono text-right text-sm text-white/60", strong && "font-bold text-white/85")}>{value}</span>; }
