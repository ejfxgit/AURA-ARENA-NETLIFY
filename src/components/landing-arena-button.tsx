"use client";

import type { ReactNode } from "react";
import { useWallet } from "@/lib/use-wallet";

export function LandingArenaButton({ children, className }: { children: ReactNode; className: string }) {
  const { enterArena } = useWallet();

  return (
    <button type="button" onClick={() => enterArena()} className={className}>
      {children}
    </button>
  );
}
