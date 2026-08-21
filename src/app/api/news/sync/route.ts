import { NextResponse } from "next/server";
import { assetBySymbol } from "@/lib/market/adapter";
import { fetchAssetNews } from "@/lib/news/rss";

export const dynamic = "force-dynamic";

/**
 * Real news for one asset, from public RSS/Atom feeds.
 *
 * No API key and no paid subscription: the default sources are the outlets' own
 * published feeds, overridable with NEWS_RSS_FEEDS. Every article returned was
 * published by the named outlet, and the URL is the outlet's own link.
 *
 * The three outcomes are reported distinctly and never blended:
 *   200 AVAILABLE   — real articles about this asset
 *   200 NO_MATCHES  — feeds answered, no current coverage of this asset
 *   503 UNAVAILABLE — every feed failed; `items` is empty and `reason` says why
 *
 * Nothing is ever substituted for a failed feed.
 */
export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json({ error: "A symbol is required" }, { status: 400 });
  }

  // The ticker and display name both come from the OKX instrument registry, so
  // relevance matching uses the same identifiers the rest of the app trades on.
  const def = assetBySymbol(symbol);
  if (!def) return NextResponse.json({ error: "Unknown asset" }, { status: 404 });

  const news = await fetchAssetNews({ symbol: def.symbol, name: def.name });
  return NextResponse.json(news, { status: news.status === "UNAVAILABLE" ? 503 : 200 });
}

export const POST = GET;
