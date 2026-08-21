import { NextResponse } from "next/server";
import { getMarkets, invalidateMarketCache } from "@/lib/market/okx";
import { intParam, marketErrorResponse } from "@/lib/market/http";
import type { NormalizedMarket } from "@/lib/market/okx-types";

export const dynamic = "force-dynamic";

/**
 * Real OKX Exchange SPOT markets.
 *
 * Source: GET /api/v5/public/instruments?instType=SPOT (catalogue)
 *       + GET /api/v5/market/tickers?instType=SPOT     (quotes, one request)
 * Both are public OKX endpoints; no credentials are sent.
 *
 * Query parameters
 *   q        search over instId / base / quote / long name
 *   quote    restrict to a quote currency, e.g. USDT
 *   instIds  comma-separated instrument ids (used by the watchlist)
 *   limit    row cap, 1..500 (default 150)
 *   sort     "volume" (default) | "change" | "name"
 *   refresh  "1" bypasses the server cache for an explicit user refresh
 *
 * On failure this returns a real error status. It never returns fabricated
 * markets and never falls back to seeded values.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;

  if (params.get("refresh") === "1") invalidateMarketCache();

  const query = (params.get("q") || "").trim().toUpperCase();
  const quote = (params.get("quote") || "").trim().toUpperCase();
  const instIdsParam = (params.get("instIds") || "").trim();
  const limit = intParam(params, "limit", 150, 1, 500);
  const sort = params.get("sort") || "volume";

  try {
    const requested = instIdsParam
      ? instIdsParam.split(",").map((id) => id.trim().toUpperCase()).filter(Boolean).slice(0, 500)
      : undefined;

    let markets = await getMarkets(requested);

    if (quote) markets = markets.filter((market) => market.quoteCurrency === quote);

    if (query) {
      markets = markets.filter(
        (market) =>
          market.instId.includes(query) ||
          market.baseCurrency.includes(query) ||
          market.quoteCurrency.includes(query) ||
          market.baseName.toUpperCase().includes(query),
      );
    }

    markets.sort(comparator(sort, query));

    const total = markets.length;
    return NextResponse.json({
      markets: markets.slice(0, limit),
      total,
      returned: Math.min(total, limit),
      truncated: total > limit,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return marketErrorResponse(error, "GET /api/markets");
  }
}

function comparator(sort: string, query: string) {
  return (a: NormalizedMarket, b: NormalizedMarket): number => {
    // With an active search, exact ticker matches surface first.
    if (query) {
      const aExact = a.baseCurrency === query ? 0 : 1;
      const bExact = b.baseCurrency === query ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
    }
    if (sort === "name") return a.instId.localeCompare(b.instId);
    if (sort === "change") {
      // Markets with no computable change sort last rather than as 0%.
      const av = a.change24hPercent;
      const bv = b.change24hPercent;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return bv - av;
    }
    return b.volume24hQuote - a.volume24hQuote;
  };
}
