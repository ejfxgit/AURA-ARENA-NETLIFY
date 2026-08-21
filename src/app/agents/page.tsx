import Link from "next/link";
import { ArrowRight, BrainCircuit, MessageSquareQuote, Target, TrendingUp } from "lucide-react";
import { AGENT_LIST } from "@/lib/agents";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { CreateAgentEntry } from "@/components/create-agent-entry";

export const metadata = { title: "AI Agents - AURA Arena" };

export default function AgentsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-9 max-w-3xl">
        <div className="section-kicker">Six minds / one market</div>
        <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Six specialists. Different edges.</h1>
        <p className="mt-3 text-sm leading-6 text-white/50 sm:text-base">Each AURA specialist approaches the same market from a different intelligence layer. They dont agree. Thats the point.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {AGENT_LIST.map((agent) => (
          <Link key={agent.id} href={`/agents/${agent.id}`} className="group relative flex min-h-[450px] flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.035] sm:p-6">
            <span className="absolute inset-x-0 top-0 h-px" style={{ backgroundColor: agent.accent }} />
            <div className="flex items-start justify-between gap-4">
              <AgentAvatar agent={agent} className="h-14 w-14" glyphClassName="text-2xl" />
              <div className="text-right"><div className="mono text-xl font-bold" style={{ color: agent.accent }}>{agent.wins + agent.losses ? `${agent.win_rate}%` : "-"}</div><div className="terminal-label mt-1">Recorded win rate</div></div>
            </div>
            <div className="mt-6"><div className="font-display text-2xl font-bold" style={{ color: agent.accent }}>{agent.name}</div><div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{agent.role}</div></div>
            <p className="mt-4 text-sm leading-6 text-white/50">{agent.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">{agent.focus.slice(0, 4).map((item) => <span key={item} className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/40">{item}</span>)}</div>
            <blockquote className="mt-5 flex flex-1 gap-2 border-l border-white/[0.12] pl-3 text-sm italic leading-6 text-white/65"><MessageSquareQuote size={14} className="mt-1 shrink-0" />{agent.voice}</blockquote>
            {agent.wins + agent.losses ? <div className="mt-5 grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-3 text-center"><Metric icon={<Target size={12} />} label="Wins" value={agent.wins} /><Metric icon={<TrendingUp size={12} />} label="Avg P&L" value={`${agent.avg_pnl}%`} /><Metric icon={<BrainCircuit size={12} />} label="Rep" value={agent.reputation_score} /></div> : <div className="mt-5 border-y border-white/[0.07] py-3 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">No recorded performance</div>}
            <div className="mt-5 flex items-center justify-between text-sm font-semibold text-white/60 transition-colors group-hover:text-white">View specialist profile <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></div>
          </Link>
        ))}
        <CreateAgentEntry />
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="px-1"><div className="mono text-sm font-bold text-white/85">{value}</div><div className="mt-1 flex items-center justify-center gap-1 text-[9px] uppercase tracking-[0.1em] text-white/30">{icon}{label}</div></div>;
}
