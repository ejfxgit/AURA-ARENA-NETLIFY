import { NextResponse } from "next/server";
import { z } from "zod";
import { getWalletAuth } from "@/lib/supabase/aura";
import { assetBySymbol } from "@/lib/market/assets";
import { getMarkets, isTradableInstrument } from "@/lib/market/okx";
import { marketErrorResponse } from "@/lib/market/http";

export const dynamic = "force-dynamic";

/**
 * Per-user market watchlist.
 *
 * The table stores instrument ids only. Every price, change and volume in the
 * response is fetched live from the OKX Exchange API on each read, so the
 * database is never a source of market data.
 *
 * Ownership comes from the verified session (auth.user.id); the request never
 * supplies a user id, and the market_watchlist RLS policies enforce the same
 * rule inside Postgres.
 */

const MIGRATION = "supabase/migrations/202608180004_market_watchlist.sql";
const MAX_ENTRIES = 100;

const addSchema = z.object({
  instId: z.string().min(3).max(41),
});

function describeDbError(error: { code?: string }): { message: string; status: number } {
  if (error.code === "42P01") {
    return { message: `The market_watchlist table does not exist. Apply ${MIGRATION}.`, status: 500 };
  }
  if (error.code === "42703") {
    return { message: `The market_watchlist table is missing a column. Apply ${MIGRATION}.`, status: 500 };
  }
  if (error.code === "23505" || error.code === "23514") {
    return { message: "That instrument id was rejected by the database.", status: 400 };
  }
  return { message: "Unable to load your watchlist.", status: 500 };
}

function logDbError(scope: string, error: unknown): void {
  const detail = error as { code?: string; message?: string; details?: string | null };
  console.error(`[watchlist] ${scope} database error`, {
    code: detail?.code,
    message: detail?.message,
    details: detail?.details,
  });
}

/** Watchlist instrument ids plus their live OKX quotes. */
export async function GET(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("market_watchlist")
    .select("inst_id, created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    logDbError("GET", error);
    const described = describeDbError(error);
    return NextResponse.json({ error: described.message }, { status: described.status });
  }

  const instIds = (data ?? []).map((row) => String(row.inst_id));
  if (instIds.length === 0) {
    return NextResponse.json({ instIds: [], markets: [], fetchedAt: new Date().toISOString() });
  }

  // A market-feed outage must not hide the saved list, so the ids are always
  // returned; the quotes carry their own error state.
  try {
    const markets = await getMarkets(instIds);
    return NextResponse.json({ instIds, markets, fetchedAt: new Date().toISOString() });
  } catch (marketError) {
    const response = marketErrorResponse(marketError, "GET /api/watchlist quotes");
    const body = await response.json();
    return NextResponse.json(
      { instIds, markets: [], error: body.error, fetchedAt: new Date().toISOString() },
      { status: 200 },
    );
  }
}

/** Adds one instrument, but only if OKX actually lists it as live. */
export async function POST(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide an instrument id such as BTC-USDT." }, { status: 400 });
  }

  const def = assetBySymbol(parsed.data.instId);
  if (!def) {
    return NextResponse.json({ error: `"${parsed.data.instId}" is not a valid instrument id.` }, { status: 400 });
  }

  // Verified against the real OKX instrument catalogue: an instrument that OKX
  // does not list cannot be saved, so the watchlist can hold no invented market.
  try {
    if (!(await isTradableInstrument(def.instId))) {
      return NextResponse.json(
        { error: `OKX does not list a live SPOT market for ${def.instId}.` },
        { status: 404 },
      );
    }
  } catch (error) {
    return marketErrorResponse(error, "POST /api/watchlist validation");
  }

  const { count, error: countError } = await auth.supabase
    .from("market_watchlist")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.user.id);

  if (countError) {
    logDbError("POST count", countError);
    const described = describeDbError(countError);
    return NextResponse.json({ error: described.message }, { status: described.status });
  }
  if ((count ?? 0) >= MAX_ENTRIES) {
    return NextResponse.json(
      { error: `A watchlist holds at most ${MAX_ENTRIES} markets.` },
      { status: 409 },
    );
  }

  const { error } = await auth.supabase
    .from("market_watchlist")
    .upsert({ user_id: auth.user.id, inst_id: def.instId }, { onConflict: "user_id,inst_id" });

  if (error) {
    logDbError("POST", error);
    const described = describeDbError(error);
    return NextResponse.json({ error: described.message }, { status: described.status });
  }

  return NextResponse.json({ instId: def.instId, added: true });
}

/** Removes one instrument. Idempotent. */
export async function DELETE(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const instId = (new URL(req.url).searchParams.get("instId") || "").trim().toUpperCase();
  const def = assetBySymbol(instId);
  if (!def) {
    return NextResponse.json({ error: "Provide an instrument id such as BTC-USDT." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("market_watchlist")
    .delete()
    .eq("user_id", auth.user.id)
    .eq("inst_id", def.instId);

  if (error) {
    logDbError("DELETE", error);
    const described = describeDbError(error);
    return NextResponse.json({ error: described.message }, { status: described.status });
  }

  return NextResponse.json({ instId: def.instId, removed: true });
}
