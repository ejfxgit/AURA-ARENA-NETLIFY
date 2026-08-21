import { NextResponse } from "next/server";
import { AGENT_LIST } from "@/lib/agents";
import {
  LeaderboardUnavailableError,
  loadLeaderboard,
  type LeaderboardAgentRow,
} from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

/**
 * Public competitive league.
 *
 * Previously assembled from lib/store.ts, a module-level in-memory Map: rankings
 * vanished on restart and, on serverless, varied per instance. It now reads the
 * persisted settlement record through the security-definer league functions, so
 * the same league is visible to every visitor and survives a restart.
 *
 * The response shape is unchanged, deliberately. src/components/landing-live.tsx
 * matches the caller's own row with userId.endsWith(profile.id.slice(-8)), and
 * both leaderboard views spread the static Agent metadata, so the anonymized
 * wallet_<last 8> identity and the AGENT_LIST fields are part of the contract.
 *
 * A database that cannot be read answers 503 rather than 200-with-zeros: an
 * empty league and an unreadable one are different facts, and zeros presented as
 * a record would be a fabricated statistic.
 */

const EMPTY_AGENT_TOTALS = {
  wins: 0,
  losses: 0,
  realized_pnl: 0,
  valid_challenges: 0,
  defended_challenges: 0,
};

function agentTotals(rows: LeaderboardAgentRow[]) {
  const byId = new Map<string, typeof EMPTY_AGENT_TOTALS>();
  for (const row of rows) {
    byId.set(row.agent_id, {
      wins: row.wins,
      losses: row.losses,
      realized_pnl: Number(row.realized_pnl),
      valid_challenges: row.valid_challenges,
      defended_challenges: row.defended_challenges,
    });
  }
  return byId;
}

export async function GET() {
  let data: Awaited<ReturnType<typeof loadLeaderboard>>;
  try {
    data = await loadLeaderboard(50);
  } catch (error) {
    if (error instanceof LeaderboardUnavailableError) {
      return NextResponse.json(
        {
          error: { kind: error.kind, message: error.message, retryable: error.kind === "unavailable" },
          humans: [],
          agents: [],
          occurredAt: new Date().toISOString(),
        },
        { status: 503 },
      );
    }
    console.error("[leaderboard] unexpected failure", error);
    return NextResponse.json(
      {
        error: { kind: "unavailable", message: "Unable to read leaderboard data", retryable: true },
        humans: [],
        agents: [],
        occurredAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  const humans = data.humans.map((row) => {
    const realizedPnl = Number(row.realized_pnl);
    const decided = row.wins + row.losses;
    const challenges = row.valid_challenges + row.invalid_challenges;
    return {
      userId: row.user_id,
      realized_pnl: realizedPnl,
      wins: row.wins,
      losses: row.losses,
      win_rate: decided > 0 ? Number(((row.wins / decided) * 100).toFixed(1)) : 0,
      valid_challenges: row.valid_challenges,
      invalid_challenges: row.invalid_challenges,
      challenge_success_rate:
        challenges > 0 ? Number(((row.valid_challenges / challenges) * 100).toFixed(1)) : 0,
      reputation_score: row.reputation_score,
    };
  });

  // The roster itself is static metadata, so every specialist is always listed.
  // An agent with no settled battle reports zeros because it genuinely has no
  // record — not as a stand-in for data that failed to load, which 503s above.
  const totals = agentTotals(data.agents);
  const agents = [...AGENT_LIST]
    .map((agent) => {
      const runtime = totals.get(agent.id) ?? EMPTY_AGENT_TOTALS;
      const totalBattles = runtime.wins + runtime.losses;
      const challengeTotal = runtime.valid_challenges + runtime.defended_challenges;
      return {
        ...agent,
        wins: runtime.wins,
        losses: runtime.losses,
        win_rate: totalBattles > 0 ? Number(((runtime.wins / totalBattles) * 100).toFixed(1)) : 0,
        avg_pnl: totalBattles > 0 ? Number((runtime.realized_pnl / totalBattles).toFixed(2)) : 0,
        reputation_score: Math.round(
          runtime.wins * 25 - runtime.losses * 10 + runtime.defended_challenges * 5,
        ),
        challenge_success: runtime.valid_challenges,
        challenge_defense: runtime.defended_challenges,
        challenge_defense_rate: challengeTotal > 0
          ? Number(((runtime.defended_challenges / challengeTotal) * 100).toFixed(1))
          : 0,
      };
    })
    .sort((a, b) => b.reputation_score - a.reputation_score);

  return NextResponse.json({ humans, agents });
}
