import { NextResponse } from "next/server";
import { saveBattle } from "@/lib/store";
import { loadAuthoritativeBattle } from "@/lib/battle/persistence";
import { assetBySymbol, getPrice } from "@/lib/market/adapter";
import { marketErrorResponse } from "@/lib/market/http";
import type { Battle } from "@/lib/types";
import { expiresAtFor, isBattleDurationSeconds } from "@/lib/battle/timing";
import { getWalletAuth, startWalletBattle } from "@/lib/supabase/aura";
import { isSupportedLeverage } from "@/lib/battle/leverage";
import { serviceErrorResponse } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Supabase is the source of truth; the store is only a cache.
  let battle: Battle | undefined;
  try {
    battle = (await loadAuthoritativeBattle(auth.supabase, auth.user.id, params.id)) ?? undefined;
  } catch (error) {
    return serviceErrorResponse({
      error,
      scope: `POST /api/battles/${params.id}/start load`,
      message: "Unable to load battle",
      kind: "database_unavailable",
    });
  }
  if (!battle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (battle.status !== "WAITING") {
    return NextResponse.json({ battle }); // idempotent
  }
  if (!isBattleDurationSeconds(battle.duration_seconds)) {
    return NextResponse.json({ error: "Battle has an invalid duration." }, { status: 409 });
  }
  if (!isSupportedLeverage(battle.leverage)) {
    return NextResponse.json({ error: "Battle has an invalid leverage." }, { status: 409 });
  }

  // Anchor the entry price to a real quote taken at the moment the battle
  // starts. Every later P&L number is measured from it, so there is no
  // acceptable substitute: if OKX cannot supply a price the battle does not
  // start. Falling back to the creation-time snapshot would silently anchor the
  // position to a stale quote and misstate the result.
  const def = assetBySymbol(battle.asset);
  if (!def) {
    return NextResponse.json({ error: "Unknown asset" }, { status: 404 });
  }
  try {
    battle.entry_price = await getPrice(def);
    battle.current_price = battle.entry_price;
  } catch (error) {
    return marketErrorResponse(error, `POST /api/battles/${params.id}/start`);
  }
  battle.status = "ACTIVE";
  const startedAt = new Date().toISOString();
  battle.started_at = startedAt;
  battle.expires_at = expiresAtFor(startedAt, battle.duration_seconds);
  // Persist before the response so a battle can never appear started while the
  // persisted row still says WAITING. A failure leaves it retryable.
  battle.stake_reserved = true;
  try {
    const started = await startWalletBattle(auth.supabase, battle);
    saveBattle(started.battle);
    return NextResponse.json({ battle: started.battle, account: started.account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to persist battle start";
    const status = /insufficient aura/i.test(message) ? 409 : 503;
    if (status === 409) {
      return NextResponse.json({ error: { kind: "insufficient_aura", message } }, { status });
    }
    return serviceErrorResponse({
      error,
      scope: `POST /api/battles/${params.id}/start persist`,
      message: "Unable to start battle",
      kind: "persistence_failed",
    });
  }
}
