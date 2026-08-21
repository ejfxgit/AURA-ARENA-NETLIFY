import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The minimum an avatar surface needs to identify an agent.
 *
 * Both `Agent` (the static roster in lib/agents.ts) and `BattleAgentView`
 * (lib/battle-agents.ts, which also covers user-built agents) satisfy this, so
 * every surface can render either kind through one component.
 */
export interface AgentAvatarIdentity {
  name: string;
  accent: string;
  /**
   * Single-letter mark. Only reached when there is no image — user-built custom
   * agents have no commissioned art, so they keep the initial they always had.
   */
  avatar: string;
  /** Public path to the agent's identity art. Null/absent for custom agents. */
  avatarImage?: string | null;
}

/**
 * Canonical agent avatar. Every surface that shows an agent renders this, so an
 * agent's identity art is decided once in the roster and never per component.
 *
 * `className` carries the surface's own geometry — size, and a rounding
 * override where the design calls for one. The chrome (border, ground, accent
 * ring, clipping) lives here so all six read as one system at every size.
 *
 * The art is square and the box is square, so `object-cover` never stretches
 * it; on a non-square box it crops evenly rather than distorting the face.
 */
export function AgentAvatar({
  agent,
  className,
  glyphClassName,
}: {
  agent: AgentAvatarIdentity;
  className?: string;
  /** Type scale for the letter fallback only. Ignored once art exists. */
  glyphClassName?: string;
}) {
  const chrome = "shrink-0 overflow-hidden rounded-lg border border-white/[0.08]";

  if (!agent.avatarImage) {
    return (
      <span
        className={cn(chrome, "grid place-items-center bg-white/[0.025] font-display font-bold", glyphClassName, className)}
        style={{ color: agent.accent }}
      >
        {agent.avatar}
      </span>
    );
  }

  return (
    <span className={cn(chrome, "relative block bg-black/40", className)}>
      {/* A committed static asset under public/agents, so there is no load
          failure to fall back from and no remote host to optimise through. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={agent.avatarImage}
        alt=""
        aria-hidden="true"
        width={256}
        height={256}
        className="h-full w-full object-cover"
      />
      {/* Ties the art back to the agent's accent without touching the asset. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ boxShadow: `inset 0 0 0 1px ${agent.accent}40` }}
      />
    </span>
  );
}
