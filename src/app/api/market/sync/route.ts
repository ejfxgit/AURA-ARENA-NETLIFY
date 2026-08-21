import { NextResponse } from "next/server";
import { getMarkets, invalidateMarketCache } from "@/lib/market/okx";
import { marketErrorResponse } from "@/lib/market/http";

export const dynamic = "force-dynamic";

/**
 * Warms the server-side OKX cache so browsers read from cache rather than
 * causing an upstream call each. Reports a real failure if OKX is unavailable —
 * it never reports a successful sync it did not perform.
 *
 * Warms the WHOLE live SPOT universe. getMarkets() with no argument is a single
 * bulk request (/api/v5/market/tickers), so covering every instrument costs the
 * same upstream call as covering three — there is no reason to pre-pick symbols.
 */
export async function POST() {
  try {
    invalidateMarketCache();
    const markets = await getMarkets();
    return NextResponse.json({
      synced: markets.length,
      at: new Date().toISOString(),
    });
  } catch (error) {
    return marketErrorResponse(error, "POST /api/market/sync");
  }
}

export const GET = POST;
