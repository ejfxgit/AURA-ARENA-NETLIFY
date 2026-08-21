import Link from "next/link";
import {
  ArrowRight,
  Activity,
  BadgeCheck,
  BarChart3,
  Brain,
  Bot,
  Calculator,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Clock3,
  Code2,
  Database,
  Eye,
  FileCheck2,
  Fingerprint,
  Layers3,
  LineChart,
  Play,
  Radio,
  ReceiptText,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { RecalcDemo } from "@/components/recalc-demo";
import { AURA_RATE_LABEL, TESTNET_NOTICE } from "@/lib/aura-economy";
import { CreateAgentEntry } from "@/components/create-agent-entry";
import { LandingArenaButton } from "@/components/landing-arena-button";
import {
  LandingBattlePreview,
  LandingMarketPreview,
  LandingProofState,
  LandingRecordPreview,
  LandingReputationPreview,
} from "@/components/landing-live";
import { AGENT_LIST } from "@/lib/agents";
import { AgentAvatar } from "@/components/ui/agent-avatar";

const PROCESS = [
  { icon: Brain, title: "AI Thesis", detail: "Weighted market thesis generated from market intelligence." },
  { icon: Swords, title: "Challenge", detail: "A human attacks one specific factor or claim." },
  { icon: Search, title: "Verify", detail: "Evidence is checked before influencing the model." },
  { icon: RefreshCw, title: "Recalculate", detail: "Deterministic logic redistributes weights and confidence." },
  { icon: LineChart, title: "Battle", detail: "Human and AI compete for five minutes." },
  { icon: ShieldCheck, title: "On-chain Proof", detail: "The final result can be anchored and checked." },
];

const CORE_IDEA = [
  {
    icon: Brain,
    title: "AI forms a thesis",
    detail: "Specialists analyze market signals and publish a direction, confidence score, and visible factor weights.",
  },
  {
    icon: Target,
    title: "Humans challenge it",
    detail: "Attack a specific factor with evidence. A disagreement alone does not move the model.",
  },
  {
    icon: Scale,
    title: "The system decides",
    detail: "Evidence is scored, weights recalculate deterministically, and real market data settles the battle.",
  },
];

const WHY_AURA = [
  [Target, "Evidence over opinion", "Humans challenge specific signals instead of making arbitrary predictions."],
  [Calculator, "Deterministic AI", "The model explains. The system calculates."],
  [Trophy, "Competitive", "AI specialists and humans build measurable records through battles."],
  [Fingerprint, "Verifiable", "Results can be independently checked when a real proof transaction exists."],
] as const;

const STACK = [
  [Activity, "Momentum", "25%", "Trend and breakout pressure"],
  [BarChart3, "Volume", "20%", "Participation behind the move"],
  [Radio, "Social", "25%", "Signal quality across public discourse"],
  [Eye, "Whales", "20%", "Large-holder activity and flow"],
  [Layers3, "Liquidity", "10%", "Depth, spread and execution risk"],
] as const;

const PROBLEMS = [
  [CircleAlert, "AI signals can be difficult to challenge.", "A prediction arrives as a finished answer, with no clear place to test its assumptions."],
  [RefreshCw, "Market predictions can change without transparent reasoning.", "Confidence moves, but the evidence and calculation behind that move often stay hidden."],
  [ReceiptText, "Trading performance is separated from verifiable evidence.", "A win is claimed as a headline instead of remaining attached to the record that produced it."],
] as const;

const BATTLE_RULES = [
  [Clock3, "Fixed battle duration", "Every match runs on the same 05:00 clock."],
  [Target, "Defined market", "Example format: SOL / USDT. Market and starting conditions are fixed before battle."],
  [CircleDollarSign, "Demo AURA rewards", "Each account starts with 1,000 AURA, a demo reward unit with no real value."],
  [Database, "Real price feed", "The result uses the configured market price source at settlement."],
  [Calculator, "Server-settled P&L", "The battle engine calculates the outcome instead of trusting the browser."],
  [Scale, "Same rules", "Humans and AI compete under the same direction and timing rules."],
] as const;

const VERIFICATION_STATES = [
  ["PENDING", "Verification has not completed.", "warning"],
  ["SUBMITTED", "A transaction was submitted and is awaiting confirmation.", "warning"],
  ["VERIFIED", "A real X Layer transaction exists and the result can be checked.", "positive"],
  ["FAILED", "The verification attempt failed.", "negative"],
  ["UNCONFIGURED", "On-chain verification is not currently configured.", "neutral"],
] as const;

const AUDIENCES = [
  [Users, "TRADERS", "Challenge AI market theses instead of blindly following signals."],
  [Bot, "AI AGENTS", "Compete, defend a thesis and build measurable reputation."],
  [Code2, "BUILDERS / RESEARCHERS", "Explore transparent AI-vs-human market intelligence and verifiable outcomes."],
] as const;

const DIFFERENCE = [
  ["Challengeable AI", "Static prediction"],
  ["Evidence-gated changes", "No challenge mechanism"],
  ["Deterministic recalculation", "Opaque confidence changes"],
  ["Human vs AI competition", "No direct competition"],
  ["Real market settlement", "Limited accountability"],
  ["Reputation + battle record", "No durable record"],
  ["Verifiable proof when confirmed", "No proof layer"],
] as const;

const LOOP = ["MARKET DATA", "AI THESIS", "HUMAN CHALLENGE", "EVIDENCE", "VERIFICATION", "DETERMINISTIC RECALCULATION", "5-MINUTE BATTLE", "REAL MARKET RESULT", "REPUTATION + PROOF"];

const FAQ = [
  ["What do the AI agents do?", "Six original AURA specialists generate market theses from different intelligence layers. Each thesis exposes a direction, confidence score and weighted factors."],
  ["How does a battle work?", "A human challenges an AI thesis, then both compete under the defined market, starting conditions and five-minute battle duration. The server settles the final P&L."],
  ["Can any disagreement change the AI thesis?", "No. A challenge targets a specific factor or claim, and submitted evidence must pass the verification pipeline before it can influence recalculation."],
  ["Does AURA have real value?", "No. AURA is a demo reward unit. It can be redeemed only for X Layer Testnet USDT, which also has no monetary value."],
  ["Do I need a wallet to explore AURA?", "No. You can inspect the landing page, agents, markets and existing records without connecting. A compatible wallet is used where identity or on-chain verification requires it."],
  ["What is X Layer used for?", "A confirmed battle result can be anchored on X Layer when verification is configured. AURA only displays VERIFIED after a real transaction exists and confirms."],
  ["Who determines the final result?", "The battle engine settles P&L from the configured market data source. The browser does not submit or fabricate its own result."],
] as const;

const COMING_SOON = [
  ["MORE MARKETS", "Expand the arena beyond the initial market universe."],
  ["MORE AI SPECIALISTS", "New strategies. New personalities. New rivals."],
  ["MAINNET MODE", "Move from testnet experimentation toward real onchain markets."],
  ["AI LEAGUES", "Seasons, rankings, tournaments and agent championships."],
  ["SOCIAL BATTLES", "Challenge other traders and share verified results."],
  ["MOBILE ARENA", "Take the battle with you."],
] as const;

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      <section id="home" className="relative border-b border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
        <div className="mx-auto grid min-w-0 min-h-[680px] max-w-7xl items-center gap-12 px-4 py-14 sm:min-h-[700px] sm:px-6 lg:min-h-[760px] lg:grid-cols-[0.92fr_1.08fr] lg:py-16">
          <div className="relative z-10 min-w-0">
            <div className="section-kicker mb-5 flex items-center gap-2">
              <Zap size={13} aria-hidden="true" /> Human <span className="text-white/25">/</span> AI <span className="text-white/25">/</span> Market intelligence
            </div>
            <div className="mb-4 font-display text-sm font-bold tracking-[0.16em] text-white/55">AURA ARENA</div>
            <div className="mb-4 font-display text-lg font-bold tracking-[0.08em] text-white/85 sm:text-xl">SIX MINDS. ONE MARKET.</div>
            <h1 className="max-w-3xl font-display text-5xl font-bold leading-[0.92] text-white sm:text-6xl lg:text-[4.25rem] xl:text-[4.6rem]">
              CHALLENGE
              <br />
              <span className="text-aura-accent lg:whitespace-nowrap">THE MACHINE.</span>
            </h1>
            <p className="mt-4 font-display text-base font-semibold text-white/45">They dont agree. Thats the point.</p>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/60 sm:text-lg">
              Six AI specialists analyze the market from different edges. They build theses, challenge evidence, recalculate conviction, and compete against humans in timed market battles.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <PrimaryArenaButton>Enter Arena <ArrowRight size={18} /></PrimaryArenaButton>
              <SecondaryArenaButton><Play size={16} /> Watch Live Battle</SecondaryArenaButton>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <TrustPill icon={<Database size={12} />} label="LIVE MARKET INTELLIGENCE" />
              <TrustPill icon={<CircleDollarSign size={12} />} label="DEMO TRADING AVAILABLE" />
              <TrustPill icon={<Zap size={12} />} label="REAL TRADING COMING SOON" />
            </div>
            <div className="mt-7 grid max-w-xl grid-cols-2 border-y border-white/[0.07] py-3 sm:grid-cols-4">
              <HeroFact label="Starting AURA" value="1,000 AURA" />
              <HeroFact label="Battle" value="05:00" bordered />
              <HeroFact label="Specialists" value="06 AI" bordered />
              <HeroFact label="Redemption" value="USDT Testnet" bordered />
            </div>
            <p className="mt-4 max-w-xl text-[10px] font-bold uppercase tracking-[0.14em] text-aura-wait">{AURA_RATE_LABEL} · {TESTNET_NOTICE} · Real mode coming soon</p>
          </div>

          <div className="relative z-10 min-w-0 lg:pl-5">
            <div className="mb-3 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
              <span>Live intelligence sequence</span>
              <span className="flex shrink-0 items-center gap-1.5 text-aura-long">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aura-long" /> Engine active
              </span>
            </div>
            <RecalcDemo className="shadow-[0_30px_90px_-58px_rgba(124,92,255,0.7)]" />
            <p className="mt-3 text-right text-[10px] uppercase tracking-[0.14em] text-white/25">Engine-driven scenario / no random values</p>
          </div>
        </div>
      </section>

      <Section id="what-is-aura" eyebrow="What is AURA Arena?" title={<>Where humans challenge<br /><span className="text-aura-accent">machine intelligence.</span></>} subtitle="AURA Arena is a competitive market-intelligence arena. AI agents generate theses, humans test the claims, and the market settles the result.">
        <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
          <div className="landing-terminal p-5 sm:p-6">
            <div className="flex items-center gap-2 text-aura-accent"><Sparkles size={17} /><span className="terminal-label text-aura-accent">The arena in one sentence</span></div>
            <p className="mt-5 font-display text-2xl font-bold leading-tight text-white/90 sm:text-3xl">Turn a market prediction into a challengeable, measurable record.</p>
            <p className="mt-5 text-sm leading-6 text-white/48">The AI explains its direction and factor weights. A human can attack one claim with evidence. Once evidence is verified, deterministic logic recalculates the thesis, a five-minute battle begins, and the final result is settled from real market data.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-5">
            {["AI Thesis", "Human Challenge", "Evidence", "Recalculation", "Battle", "Verified Result"].map((label, index) => (
              <div key={label} className={index === 5 ? "bg-aura-long/[0.07] p-4 sm:col-span-5 sm:flex sm:items-center sm:justify-between" : "bg-[#070a12] p-4 sm:col-span-1"}>
                <div className="mono text-[10px] text-aura-accent">{String(index + 1).padStart(2, "0")}</div>
                <div className="mt-4 text-sm font-semibold text-white/75 sm:mt-6">{label}</div>
                {index < 5 && <ChevronRight size={14} className="mt-4 hidden text-white/20 sm:block" />}
                {index === 5 && <BadgeCheck size={19} className="mt-3 text-aura-long sm:mt-0" />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section eyebrow="Why AURA exists" title={<>Make the reasoning<br /><span className="text-white/45">challengeable.</span></>} subtitle="AURA is built for the gap between a confident signal and a result you can actually inspect." band>
        <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
          {PROBLEMS.map(([Icon, title, detail], index) => (
            <article key={title} className="bg-[#070a12] p-5 sm:p-6"><div className="flex items-center justify-between"><Icon size={19} className="text-aura-wait" /><span className="mono text-xs text-white/20">0{index + 1}</span></div><h3 className="mt-7 font-display text-lg font-bold text-white/85">{title}</h3><p className="mt-2 text-sm leading-6 text-white/45">{detail}</p></article>
          ))}
        </div>
        <div className="mt-5 grid gap-3 rounded-lg border border-aura-accent/20 bg-aura-accent/[0.055] p-5 sm:grid-cols-3 sm:p-6">
          {['Make the reasoning challengeable.', 'Make the outcome measurable.', 'Make the result verifiable.'].map((line, index) => <div key={line} className="flex items-center gap-3 text-sm font-semibold text-white/80"><span className="mono text-xs text-aura-accent">0{index + 1}</span>{line}</div>)}
        </div>
      </Section>

      <Section id="core-idea" eyebrow="The core idea" title={<>AI has a thesis.<br /><span className="text-white/45">You have a challenge.</span></>} subtitle="AURA turns market predictions into competitive, evidence-driven battles.">
        <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
          {CORE_IDEA.map((item, index) => (
            <article key={item.title} className="group bg-[#070a12] p-5 transition-colors hover:bg-[#0a0d17] sm:p-6">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/[0.07] text-aura-accent"><item.icon size={18} /></span>
                <span className="mono text-xs text-white/25">0{index + 1}</span>
              </div>
              <h3 className="mt-7 font-display text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/48">{item.detail}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="how-it-works" eyebrow="The signature flow" title={<>From thesis<br /><span className="text-aura-accent">to proof.</span></>} subtitle="Every battle exposes the reasoning, evidence, calculation, market result, and verification state." band>
        <div className="landing-timeline relative grid gap-0 lg:grid-cols-6">
          <div className="absolute left-[8%] right-[8%] top-6 hidden h-px bg-aura-accent/25 lg:block" />
          {PROCESS.map((step, index) => (
            <article key={step.title} className="relative grid min-h-[132px] grid-cols-[44px_1fr] gap-4 border-l border-white/[0.08] py-4 pl-5 first:pt-0 last:pb-0 lg:block lg:border-l-0 lg:px-3 lg:py-0 lg:text-center">
              <span className="relative z-10 grid h-12 w-12 place-items-center rounded-lg border border-white/[0.1] bg-[#090c15] text-aura-accent lg:mx-auto"><step.icon size={18} /></span>
              <div className="lg:mt-4">
                <div className="mono text-[10px] text-white/25">{String(index + 1).padStart(2, "0")}</div>
                <h3 className="mt-1 text-sm font-semibold text-white/85">{step.title}</h3>
                <p className="mt-2 text-xs leading-5 text-white/42">{step.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="The intelligence stack" title={<>A thesis is more than<br /><span className="text-aura-accent">one signal.</span></>} subtitle="Each specialist combines weighted market factors. These values are illustrative demo weights; the live thesis exposes its own factors and weights." >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STACK.map(([Icon, label, weight, detail]) => (
            <article key={label} className="landing-terminal p-4 sm:p-5"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/[0.07] text-aura-accent"><Icon size={16} /></span><span className="mono text-lg font-bold text-white/85">{weight}</span></div><h3 className="mt-5 text-sm font-semibold">{label}</h3><p className="mt-2 text-xs leading-5 text-white/40">{detail}</p><div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-aura-accent" style={{ width: weight }} /></div></article>
          ))}
        </div>
      </Section>

      <Section id="recalculation" eyebrow="Deterministic recalculation" title={<>The AI changes its mind<br /><span className="text-white/45">for a reason.</span></>} subtitle="The LLM explains the result. Deterministic code controls the weights, confidence, direction, and P&L.">
        <div className="grid items-start gap-7 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <RecalcDemo />
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/30">
              <span className="flex items-center gap-1.5"><Check size={12} className="text-aura-long" /> Real recalc engine</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-aura-long" /> Redistributed weights</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-aura-long" /> Explainable output</span>
            </div>
          </div>
          <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            <ReasonRow number="01" title="Evidence-gated" detail="A challenge matters only when the attacked signal is weak and the claim is specific enough." />
            <ReasonRow number="02" title="Weight redistribution" detail="The attacked factor loses influence. Removed weight is redistributed across the remaining factors." />
            <ReasonRow number="03" title="Direction is earned" detail="Conviction can fall from LONG to WAIT or cross far enough to reverse the thesis." />
          </div>
        </div>
      </Section>

      <Section eyebrow="Challenge the signal" title={<>Don&apos;t trust the signal.<br /><span className="text-aura-accent">Challenge it.</span></>} subtitle="A human does not simply bet against the AI. The challenge targets a specific weak or questionable signal, and only verified evidence can change its influence." band>
        <div className="grid gap-5 lg:grid-cols-[0.86fr_1.14fr] lg:items-stretch">
          <div className="landing-terminal overflow-hidden">
            <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-aura-wait"><Swords size={13} /> Human challenge</div><blockquote className="text-base leading-7 text-white/80">&ldquo;Social signal is inflated by low-quality accounts.&rdquo;</blockquote></div>
            <div className="divide-y divide-white/[0.07] px-5 sm:px-6">
              {["Target one factor, not the entire thesis.", "Reduce its influence only after evidence passes verification.", "Redistribute the remaining weight across other factors.", "Record the confidence and direction change instead of hiding it."].map((item, index) => <div key={item} className="flex gap-3 py-4"><span className="mono text-xs text-aura-accent">0{index + 1}</span><p className="text-sm leading-6 text-white/48">{item}</p></div>)}
            </div>
          </div>
          <div className="landing-terminal overflow-hidden">
            <div className="grid gap-px bg-white/[0.08] sm:grid-cols-[1fr_auto_1fr]">
              <ComparisonState label="BEFORE" confidence="79%" direction="LONG" />
              <div className="hidden place-items-center bg-[#070a12] px-4 sm:grid"><ArrowRight size={18} className="text-aura-accent" /></div>
              <ComparisonState label="AFTER CHALLENGE" confidence="74%" direction="LONG" accent />
            </div>
            <div className="border-t border-white/[0.07] px-5 py-5 sm:px-6">
              <div className="flex items-end justify-between gap-4"><div><div className="terminal-label">Attacked factor</div><div className="mt-1 text-sm font-semibold">Social weight</div></div><div className="mono flex items-center gap-2 text-lg font-bold"><span className="text-white/45 line-through">25%</span><ArrowRight size={15} className="text-aura-accent" /><span className="text-aura-accent">12%</span></div></div>
              <div className="mt-4 grid grid-cols-[25fr_13fr_62fr] gap-1"><div className="h-1.5 rounded-full bg-white/15" /><div className="h-1.5 rounded-full bg-aura-accent" /><div className="h-1.5 rounded-full bg-white/[0.04]" /></div>
              <p className="mt-4 text-xs leading-5 text-white/38">Illustrative recalculation values matching the existing engine demo. Direction can remain LONG, move to WAIT, or reverse when the recalculated score crosses the configured thresholds.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section id="agents" eyebrow="Six minds" title={<>Six minds.<br /><span className="text-white/45">One market.</span></>} subtitle="They dont agree. Thats the point. VOLT, MIRA, QUANTA, NOVA, ATLAS and RIFT approach the same market from different intelligence layers. Performance is recorded only after completed battles.">
        <div className="grid gap-4 md:grid-cols-3">
          {AGENT_LIST.map((agent) => (
            <Link key={agent.id} href={`/agents/${agent.id}`} className="landing-agent group" style={{ "--agent-accent": agent.accent } as React.CSSProperties}>
              <span className="absolute inset-x-0 top-0 h-px bg-[var(--agent-accent)]" />
              <div className="flex items-start justify-between gap-4">
                <AgentAvatar agent={agent} className="h-12 w-12" glyphClassName="text-2xl" />
                <div className="text-right"><div className="mono text-xl font-bold" style={{ color: agent.accent }}>-</div><div className="terminal-label mt-1">Recorded win rate</div></div>
              </div>
              <h3 className="mt-7 font-display text-2xl font-bold" style={{ color: agent.accent }}>{agent.name}</h3>
              <p className="mt-1 text-sm font-semibold text-white/65">{agent.role}</p>
              <p className="mt-2 text-xs leading-5 text-white/42">{agent.personality} {agent.voice}</p>
              <div className="mt-7 border-y border-white/[0.07] py-4 text-center"><div className="terminal-label">No public performance record</div><div className="mt-1 text-xs text-white/30">Battle results populate this profile.</div></div>
              <span className="landing-text-link mt-5">View specialist <ArrowRight size={14} /></span>
            </Link>
          ))}
          <CreateAgentEntry />
        </div>
      </Section>

      <Section eyebrow="Agent battles" title={<>They dont agree.<br /><span className="text-aura-accent">Thats the point.</span></>} subtitle="Disagreement is a product feature. Different evidence layers collide, the thesis changes, and the record keeps the argument visible." band>
        <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] lg:grid-cols-[1fr_auto_1fr]">
          <AgentStatement agent="VOLT" accent="#22e39a" text="Momentum confirms continuation." />
          <div className="grid place-items-center bg-[#070a12] p-5"><Swords size={20} className="text-aura-accent" /><span className="terminal-label mt-2">Evidence collision</span></div>
          <AgentStatement agent="MIRA" accent="#f5b544" text="News sentiment is inflated. Your signal may be late." />
          <AgentStatement agent="QUANTA" accent="#5b8cff" text="Probability remains favorable, but volatility has increased." />
          <AgentStatement agent="NOVA" accent="#c084fc" text="Onchain flow supports the move." />
          <div className="bg-aura-accent/[0.06] p-5 lg:col-span-3"><div className="terminal-label text-aura-accent">Thesis updated — illustrative</div><div className="mt-3 flex flex-wrap items-center gap-4"><span className="mono text-2xl font-bold text-white/55">79%</span><ArrowRight size={17} className="text-aura-accent" /><span className="mono text-2xl font-bold text-aura-accent">72%</span><span className="text-white/30">/</span><span className="font-bold text-aura-long">LONG</span><span className="text-xs text-white/40">example of how confidence is recalculated after evidence review — not a live signal</span></div></div>
        </div>
      </Section>

      <Section id="arena" eyebrow="Real market data. Fixed battle rules." title={<>Five minutes. Same rules.<br /><span className="text-aura-accent">Measurable result.</span></>} subtitle="The battle format is 05:00 / SOL / USDT with AURA demo rewards. A battle fixes duration, market and starting conditions before competition begins; AURA has no real-world value." band>
        <div className="mb-5 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-3">
          {BATTLE_RULES.map(([Icon, title, detail]) => <article key={title} className="flex gap-4 bg-[#070a12] p-4 sm:p-5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-aura-accent"><Icon size={16} /></span><div><h3 className="text-sm font-semibold text-white/80">{title}</h3><p className="mt-1 text-xs leading-5 text-white/40">{detail}</p></div></article>)}
        </div>
        <LandingBattlePreview />
      </Section>

      <Section id="proof" eyebrow="Verification you can trust" title={<>Proof is a state,<br /><span className="text-white/45">not a marketing claim.</span></>} subtitle="AURA separates a server-settled market outcome from on-chain verification. VERIFIED is displayed only when a real X Layer transaction exists.">
        <div className="mb-5 grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-5">
          {VERIFICATION_STATES.map(([label, detail, tone]) => <VerificationState key={label} label={label} detail={detail} tone={tone} />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.06fr]">
          <TrustCard icon={<Database size={19} />} number="01" title="Real market data" detail="Battles settle from live OKX Exchange spot data. There is no fallback price: if the feed is unavailable the battle does not settle on an invented number." />
          <TrustCard icon={<Calculator size={19} />} number="02" title="Server-settled result" detail="Final P&L is calculated by the battle engine. The client never submits its own result." />
          <TrustCard icon={<FileCheck2 size={19} />} number="03" title="On-chain proof" detail="VERIFIED appears only after a real X Layer transaction exists and confirms." />
          <LandingProofState />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="landing-terminal flex items-center justify-between gap-4 p-4"><div><div className="terminal-label">Verification network</div><div className="mt-1 text-sm font-semibold text-white/75">X LAYER</div></div><span className="rounded-full border border-aura-wait/25 bg-aura-wait/[0.07] px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-aura-wait">RUNTIME STATE BELOW</span></div><div className="landing-terminal flex items-center justify-between gap-4 p-4"><div><div className="terminal-label">Future trading mode</div><div className="mt-1 text-sm font-semibold text-white/75">MAINNET MODE</div></div><span className="rounded-full border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-white/45">COMING SOON</span></div></div>
      </Section>

      <Section id="leaderboard" eyebrow="Reputation is earned" title={<>Performance becomes<br /><span className="text-aura-accent">track record.</span></>} subtitle="Battle outcomes contribute to performance history. Challenge performance contributes to reputation. Human and AI participants build records from settled battles, not arbitrary claims." band>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <ReputationPrinciple icon={<Trophy size={17} />} title="Battle outcomes" detail="Wins, losses and settled P&L remain attached to performance history." />
          <ReputationPrinciple icon={<Target size={17} />} title="Challenge performance" detail="Valid and invalid challenges contribute to the human record." />
          <ReputationPrinciple icon={<Fingerprint size={17} />} title="Durable identity" detail="Human and AI competitors build reputation through recorded results." />
        </div>
        <LandingReputationPreview />
      </Section>

      <Section eyebrow="Every battle leaves a record" title={<>A premium receipt for<br /><span className="text-white/45">what actually happened.</span></>} subtitle="The battle record keeps the thesis, challenge, recalculation, market outcome and proof state together. When no settled battle exists, the receipt stays explicitly empty.">
        <LandingRecordPreview />
      </Section>

      <Section id="markets" eyebrow="Real market intelligence" title={<>One arena.<br /><span className="text-white/45">Many markets.</span></>} subtitle="AURA currently reads the existing market feed for BTC, ETH and SOL. The market universe can expand without changing the thesis, challenge or settlement model.">
        <LandingMarketPreview />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[["Market Data", "Price, change, volume and candles"], ["News + Sentiment", "Narratives and social evidence"], ["Onchain + Liquidity", "Wallet flows, depth and structure"], ["Volatility", "Regime and risk context"], ["Current support", "BTC / ETH / SOL"], ["Expansion", "Additional markets / coming soon"]].map(([title, detail]) => <div key={title} className="landing-terminal p-4"><div className="text-sm font-semibold text-white/75">{title}</div><div className="mt-1 text-xs leading-5 text-white/40">{detail}</div></div>)}</div>
      </Section>

      <Section eyebrow="Product difference" title="Why AURA?" band>
        <div className="grid gap-px overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
          {WHY_AURA.map(([Icon, title, detail], index) => (
            <article key={title} className="bg-[#070a12] p-5 sm:p-6">
              <div className="flex items-center justify-between"><Icon size={19} className="text-aura-accent" /><span className="mono text-xs text-white/20">0{index + 1}</span></div>
              <h3 className="mt-8 font-display text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-white/45">{detail}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="Who is AURA Arena for?" title={<>A market for<br /><span className="text-aura-accent">better questions.</span></>} subtitle="The arena gives each participant a different reason to show up, while keeping the rules and record shared.">
        <div className="grid gap-4 md:grid-cols-3">
          {AUDIENCES.map(([Icon, title, detail]) => <article key={title} className="landing-agent p-5 sm:p-6"><span className="grid h-11 w-11 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/[0.07] text-aura-accent"><Icon size={19} /></span><h3 className="mt-7 font-display text-xl font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-white/48">{detail}</p><span className="landing-text-link mt-6">Explore the arena <ArrowRight size={14} /></span></article>)}
        </div>
      </Section>

      <Section eyebrow="Why this is different" title={<>A signal is a start.<br /><span className="text-white/45">AURA makes it accountable.</span></>} band>
        <div className="overflow-hidden rounded-lg border border-white/[0.08]">
          <div className="grid grid-cols-[1fr_1fr] border-b border-white/[0.08] bg-white/[0.025] px-4 py-3 sm:px-6"><span className="terminal-label text-aura-accent">AURA ARENA</span><span className="terminal-label">TRADITIONAL SIGNAL</span></div>
          {DIFFERENCE.map(([aura, traditional], index) => <div key={aura} className="grid grid-cols-[1fr_1fr] border-b border-white/[0.06] last:border-b-0"><div className="flex items-center gap-3 bg-aura-accent/[0.035] px-4 py-4 text-sm font-semibold text-white/80 sm:px-6"><Check size={14} className="shrink-0 text-aura-long" />{aura}</div><div className="flex items-center gap-3 px-4 py-4 text-sm text-white/40 sm:px-6"><span className="mono text-[10px] text-white/20">0{index + 1}</span>{traditional}</div></div>)}
        </div>
      </Section>

      <Section eyebrow="The complete AURA loop" title={<>From market data<br /><span className="text-aura-accent">to earned reputation.</span></>} subtitle="The full system keeps every handoff visible: data becomes a thesis, a thesis becomes a challenge, and a battle becomes a record." >
        <div className="relative overflow-hidden rounded-lg border border-white/[0.08] bg-[#070a12] p-4 sm:p-6 lg:p-8">
          <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
          <div className="relative grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {LOOP.map((label, index) => <div key={label} className="flex min-h-16 items-center gap-3 rounded-md border border-white/[0.08] bg-white/[0.025] px-4 py-3"><span className="mono text-[10px] text-aura-accent">{String(index + 1).padStart(2, "0")}</span><span className="text-xs font-bold tracking-[0.08em] text-white/75">{label}</span>{index < LOOP.length - 1 && <ChevronRight size={14} className="ml-auto hidden text-white/20 lg:block" />}</div>)}
          </div>
          <div className="relative mt-6 flex items-center justify-center gap-3 border-t border-white/[0.07] pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35"><span className="h-1.5 w-1.5 rounded-full bg-aura-long" />Every completed loop strengthens the record</div>
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title={<>The arena,<br /><span className="text-white/45">without the ambiguity.</span></>} subtitle="Short answers about agents, challenges, demo funds, wallets, settlement and X Layer proof." band>
        <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#070a12]">
          {FAQ.map(([question, answer], index) => (
            <details key={question} className="group border-b border-white/[0.07] last:border-b-0">
              <summary className="focus-ring flex cursor-pointer list-none items-center gap-4 px-5 py-5 text-left sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="mono text-xs text-aura-accent">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-sm font-semibold text-white/80 sm:text-base">{question}</span>
                <ChevronRight size={16} className="ml-auto shrink-0 text-white/25 transition-transform group-open:rotate-90 group-open:text-aura-accent" />
              </summary>
              <p className="max-w-3xl px-5 pb-5 pl-[3.75rem] text-sm leading-6 text-white/48 sm:px-6 sm:pb-6 sm:pl-[4.25rem]">{answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section eyebrow="Coming soon" title={<>The arena is<br /><span className="text-aura-accent">getting bigger.</span></>} subtitle="Six specialists are only the beginning. These are product directions, not active features." band>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{COMING_SOON.map(([title, detail]) => <article key={title} className="landing-terminal p-5"><div className="flex items-center justify-between gap-4"><h3 className="font-display text-base font-bold text-white/80">{title}</h3><span className="rounded-full border border-aura-accent/25 bg-aura-accent/[0.07] px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-aura-accent">COMING SOON</span></div><p className="mt-3 text-sm leading-6 text-white/45">{detail}</p></article>)}</div>
      </Section>

      <section className="relative border-t border-white/[0.06] px-4 py-20 sm:px-6 lg:py-28">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-20" />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="section-kicker">AURA ARENA</div>
          <h2 className="mt-4 font-display text-4xl font-bold leading-[0.98] sm:text-6xl">Think you can<br /><span className="text-aura-accent">beat the machine?</span></h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/52">Start with Demo Trading.<br />Challenge an AI specialist. Test your thesis.<br />See whether the evidence survives.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <PrimaryArenaButton>Enter Arena <ArrowRight size={18} /></PrimaryArenaButton>
            <SecondaryLink href="/agents"><Users size={16} /> Explore Agents</SecondaryLink>
          </div>
          <div className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/32">
            <span>Virtual capital</span><span>Real market data</span><span>5-minute battles</span><span>Verifiable results</span>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Section({ id, eyebrow, title, subtitle, children, band = false }: { id?: string; eyebrow: string; title: React.ReactNode; subtitle?: string; children: React.ReactNode; band?: boolean }) {
  return (
    <section id={id} className={band ? "border-y border-white/[0.05] bg-white/[0.012]" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mb-9 max-w-2xl">
          <div className="section-kicker">{eyebrow}</div>
          <h2 className="mt-3 font-display text-3xl font-bold leading-[1.04] sm:text-4xl">{title}</h2>
          {subtitle && <p className="mt-4 max-w-xl text-sm leading-6 text-white/50 sm:text-base sm:leading-7">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/[0.11] bg-white/[0.035] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.06]">{children}</Link>;
}

function PrimaryArenaButton({ children }: { children: React.ReactNode }) {
  return <LandingArenaButton className="focus-ring group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-aura-accent px-6 text-sm font-bold text-white shadow-[0_14px_40px_-18px_rgba(124,92,255,0.8)] transition hover:-translate-y-0.5 hover:bg-[#8b70ff]">{children}</LandingArenaButton>;
}

function SecondaryArenaButton({ children }: { children: React.ReactNode }) {
  return <LandingArenaButton className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/[0.11] bg-white/[0.035] px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.06]">{children}</LandingArenaButton>;
}

function TrustPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.025] px-2.5 py-1 text-[9px] font-semibold tracking-[0.13em] text-white/42">{icon}{label}</span>;
}

function HeroFact({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return <div className={bordered ? "min-w-0 border-l border-white/[0.07] pl-3 sm:pl-5" : "min-w-0 pr-2"}><div className="terminal-label">{label}</div><div className="mono mt-1 truncate text-[11px] font-semibold text-white/75 sm:text-xs">{value}</div></div>;
}

function ReasonRow({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="grid grid-cols-[38px_1fr] gap-3 py-5"><span className="mono text-xs text-aura-accent">{number}</span><div><h3 className="font-semibold text-white/85">{title}</h3><p className="mt-1 text-sm leading-6 text-white/48">{detail}</p></div></div>;
}

function ComparisonState({ label, confidence, direction, accent = false }: { label: string; confidence: string; direction: string; accent?: boolean }) {
  return <div className="bg-[#070a12] p-5 sm:p-6"><div className={accent ? "terminal-label text-aura-accent" : "terminal-label"}>{label}</div><div className={accent ? "mono mt-4 text-4xl font-bold text-aura-accent" : "mono mt-4 text-4xl font-bold text-white/85"}>{confidence}</div><div className={accent ? "mt-2 text-sm font-bold text-aura-long" : "mt-2 text-sm font-bold text-white/60"}>{direction}</div><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className={accent ? "h-full w-[74%] rounded-full bg-aura-accent" : "h-full w-[79%] rounded-full bg-white/30"} /></div></div>;
}

function VerificationState({ label, detail, tone }: { label: string; detail: string; tone: "positive" | "negative" | "warning" | "neutral" }) {
  const color = tone === "positive" ? "text-aura-long" : tone === "negative" ? "text-aura-short" : tone === "warning" ? "text-aura-wait" : "text-white/55";
  return <article className="bg-[#070a12] p-4 sm:p-5"><div className={`mono text-xs font-bold ${color}`}>{label}</div><p className="mt-3 text-xs leading-5 text-white/42">{detail}</p></article>;
}

function ReputationPrinciple({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="landing-terminal flex gap-3 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-aura-accent/20 bg-aura-accent/[0.07] text-aura-accent">{icon}</span><div><h3 className="text-sm font-semibold text-white/80">{title}</h3><p className="mt-1 text-xs leading-5 text-white/40">{detail}</p></div></div>;
}

function AgentStatement({ agent, accent, text }: { agent: string; accent: string; text: string }) {
  return <div className="bg-[#070a12] p-5"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-xs font-bold" style={{ color: accent }}>{agent[0]}</span><span className="font-display text-sm font-bold" style={{ color: accent }}>{agent}</span></div><p className="mt-4 text-sm leading-6 text-white/70">&ldquo;{text}&rdquo;</p></div>;
}

function TrustCard({ icon, number, title, detail }: { icon: React.ReactNode; number: string; title: string; detail: string }) {
  return <article className="border-y border-white/[0.07] py-5 lg:border-y-0 lg:border-l lg:py-2 lg:pl-5"><div className="flex items-center justify-between text-aura-accent">{icon}<span className="mono text-xs text-white/20">{number}</span></div><h3 className="mt-7 font-display text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-white/45">{detail}</p></article>;
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.07] bg-[#04060b]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-md"><span className="grid h-8 w-8 place-items-center rounded-lg border border-aura-accent/25 bg-aura-accent/10 text-aura-accent"><Zap size={17} /></span><span className="font-display font-bold tracking-[0.08em]">AURA<span className="text-aura-accent">.</span></span></Link>
           <p className="mt-4 max-w-xs text-sm leading-6 text-white/38">A competitive market-intelligence arena where humans challenge AI theses and results stay tied to evidence, settlement and reputation.</p>
          <div className="mt-5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-long"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-aura-long" /> Engine active</div>
        </div>
        <FooterGroup title="Product" links={[["Markets", "/markets"], ["Arena", "/arena"], ["Agents", "/agents"], ["Leaderboard", "/leaderboard"], ["History", "/history"]]} />
        <FooterGroup title="Resources" links={[["How it works", "/#how-it-works"], ["Proof / Verification", "/#proof"], ["Documentation", "/how-it-works"]]} />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-white/[0.06] px-4 py-5 text-xs text-white/28 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>&copy; 2026 AURA Arena</span>
        <span>Demo Trading / Real market data / Proof only when confirmed</span>
      </div>
    </footer>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return <div><div className="terminal-label mb-4">{title}</div><nav className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-1">{links.map(([label, href]) => <Link key={`${label}-${href}`} href={href} className="focus-ring w-fit rounded text-sm text-white/45 transition-colors hover:text-white">{label}</Link>)}</nav></div>;
}
