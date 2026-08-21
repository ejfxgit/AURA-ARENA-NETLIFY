import { NextResponse } from "next/server";
import { z } from "zod";
import { assetBySymbol, getSnapshot, getCandles } from "@/lib/market/adapter";
import { marketErrorResponse } from "@/lib/market/http";
import { aiErrorResponse } from "@/lib/ai/http";
import { generateCustomAgentThesis } from "@/lib/ai/custom-thesis";
import { ensureAgentDecision } from "@/lib/agents/decision-service";
import { AgentDecisionStoreError } from "@/lib/supabase/agent-decisions";
import { getAgent } from "@/lib/agents";
import { customAgentBattleSnapshot, customAgentFromRow, type CustomAgentRow } from "@/lib/custom-agents";
import { saveBattle, listBattles, saveAccount } from "@/lib/store";
import { AI_BATTLE_STAKE_AURA, battleStakeIssue } from "@/lib/aura-economy";
import { uid } from "@/lib/utils";
import type { ArenaAgentId, Battle, AgentId, Direction } from "@/lib/types";
import { BATTLE_DURATIONS_SECONDS, battleDurationMinutes, normalizeBattleTiming } from "@/lib/battle/timing";
import { getWalletAuth, listBattlesForUser, persistBattle } from "@/lib/supabase/aura";
import { DEFAULT_LEVERAGE, SUPPORTED_LEVERAGES, normalizeBattleLeverage } from "@/lib/battle/leverage";
import { serviceErrorResponse } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const schema = z.object({
  agentId: z.enum(["volt", "mira", "quanta", "nova", "atlas", "rift"]).optional(),
  customAgentId: z.string().uuid().optional(),
  symbol: z.string().min(1),
  human_direction: z.enum(["LONG", "SHORT", "WAIT"]),
  // Shape only: rejects non-numbers, NaN and +/-Infinity. The stake's real
  // rules — minimum, decimal precision and the balance ceiling — are applied
  // below by battleStakeIssue() against a freshly read server-side balance,
  // because a maximum that lives in the schema cannot know the caller.
  human_amount: z.number().finite(),
  duration_seconds: z.union([
    z.literal(BATTLE_DURATIONS_SECONDS[0]),
    z.literal(BATTLE_DURATIONS_SECONDS[1]),
    z.literal(BATTLE_DURATIONS_SECONDS[2]),
    z.literal(BATTLE_DURATIONS_SECONDS[3]),
  ]),
  leverage: z.union([
    z.literal(SUPPORTED_LEVERAGES[0]),
    z.literal(SUPPORTED_LEVERAGES[1]),
    z.literal(SUPPORTED_LEVERAGES[2]),
    z.literal(SUPPORTED_LEVERAGES[3]),
  ]).default(DEFAULT_LEVERAGE),
}).refine((value) => Boolean(value.agentId) !== Boolean(value.customAgentId), "Choose one agent");


export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { kind: "invalid_request", message: "Invalid battle request", issues: parsed.error.flatten() } },
      { status: 400 },
    );
  }
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { agentId, customAgentId, symbol, human_direction, human_amount, duration_seconds, leverage } = parsed.data;

  const def = assetBySymbol(symbol);
  if (!def) return NextResponse.json({ error: "Unknown asset" }, { status: 404 });

  const account = auth.bundle.account;
  if (!account) return NextResponse.json({ error: "Wallet onboarding required" }, { status: 403 });
  saveAccount(account);
  // Authoritative stake validation. `account` is a fresh per-request read of
  // this caller's own row (loadWalletAccount), so the ceiling is the balance the
  // server sees rather than anything the client claimed. The same stake is
  // re-checked atomically under `for update` when the stake is reserved, which
  // is what actually protects against two battles racing for one balance.
  const stakeIssue = battleStakeIssue(human_amount, account.current_balance);
  if (stakeIssue) {
    return NextResponse.json(
      { error: stakeIssue },
      { status: stakeIssue === "Insufficient AURA balance" ? 409 : 400 },
    );
  }
  const amount = human_amount;

  // A battle's entry price is real money-shaped state, so it is only ever taken
  // from a live OKX quote. If the feed is unavailable the battle is not created
  // at all — an invented entry price would corrupt every later P&L calculation.
  let snapshot;
  let candles;
  try {
    [snapshot, candles] = await Promise.all([
      getSnapshot(def),
      getCandles(def, 100),
    ]);
  } catch (error) {
    return marketErrorResponse(error, `POST /api/battles ${def.instId}`);
  }
  let battleAgentId: ArenaAgentId = agentId as AgentId;
  let customAgentSnapshot: Battle["customAgent"] = null;
  if (customAgentId) {
    const { data: row, error: customError } = await auth.supabase
      .from("custom_agents")
      .select("*")
      .eq("id", customAgentId)
      .eq("owner_id", auth.user.id)
      .maybeSingle();
    if (customError) {
      return serviceErrorResponse({
        error: customError,
        scope: "POST /api/battles custom agent",
        message: "Unable to load custom agent",
        kind: "database_unavailable",
      });
    }
    if (!row) return NextResponse.json({ error: "Custom agent not found" }, { status: 404 });
    const customAgent = customAgentFromRow(row as CustomAgentRow);
    customAgentSnapshot = customAgentBattleSnapshot(customAgent);
    battleAgentId = "custom";
  }

  // The AI side of the battle is the agent's own decision, so the battle cannot
  // exist without one.
  //
  // For a built-in agent this reads the CANONICAL persisted decision for this
  // market and horizon — the same row the agent card renders — and only asks the
  // model when that row is missing or past its TTL. The card and the battle
  // therefore cannot disagree, and settlement reads the snapshot taken here.
  //
  // An unreachable model or an unusable response fails the request with an
  // explicit kind (AI_UNAVAILABLE / INVALID_AI_RESPONSE) and nothing is created
  // or persisted. There is no deterministic direction standing in for it, and no
  // WAIT fallback: a battle with a fabricated agent decision would be settled
  // against a position the agent never took.
  let thesis;
  let decisionMadeAt: string;
  try {
    const horizonMinutes = battleDurationMinutes(duration_seconds);
    if (customAgentSnapshot) {
      // Custom agents are private to their owner, so their decisions are not
      // published to the shared table; the battle record is their snapshot.
      thesis = await generateCustomAgentThesis(
        customAgentSnapshot,
        snapshot,
        candles,
        horizonMinutes,
      );
      decisionMadeAt = thesis.createdAt;
    } else {
      const decision = await ensureAgentDecision(
        auth.supabase,
        agentId as AgentId,
        def.instId,
        horizonMinutes,
      );
      thesis = decision.thesis;
      decisionMadeAt = decision.decidedAt;
    }
  } catch (error) {
    // A decision-store failure is neither an AI failure nor a market failure, so
    // it must not be reported as either. Without this branch it fell through
    // aiErrorResponse (which returns null for anything that is not an AiError)
    // into marketErrorResponse's generic arm, and a failing agent_decisions
    // read/write was reported to the browser as "Market data unavailable." with
    // status 503 — an OKX outage that was not happening. The real kind and
    // message are surfaced here instead.
    if (error instanceof AgentDecisionStoreError) {
      return serviceErrorResponse({
        error,
        scope: `POST /api/battles ${def.instId} agent decision`,
        message: error.message,
        kind: error.kind === "migration_required" ? "migration_required" : "database_unavailable",
        retryable: error.kind !== "migration_required",
      });
    }
    return (
      aiErrorResponse(error, `POST /api/battles ${def.instId}`) ??
      marketErrorResponse(error, `POST /api/battles ${def.instId}`)
    );
  }

  const battle: Battle = {
    id: uid("battle"),
    userId: auth.user.id,
    agentId: battleAgentId,
    customAgentId: customAgentId ?? null,
    customAgent: customAgentSnapshot,
    asset: symbol.toUpperCase(),
    human_direction: human_direction as Direction,
    ai_direction: thesis.direction,
    // The agent's decision, snapshotted at creation. `ai_direction` is what
    // settlement reads; these carry the rest of the same decision so the battle
    // page, the result card and any proof export all quote one record rather
    // than re-deriving it.
    agent_name: customAgentSnapshot?.name ?? getAgent(agentId as AgentId).name,
    agent_decision: thesis.direction,
    agent_confidence: thesis.confidence,
    agent_horizon_minutes: thesis.horizon_minutes,
    agent_reasoning: thesis.summary,
    agent_decision_at: decisionMadeAt,
    human_amount: amount,
    ai_amount: AI_BATTLE_STAKE_AURA,
    leverage,
    stake_reserved: false,
    ai_confidence_before: thesis.confidence,
    ai_confidence_after: thesis.confidence,
    entry_price: snapshot.price,
    exit_price: null,
    current_price: snapshot.price,
    ai_pnl: 0,
    human_pnl: 0,
    winner: null,
    status: "WAITING",
    thesis,
    challenges: [],
    started_at: null,
    duration_seconds,
    expires_at: null,
    ended_at: null,
    thesis_hash: null,
    challenge_hash: null,
    xlayer_tx_hash: null,
    xlayer_data_hash: null,
    xlayer_status: null,
    xlayer_error: null,
    xlayer_explorer_url: null,
    settlement_applied: false,
    createdAt: new Date().toISOString(),
  };
  try {
    await persistBattle(auth.supabase, auth.user.id, battle);
  } catch (error) {
    return serviceErrorResponse({
      error,
      scope: "POST /api/battles persist",
      message: "Unable to persist battle",
      kind: "persistence_failed",
    });
  }
  saveBattle(battle);
  return NextResponse.json({ battle });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const scoped = url.searchParams.get("scope") === "mine" || req.headers.has("authorization");
  if (scoped) {
    const auth = await getWalletAuth(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    try {
      const persisted = await listBattlesForUser(auth.supabase, auth.user.id);
      for (const battle of persisted) saveBattle(battle);
      const battles = status ? persisted.filter((battle) => battle.status === status) : persisted;
      return NextResponse.json({ battles });
    } catch (error) {
      return serviceErrorResponse({
        error,
        scope: "GET /api/battles",
        message: "Unable to load battle history",
        kind: "database_unavailable",
      });
    }
  }
  // Wallet-owned battle history is private. Public landing previews keep their
  // empty-state behavior until a separate explicitly public feed exists.
  const battles = listBattles({ status })
    .filter((battle) => !battle.userId.match(/^[0-9a-f-]{36}$/i))
    .map((battle) => normalizeBattleLeverage(normalizeBattleTiming(battle)));
  return NextResponse.json({ battles });
}
