"use client";

// Live feed status indicator.
//
// Reports the real websocket state from the central market service. It never
// shows a green "live" dot unless the socket is actually open, because that dot
// is the user's only way to tell a moving market from a frozen page.

import { useMarketConnection } from "@/lib/market/use-live-market";
import type { ConnectionStatus } from "@/lib/market/market-data-service";
import { cn } from "@/lib/utils";

const PRESENTATION: Record<
  ConnectionStatus,
  { label: string; dot: string; text: string; pulse: boolean }
> = {
  idle: { label: "IDLE", dot: "bg-white/30", text: "text-white/40", pulse: false },
  connecting: { label: "CONNECTING", dot: "bg-aura-wait", text: "text-aura-wait", pulse: true },
  open: { label: "LIVE", dot: "bg-aura-long", text: "text-aura-long", pulse: true },
  reconnecting: { label: "RECONNECTING", dot: "bg-aura-wait", text: "text-aura-wait", pulse: true },
  offline: { label: "DISCONNECTED", dot: "bg-aura-short", text: "text-aura-short", pulse: false },
};

export function LiveStatus({
  className,
  showLabel = true,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const status = useMarketConnection();
  const { label, dot, text, pulse } = PRESENTATION[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em]",
        text,
        className,
      )}
      title={`OKX websocket: ${status}`}
      aria-live="polite"
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot, pulse && "animate-pulse")} />
      {showLabel && label}
    </span>
  );
}
