"use client";

import { motion } from "framer-motion";
import type { Factor, FactorName } from "@/lib/types";
import { FACTOR_LABELS } from "@/lib/engine/recalc";
import { cn } from "@/lib/utils";

export function FactorBars({
  factors,
  highlight,
  compareWeights,
  accent = "#7c5cff",
}: {
  factors: Factor[];
  highlight?: FactorName;
  compareWeights?: Factor[]; // old weights, to show the delta
  accent?: string;
}) {
  return (
    <div className="space-y-2.5">
      {factors.map((f) => {
        const pct = Math.round(f.weight * 100);
        const old = compareWeights?.find((c) => c.name === f.name);
        const oldPct = old ? Math.round(old.weight * 100) : null;
        const isHi = highlight === f.name;
        const dropped = oldPct != null && pct < oldPct;
        return (
          <div key={f.name} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs text-white/55">
              {FACTOR_LABELS[f.name]}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className={cn("h-full rounded-full")}
                style={{ background: isHi && dropped ? "#ff4d5e" : accent }}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
            <div className="flex w-20 shrink-0 items-center justify-end gap-1 text-xs">
              {oldPct != null && oldPct !== pct && (
                <>
                  <span className="mono text-white/35 line-through">{oldPct}%</span>
                  <span className={dropped ? "text-aura-short" : "text-aura-long"}>
                    {dropped ? "↓" : "↑"}
                  </span>
                </>
              )}
              <span className="mono font-semibold text-white/80">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
