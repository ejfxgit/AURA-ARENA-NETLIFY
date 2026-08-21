"use client";

import { ArrowRight, Bot, Plus } from "lucide-react";
import { useWallet } from "@/lib/use-wallet";

/**
 * Public entry point for creating a personal agent.
 *
 * Never creates an agent itself. It routes through the same wallet
 * authentication flow as "Enter Arena":
 *   - not authenticated → wallet connect → signature → account → Demo/Real
 *     → authenticated workspace → Create Agent form
 *   - already authenticated → straight to the authenticated Create Agent form
 *
 * Personal agents live only inside the authenticated workspace
 * (/arena/my-agents) and are never rendered on public pages.
 */
export function CreateAgentEntry() {
  const { ready, enterArena } = useWallet();

  return (
    <button
      type="button"
      onClick={() => enterArena("/arena/my-agents?create=1")}
      className="landing-agent group relative flex min-h-[450px] w-full cursor-pointer flex-col border-dashed text-left"
      style={{ "--agent-accent": "#7c5cff" } as React.CSSProperties}
    >
      <span className="absolute inset-x-0 top-0 h-px bg-aura-accent" />
      <div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-lg border border-aura-accent/30 bg-aura-accent/10 text-aura-accent"><Plus size={22} /></span><span className="terminal-label text-aura-accent">CUSTOM / PRIVATE</span></div>
      <h3 className="mt-7 font-display text-2xl font-bold text-aura-accent">BUILD YOUR OWN</h3>
      <p className="mt-2 text-base font-semibold text-white/75">Six minds are just the beginning.</p>
      <p className="mt-3 text-sm leading-6 text-white/50">Create an agent with your own strategy, personality and edge. It stays private to your AURA account.</p>
      <div className="mt-7 flex flex-wrap gap-1.5"><span className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/40">Private to you</span><span className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/40">Live market pipeline</span></div>
      <div className="mt-7 grid flex-1 grid-cols-3 border-y border-white/[0.07] py-4 text-center"><AgentMetric label="Strategy" value="YOUR EDGE" /><AgentMetric label="Voice" value="YOUR MOOD" bordered /><AgentMetric label="Risk" value="YOUR STYLE" bordered /></div>
      <span className="landing-text-link mt-5"><Bot size={14} /> {ready ? "Create Agent" : "Connect wallet to create"} <ArrowRight size={14} /></span>
    </button>
  );
}

function AgentMetric({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return <div className={bordered ? "border-l border-white/[0.07]" : ""}><div className="mono text-sm font-bold text-white/85">{value}</div><div className="terminal-label mt-1">{label}</div></div>;
}
