import { NextResponse } from "next/server";
import { assetBySymbol } from "@/lib/market/assets";
import { getCandles, getMarket, invalidateMarketCache } from "@/lib/market/okx";
import { intParam, marketErrorResponse } from "@/lib/market/http";
import { isCandleBar, MarketDataError, type CandleBar } from "@/lib/market/okx-types";

export const dynamic = "force-dynamic";

/**
 * One real OKX SPOT market plus its real candles.
 *
 * Source: GET /api/v5/market/ticker?instId=...  (or the pooled tickers cache)
 *       + GET /api/v5/market/candles?instId=...&bar=...
 * Public OKX endpoints; no credentials are sent.
 *
 * Accepts "btc" (base only, defaults to the USDT quote) or a full "btc-usdt".
 *
 * Query parameters
 *   bar      candle interval: 1m | 5m | 15m | 1H | 4H | 1D (default 1m)
 *   limit    candle count, 1..300 (default 100)
 *   refresh  "1" bypasses the server cache
 *
 * Candles are requested independently of the quote: if only the chart fails the
 * quote is still returned, with an explicit chart error. Neither is ever
 * substituted with generated data.
 */
export async function GET(req: Request, { params }: { params: { symbol: string } }) {
  const search = new URL(req.url).searchParams;
  if (search.get("refresh") === "1") invalidateMarketCache();

  const barParam = search.get("bar") || "1m";
  if (!isCandleBar(barParam)) {
    return NextResponse.json(
      { error: { kind: "unknown_instrument", message: `Unsupported interval "${barParam}".` } },
      { status: 400 },
    );
  }
  const bar: CandleBar = barParam;
  const limit = intParam(search, "limit", 100, 1, 300);

  const def = assetBySymbol(params.symbol);
  if (!def) {
    return NextResponse.json(
      { error: { kind: "unknown_instrument", message: `"${params.symbol}" is not a valid instrument id.` } },
      { status: 400 },
    );
  }

  try {
    const market = await getMarket(def.instId);

    // The chart is allowed to fail on its own without taking the quote down.
    let candles: Awaited<ReturnType<typeof getCandles>> = [];
    let candleError: { kind: string; message: string } | undefined;
    try {
      candles = await getCandles(def.instId, bar, limit);
    } catch (error) {
      candleError =
        error instanceof MarketDataError
          ? { kind: error.kind, message: error.message }
          : { kind: "http", message: "Chart data unavailable." };
      console.error(`[markets] candles for ${def.instId} failed: ${candleError.kind}`);
    }

    return NextResponse.json({
      market,
      candles,
      bar,
      candleError,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return marketErrorResponse(error, `GET /api/markets/${params.symbol}`);
  }
}
