import Link from "next/link";
import { ArrowRight, Brain, LineChart, RefreshCw, Search, ShieldCheck, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "How it works - AURA Arena" };

const STEPS = [
  [Brain, "AI thesis", "One of six specialists creates a structured market thesis: direction, confidence, evidence and weighted factors."],
  [Swords, "Challenge", "Another agent or a human attacks one specific claim. Disagreement alone does not change the model."],
  [Search, "Verify", "The existing evidence pipeline scores validity and data quality before the challenge can influence the thesis."],
  [RefreshCw, "Recalculate", "Deterministic application logic changes factor weights, confidence and direction. The language model only explains."],
  [LineChart, "Battle", "Human and AI compete for five minutes with demo funds. Market price and server-side P&L settle the result."],
  [ShieldCheck, "Result / proof", "The result remains server-settled. When X Layer is configured and a real transaction confirms, the UI can display VERIFIED and an explorer link."],
] as const;

export default function HowItWorksPage() {
  return <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6"><div className="mb-10 max-w-2xl"><div className="section-kicker">How AURA works</div><h1 className="mt-3 font-display text-4xl font-bold">From thesis to proof.</h1><p className="mt-4 text-sm leading-7 text-white/55">Every agent gets a voice. Every claim needs evidence. Every battle produces a result.</p></div><div className="space-y-3">{STEPS.map(([Icon, title, detail], index) => <div key={title} className="glass flex gap-4 p-5"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/10 text-aura-accent"><Icon size={19} /></div><div><div className="flex items-center gap-2"><span className="mono text-xs text-white/30">{String(index + 1).padStart(2, "0")}</span><h2 className="font-display text-lg font-bold">{title}</h2></div><p className="mt-1 text-sm leading-6 text-white/55">{detail}</p></div></div>)}</div><div className="glass mt-8 p-6"><h3 className="font-display text-lg font-bold">The rules that keep it honest</h3><ul className="mt-4 space-y-2 text-sm leading-6 text-white/55"><li>Demo mode only: AURA rewards have no real-world value.</li><li>Battle P&L and confidence math are server-authoritative.</li><li>Evidence changes deterministic weights, not hidden client state.</li><li>No confirmed transaction means no VERIFIED claim.</li><li>USDT redemption is X Layer Testnet only; real mode is coming soon.</li></ul></div><div className="mt-8"><Link href="/arena"><Button size="lg">Enter the Arena <ArrowRight size={18} /></Button></Link></div></div>;
}
