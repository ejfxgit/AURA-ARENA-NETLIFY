import { NextResponse } from "next/server";
import { saveBattle } from "@/lib/store";
import { loadAuthoritativeBattle } from "@/lib/battle/persistence";
import { assetBySymbol, getPrice } from "@/lib/market/adapter";
import { updateLivePnl } from "@/lib/battle/engine";
import { getFinalizationStatus } from "@/lib/chain/onchain";
import type { Battle } from "@/lib/types";
import { getWalletAuth, persistBattle, persistUnsettledBattle } from "@/lib/supabase/aura";
import { serviceErrorResponse } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// Returns the battle with a fresh server-computed live price + P&L.
export async function GET(
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
      scope: `GET /api/battles/${params.id}`,
      message: "Unable to load battle",
      kind: "database_unavailable",
    });
  }
  if (!battle) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (battle.status === "SETTLING" && battle.xlayer_tx_hash) {
    const verification = await getFinalizationStatus(battle.xlayer_tx_hash);
    battle.xlayer_status = verification;
    if (verification === "VERIFIED") battle.status = "VERIFIED";
    if (verification === "FAILED") {
      battle.status = "FINISHED";
      battle.xlayer_error = "X Layer transaction reverted. Retry is available.";
    }
    saveBattle(battle);
    await persistBattle(auth.supabase, auth.user.id, battle);
  }

  // Live polling is a read path, so an OKX outage does not invalidate the
  // battle: the last real price is retained rather than replaced with an
  // invented one. It is reported as stale so the UI never presents an old quote
  // as the current market price.
  let priceStale = false;
  if (battle.status === "ACTIVE") {
    const def = assetBySymbol(battle.asset);
    if (def) {
      try {
        const price = await getPrice(def);
        const updated = updateLivePnl(battle, price);
        Object.assign(battle, updated);
        // Conditional write: a settlement can land between the read above and
        // this write, and a settled result is canonical. When that happens the
        // live snapshot is discarded and the persisted battle is published
        // instead, so polling can never overwrite or hide a settlement.
        const written = await persistUnsettledBattle(auth.supabase, auth.user.id, battle);
        if (written) {
          saveBattle(battle);
        } else {
          const persisted = await loadAuthoritativeBattle(auth.supabase, auth.user.id, params.id);
          if (persisted) battle = persisted;
        }
      } catch {
        priceStale = true;
      }
    } else {
      priceStale = true;
    }
  }
  return NextResponse.json({ battle, priceStale });
}
