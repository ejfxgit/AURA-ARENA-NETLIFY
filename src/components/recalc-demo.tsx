"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Search, RefreshCw, Trophy, ShieldCheck } from "lucide-react";
import { recalculate } from "@/lib/engine/recalc";
import type { Factor } from "@/lib/types";
import { cn } from "@/lib/utils";

// Engine-driven mini walkthrough used on the landing page.
//
// This is an ILLUSTRATION of the challenge mechanic, not a market feed. The
// confidence and weight numbers it shows are computed by the real recalculation
// engine (lib/engine/recalc.ts), but its INPUTS below are a fixed scenario, not
// live data. It therefore must never be labelled with a market pair or a "live"
// indicator, and must not display invented measurements such as an account
// count — lib/evidence/engine.ts deliberately refuses to report those.
// This is a labelled hypothetical, so every factor is marked available: the
// walkthrough exists to show what a challenge does to the weighting, and it
// needs the social factor to be weighable for that story to work. `directional`
// still follows the real model — liquidity is a magnitude, so it never counts
// toward LONG/SHORT even in the illustration.
const BASE_FACTORS: Factor[] = [
  { name: "momentum", score: 82, weight: 0.25, available: true, directional: true },
  { name: "volume", score: 76, weight: 0.2, available: true, directional: true },
  { name: "social", score: 91, weight: 0.25, available: true, directional: true },
  { name: "whale_activity", score: 71, weight: 0.2, available: true, directional: true },
  { name: "liquidity", score: 64, weight: 0.1, available: true, directional: false },
];

/** Fixed scenario inputs for the walkthrough. Not measured from any feed. */
const SCENARIO_VALIDITY = 0.82;
const SCENARIO_EVIDENCE_QUALITY = 35;

const LABELS: Record<string, string> = {
  momentum: "Momentum",
  volume: "Volume",
  social: "Social",
  whale_activity: "Whales",
  liquidity: "Liquidity",
};

const STEPS = 6;

export function RecalcDemo({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  const result = useMemo(
    () =>
      recalculate({
        factors: BASE_FACTORS,
        stance: "LONG",
        attackedFactor: "social",
        challengeValidity: SCENARIO_VALIDITY,
        evidenceQuality: SCENARIO_EVIDENCE_QUALITY,
      }),
    [],
  );

  useEffect(() => {
    const timings = [1600, 2200, 2600, 2600, 2600, 3200];
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS), timings[step]);
    return () => clearTimeout(t);
  }, [step]);

  const socialOld = Math.round(result.oldWeights.find((f) => f.name === "social")!.weight * 100);
  const socialNew = Math.round(result.newWeights.find((f) => f.name === "social")!.weight * 100);

  return (
    <div className={cn("glass relative overflow-hidden p-4 sm:p-5", className)}>
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="relative">
        {/* header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🐂</span>
            <div>
              <div className="text-sm font-bold">VOLT</div>
              <div className="text-[11px] text-white/45">momentum · worked example</div>
            </div>
          </div>
          <div className="chip text-white/55">
            <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
            example
          </div>
        </div>

        {/* thesis */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#090c16]/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <motion.span
              key={step >= 4 ? result.newDirection : "LONG"}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm font-bold",
                step >= 4 && result.newDirection === "WAIT"
                  ? "border-aura-wait/30 bg-aura-wait/10 text-aura-wait"
                  : "border-aura-long/30 bg-aura-long/10 text-aura-long",
              )}
            >
              {step >= 4 ? result.newDirection : "LONG"}
            </motion.span>
            <span className="text-xs text-white/50">AI thesis</span>
          </div>
          <ConfidenceNumber
            value={step >= 4 ? result.newConfidence : result.oldConfidence}
          />
        </div>

        {/* factors */}
        <div className="space-y-1.5">
          {BASE_FACTORS.map((f) => {
            const updated = result.newWeights.find((item) => item.name === f.name);
            const w = step >= 3 && updated
              ? Math.round(updated.weight * 100)
              : Math.round(f.weight * 100);
            const attacked = f.name === "social" && step >= 2;
            return (
              <div key={f.name} className="flex items-center gap-3">
                <span className="w-16 text-xs text-white/50">{LABELS[f.name]}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      attacked ? "bg-aura-short" : "bg-aura-accent/70",
                    )}
                    animate={{ width: `${Math.min(100, w * 2.8)}%` }}
                    transition={{ type: "spring", stiffness: 120, damping: 18 }}
                  />
                </div>
                <span className="mono w-8 text-right text-xs text-white/60">{w}%</span>
              </div>
            );
          })}
        </div>

        {/* event overlay */}
        <div className="mt-5 min-h-[98px]" aria-live="polite">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <Event key="thesis" icon={<Zap className="text-aura-long" size={16} />} title="AI thesis published">
                <div className="flex items-center justify-between text-sm"><span className="text-white/55">Weighted conviction from five factors</span><span className="mono font-bold text-white/80">{result.oldConfidence}%</span></div>
              </Event>
            )}
            {step === 1 && (
              <Event key="challenge" icon={<Zap className="text-aura-wait" size={16} />} title="Challenge received">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-aura-wait">MIRA / News &amp; Intelligence Specialist</div>
                <p className="text-sm text-white/80">“Your social signal is inflated by low-quality accounts.”</p>
              </Event>
            )}
            {step === 2 && (
              <Event key="verify" icon={<Search className="text-aura-accent" size={16} />} title="Verifying evidence">
                {/* No account count or "% low quality" here: AURA has no social
                    feed connected, so any such figure would be fabricated. Only
                    the scenario's declared integrity is shown. */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/55">Declared evidence quality for this example</span>
                  <span className="mono font-bold text-white/80">{SCENARIO_EVIDENCE_QUALITY}/100</span>
                </div>
              </Event>
            )}
            {step === 3 && (
              <Event key="recalc" icon={<RefreshCw className="animate-spin text-aura-accent" size={16} />} title="Recalculating">
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-white/60">Social weight</span>
                  <span className="mono text-white/50">{socialOld}%</span>
                  <span className="text-aura-short">↓</span>
                  <span className="mono font-bold text-aura-short">{socialNew}%</span>
                </div>
              </Event>
            )}
            {step === 4 && (
              <Event key="result" icon={<RefreshCw className="text-aura-wait" size={16} />} title="Thesis updated">
                <div className="flex items-center gap-4 text-sm">
                  <span className="mono">
                    {result.oldConfidence}% <span className="text-aura-short">↓</span>{" "}
                    <span className="font-bold text-aura-wait">{result.newConfidence}%</span>
                  </span>
                  <span className="text-white/30">|</span>
                  <span className="font-bold">
                    LONG <span className="text-aura-short">↓</span>{" "}
                    <span className="text-aura-wait">{result.newDirection}</span>
                  </span>
                </div>
              </Event>
            )}
            {step === 5 && (
              <Event key="win" icon={<Trophy className="text-aura-long" size={16} />} title="Battle result ready">
                <div className="flex items-center gap-2 text-sm text-white/65">
                  <ShieldCheck size={15} className="text-aura-accent" /> On-chain status appears only after a real transaction
                </div>
              </Event>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ConfidenceNumber({ value }: { value: number }) {
  return (
    <motion.div
      key={value}
      initial={{ scale: 0.85, opacity: 0.4 }}
      animate={{ scale: 1, opacity: 1 }}
      className="text-right"
    >
      <div className="mono text-2xl font-bold leading-none">{value}%</div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">confidence</div>
    </motion.div>
  );
}

function Event({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className="rounded-lg border border-white/[0.08] bg-[#090c16]/85 p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
        {icon} {title}
      </div>
      {children}
    </motion.div>
  );
}
