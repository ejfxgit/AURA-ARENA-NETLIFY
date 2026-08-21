import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Brain, MessageSquareQuote, ShieldCheck, Swords, Target, TrendingUp } from "lucide-react";
import { AGENTS, AGENT_LIST } from "@/lib/agents";
import { AGENT_WEIGHTS } from "@/lib/ai/factors";
import { FACTOR_LABELS } from "@/lib/engine/recalc";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import type { AgentId, FactorName } from "@/lib/types";

export function generateStaticParams() { return AGENT_LIST.map((agent) => ({ agentId: agent.id })); }

export default function AgentDetailPage({ params }: { params: { agentId: string } }) {
  const agent = AGENTS[params.agentId as AgentId];
  if (!agent) notFound();
  const weights = AGENT_WEIGHTS[agent.id];
  const total = agent.wins + agent.losses;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <Link href="/agents" className="mb-6 inline-flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white/80"><ArrowLeft size={15} /> All agents</Link>
      <div className="relative overflow-hidden rounded-lg border bg-white/[0.02] p-6 sm:p-8" style={{ borderColor: `${agent.accent}55` }}>
        <span className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: agent.accent }} />
        <div className="flex flex-wrap items-center gap-5"><AgentAvatar agent={agent} className="h-20 w-20 sm:h-24 sm:w-24" glyphClassName="text-4xl" /><div className="min-w-[220px] flex-1"><div className="terminal-label">AURA specialist / demo record</div><h1 className="mt-1 font-display text-3xl font-bold sm:text-4xl" style={{ color: agent.accent }}>{agent.name}</h1><div className="mt-1 text-sm font-semibold text-white/60">{agent.role}</div><p className="mt-2 text-sm text-white/45">{agent.personality}</p></div><Link href={`/arena?agent=${agent.id}`}><Button><Swords size={16} /> Challenge {agent.name}</Button></Link></div>
        <p className="mt-6 max-w-3xl text-sm leading-7 text-white/65">{agent.description}</p>
        <blockquote className="mt-5 flex max-w-3xl gap-3 border-l-2 pl-4 text-lg italic leading-7 text-white/80" style={{ borderColor: agent.accent }}><MessageSquareQuote size={18} className="mt-1 shrink-0" style={{ color: agent.accent }} />{agent.voice}</blockquote>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"><StatBox icon={<TrendingUp size={15} />} label="Win rate" value={`${agent.win_rate}%`} /><StatBox icon={<Target size={15} />} label="Record" value={`${agent.wins}-${agent.losses}`} /><StatBox icon={<TrendingUp size={15} />} label="Avg P&L" value={`${agent.avg_pnl}%`} /><StatBox icon={<Brain size={15} />} label="Reputation" value={agent.reputation_score} /></div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.018] p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><div className="terminal-label">Current thesis</div><h2 className="mt-2 font-display text-xl font-bold">{agent.name} has no open thesis</h2></div><span className="rounded-full border px-2.5 py-1 text-[9px] font-bold tracking-[0.12em]" style={{ borderColor: `${agent.accent}55`, color: agent.accent }}>{agent.current_status}</span></div><p className="mt-5 text-base leading-7 text-white/75">A direction and a confidence percentage exist only once {agent.name} has analysed a live market. Open any <Link href="/markets" className="underline decoration-white/25 hover:text-white">OKX market</Link> and run the agent to get a real thesis from real prices and candles.</p><div className="mt-5 flex items-end justify-between border-t border-white/[0.07] pt-4"><div><div className="terminal-label">AI signal</div><div className="mono mt-1 text-lg font-bold text-white/45">AI signal unavailable</div></div><div className="text-right"><div className="terminal-label">Recorded result</div><div className="mt-1 text-sm text-white/55">{agent.recent_battle}</div></div></div></section>
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.018] p-5 sm:p-6"><div className="terminal-label">Evidence focus</div><div className="mt-4 grid gap-2">{agent.evidence.map((item, index) => <div key={item} className="flex items-center gap-3 rounded-md border border-white/[0.07] bg-white/[0.018] px-3 py-2.5"><span className="mono text-[10px]" style={{ color: agent.accent }}>0{index + 1}</span><span className="text-sm text-white/65">{item}</span><ShieldCheck size={13} className="ml-auto text-white/20" /></div>)}</div></section>
      </div>

      <section className="mt-5 rounded-lg border border-white/[0.08] bg-white/[0.018] p-5 sm:p-6"><h2 className="font-display text-lg font-bold">How {agent.name} weighs the market</h2><p className="mt-1 text-sm text-white/50">Base deterministic factor weights before a verified challenge changes the thesis.</p><div className="mt-5 space-y-3">{(Object.entries(weights) as [FactorName, number][]).filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1]).map(([name, weight]) => { const pct = Math.round(weight * 100); return <div key={name} className="flex items-center gap-3"><span className="w-24 shrink-0 text-xs text-white/55">{FACTOR_LABELS[name]}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: agent.accent }} /></div><span className="mono w-10 text-right text-xs font-semibold text-white/70">{pct}%</span></div>; })}</div><div className="mt-5 border-t border-white/[0.07] pt-4 text-xs text-white/35">{total} demo historical battles on the roster record. Runtime battles are added by the existing leaderboard engine.</div></section>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) { return <div className="glass-soft p-3"><div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40">{icon} {label}</div><div className="mono text-lg font-bold">{value}</div></div>; }
