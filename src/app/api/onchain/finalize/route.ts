import { NextResponse } from "next/server";
import { z } from "zod";
import { saveBattle } from "@/lib/store";
import { loadAuthoritativeBattle } from "@/lib/battle/persistence";
import { finalizeOnChain } from "@/lib/chain/onchain";
import type { Battle } from "@/lib/types";
import { getWalletAuth, persistBattle } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

const schema = z.object({
  battleId: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  // Supabase is the source of truth. Anchoring must describe the persisted
  // settlement, so a stale in-memory copy must never be the object hashed or
  // written back.
  let battle: Battle | undefined;
  try {
    battle = (await loadAuthoritativeBattle(auth.supabase, auth.user.id, parsed.data.battleId)) ?? undefined;
  } catch {
    return NextResponse.json({ error: "Unable to load battle" }, { status: 503 });
  }
  if (!battle) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (battle.xlayer_status === "VERIFIED" && battle.xlayer_tx_hash) {
    return NextResponse.json({ battle });
  }
  if (battle.status === "WAITING" || battle.status === "ACTIVE") {
    return NextResponse.json(
      { error: "Battle must be finished before verification." },
      { status: 400 },
    );
  }

  battle.status = "SETTLING";
  battle.xlayer_status = "PENDING";
  battle.xlayer_error = null;
  saveBattle(battle);
  await persistBattle(auth.supabase, auth.user.id, battle);

  const result = await finalizeOnChain(battle, auth.walletAddress);
  battle.xlayer_tx_hash = result.txHash || null;
  battle.xlayer_data_hash = result.dataHash;
  battle.xlayer_status = result.status;
  battle.xlayer_error = result.error || null;
  battle.xlayer_explorer_url = result.explorerUrl;
  if (result.status === "VERIFIED") {
    battle.status = "VERIFIED";
  } else if (result.status === "PENDING") {
    battle.status = "SETTLING";
  } else {
    battle.status = "FINISHED";
  }
  saveBattle(battle);
  await persistBattle(auth.supabase, auth.user.id, battle);

  return NextResponse.json({ result, battle });
}
