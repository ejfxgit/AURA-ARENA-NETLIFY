import { NextResponse } from "next/server";
import {
  getAgentStats,
  saveAccount,
  saveAgentStats,
  saveBattle,
} from "@/lib/store";
import { loadAuthoritativeBattle } from "@/lib/battle/persistence";
import { assetBySymbol, getPrice } from "@/lib/market/adapter";
import { marketErrorResponse } from "@/lib/market/http";
import { updateLivePnl, computeWinner } from "@/lib/battle/engine";
import { buildBattleHashes } from "@/lib/chain/onchain";
import type { Battle } from "@/lib/types";
import { battleExpiresAt, isBattleExpired } from "@/lib/battle/timing";
import {
  getWalletAuth,
  loadWalletAccount,
  settleWalletBattle,
  type SettlementOutcome,
} from "@/lib/supabase/aura";
import { serviceErrorResponse } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Server-authoritative settlement. The client cannot submit its own P&L.
//
// Ordering is deliberate and must not be rearranged:
//   1. load the persisted battle from Supabase (never a cached in-memory copy)
//   2. take a real OKX exit price, or refuse
//   3. compute the result onto a DRAFT payload — the loaded battle is never
//      mutated, so nothing local, cached or returned is FINISHED or settled yet
//   4. run the settlement transaction, which credits the account and stores the
//      battle atomically
//   5. only then adopt the canonical settled battle it returns as the final state
// A failure at step 2 or 4 leaves the battle ACTIVE and unsettled everywhere, so
// it stays retryable and never appears settled without a persisted record.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let battle: Battle | undefined;
  try {
    battle = (await loadAuthoritativeBattle(auth.supabase, auth.user.id, params.id)) ?? undefined;
  } catch (error) {
    return serviceErrorResponse({
      error,
      scope: `POST /api/battles/${params.id}/finish load`,
      message: "Unable to load battle",
      kind: "database_unavailable",
    });
  }
  if (!battle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (battle.status === "VERIFIED" || battle.status === "SETTLING") {
    return NextResponse.json({ battle, account: auth.bundle.account }); // idempotent
  }
  if (battle.status === "FINISHED" && battle.settlement_applied) {
    return NextResponse.json({ battle, account: auth.bundle.account });
  }
  if (battle.status === "WAITING") {
    return NextResponse.json({ error: "Battle has not started." }, { status: 400 });
  }
  if (battleExpiresAt(battle) === null) {
    return NextResponse.json({ error: "Battle timing is invalid." }, { status: 409 });
  }
  if (!isBattleExpired(battle)) {
    return NextResponse.json(
      { error: "Battle is still active.", battle },
      { status: 409 },
    );
  }

  // The exit price decides both P&Ls, the winner, the balance change and the
  // reputation update, and it is written to the record permanently. It must
  // therefore be a real quote. When OKX cannot supply one the battle is left
  // untouched and the client can retry: settling against the last known price
  // would book a real balance change against a stale number.
  const def = assetBySymbol(battle.asset);
  if (!def) {
    return NextResponse.json({ error: "Unknown asset" }, { status: 404 });
  }
  let price: number;
  try {
    price = await getPrice(def);
  } catch (error) {
    return marketErrorResponse(error, `POST /api/battles/${params.id}/finish`);
  }

  const acc = auth.bundle.account;
  if (!acc) return NextResponse.json({ error: "Wallet onboarding required" }, { status: 403 });
  saveAccount(acc);

  // Draft result. This object is ONLY the payload for the settlement
  // transaction: it is never returned, never cached and never mutates the loaded
  // battle, so nothing appears FINISHED or settled unless the transaction below
  // succeeds. `settlement_applied` belongs in the payload because it is the flag
  // that makes the settlement idempotent, and it is written by the same
  // transaction that credits the account — 202608200001 also stamps it
  // server-side, inside that transaction, so it cannot be true without the
  // credit having happened.
  const draft: Battle = updateLivePnl(battle, price);
  draft.exit_price = price;
  draft.winner = computeWinner(draft.human_pnl, draft.ai_pnl);
  draft.status = "FINISHED";
  draft.ended_at = new Date().toISOString();
  draft.settlement_applied = true;
  const hashes = buildBattleHashes(draft);
  draft.thesis_hash = hashes.thesis_hash;
  draft.challenge_hash = hashes.challenge_hash;

  const valid = draft.challenges.filter((c) => c.recalculation?.materiallyValid).length;
  const invalid = draft.challenges.length - valid;

  // Balance, counters, reputation and the battle row move together, and only the
  // request that actually credits the account gets `applied: true`. A concurrent
  // request receives the already-stored battle instead of its own draft, so the
  // published exit price and winner always match what the account was credited
  // against.
  let settled: SettlementOutcome;
  try {
    settled = await settleWalletBattle(auth.supabase, draft, valid, invalid);
  } catch (error) {
    return serviceErrorResponse({
      error,
      scope: `POST /api/battles/${params.id}/finish settle`,
      message: "Unable to persist battle settlement",
      kind: "persistence_failed",
    });
  }
  const settledBattle = settled.battle;

  if (settled.applied) {
    acc.realized_pnl = Number((acc.realized_pnl + settledBattle.human_pnl).toFixed(4));
    const releasedStake = settledBattle.stake_reserved ? settledBattle.human_amount : 0;
    acc.current_balance = Number(Math.max(acc.current_balance + releasedStake + settledBattle.human_pnl, 0).toFixed(4));
    acc.total_battles += 1;
    if (settledBattle.winner === "HUMAN") acc.wins += 1;
    else if (settledBattle.winner === "AI") acc.losses += 1;
    acc.valid_challenges += valid;
    acc.invalid_challenges += invalid;

    // Built-in specialists retain their public runtime stats. Private custom
    // agents derive performance from the owner's persisted battle history and
    // are intentionally excluded from the public leaderboard.
    const agentStats = settledBattle.agentId === "custom" ? null : getAgentStats(settledBattle.agentId);
    if (agentStats) {
      agentStats.realized_pnl = Number((agentStats.realized_pnl + settledBattle.ai_pnl).toFixed(4));
      if (settledBattle.winner === "AI") agentStats.wins += 1;
      else if (settledBattle.winner === "HUMAN") agentStats.losses += 1;
      agentStats.valid_challenges += valid;
      agentStats.defended_challenges += invalid;
      saveAgentStats(settledBattle.agentId, agentStats);
    }
  }

  // The transaction is the authority on the resulting balance. A read failure
  // here does not undo it, so it must not be reported as a settlement failure.
  try {
    const refreshed = await loadWalletAccount(auth.supabase, auth.user.id);
    if (refreshed.account) Object.assign(acc, refreshed.account);
  } catch {
    console.error(`[finish] settled ${settledBattle.id} but could not re-read the account`);
  }
  saveAccount(acc);

  saveBattle(settledBattle);
  return NextResponse.json({ battle: settledBattle, account: acc });
}
