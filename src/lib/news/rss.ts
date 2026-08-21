import { serverConfig } from "../config";
import type { NewsContext, NewsItem } from "../types";

// Free crypto news, fetched from public RSS/Atom feeds.
//
// No API key, no paid subscription, no account. Every article returned here was
// published by the outlet named in `source`, and every field is copied from the
// feed: title, link, publication time. Nothing is synthesized. When a feed is
// unreachable this module says so and returns no items — it never fills the gap.
//
// RSS carries no sentiment field, so NewsItem.sentiment stays null. Impact is
// classified by the model during analysis and reported as AI-derived, never
// attributed to the outlet.

/**
 * Public, keyless feeds. Both are the outlets' own published RSS endpoints.
 * Override with NEWS_RSS_FEEDS (comma-separated) to add or replace sources.
 */
const DEFAULT_FEEDS: ReadonlyArray<{ url: string; source: string }> = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
];

const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 180_000;
const MAX_ITEMS_PER_FEED = 40;

interface CachedFeed {
  items: NewsItem[];
  fetchedAt: number;
}

// Cached on globalThis so the dev server's module reloads do not re-hammer the
// outlets, and so concurrent battle creations share one fetch per feed.
const globalCache = globalThis as unknown as { __auraNewsCache?: Map<string, CachedFeed> };
const cache: Map<string, CachedFeed> = (globalCache.__auraNewsCache ??= new Map());

function configuredFeeds(): ReadonlyArray<{ url: string; source: string }> {
  if (serverConfig.newsRssFeeds.length === 0) return DEFAULT_FEEDS;
  return serverConfig.newsRssFeeds.map((url) => ({ url, source: hostOf(url) }));
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// -- minimal XML extraction ---------------------------------------------------
//
// Deliberately dependency-free: the shapes needed from RSS 2.0 and Atom are
// small and well defined. Anything that does not parse is skipped rather than
// guessed at.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#39;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function unwrap(value: string): string {
  const cdata = value.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return decodeEntities((cdata ? cdata[1] : value).trim());
}

/** First non-empty text value of any of the named tags. */
function tagText(block: string, tags: string[]): string | null {
  for (const tag of tags) {
    const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
    if (match) {
      const value = unwrap(match[1]);
      if (value) return value;
    }
  }
  return null;
}

/** RSS uses <link>text</link>; Atom uses <link href="..."/>. */
function entryLink(block: string): string | null {
  const atom = block.match(/<link[^>]*\shref=["']([^"']+)["'][^>]*\/?>/i);
  if (atom) return decodeEntities(atom[1].trim());
  const rss = tagText(block, ["link", "guid"]);
  return rss && /^https?:\/\//i.test(rss) ? rss : null;
}

function parseFeed(xml: string, fallbackSource: string): NewsItem[] {
  const channelTitle = tagText(xml.split(/<item[\s>]/i)[0] ?? "", ["title"]);
  const blocks = xml.match(/<(item|entry)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi) ?? [];
  const items: NewsItem[] = [];

  for (const block of blocks.slice(0, MAX_ITEMS_PER_FEED)) {
    const title = tagText(block, ["title"]);
    const url = entryLink(block);
    const published = tagText(block, ["pubDate", "published", "updated", "dc:date"]);
    if (!title || !url || !published) continue;

    const timestamp = new Date(published);
    // An unparseable date is skipped. Substituting "now" would assert a
    // publication time the feed never gave.
    if (Number.isNaN(timestamp.getTime())) continue;

    const rawSummary = tagText(block, ["description", "summary", "content"]);
    const summary = rawSummary ? stripTags(rawSummary).slice(0, 400) : null;

    items.push({
      id: url,
      title: stripTags(title),
      source: channelTitle || fallbackSource,
      url,
      publishedAt: timestamp.toISOString(),
      summary: summary && summary.length > 0 ? summary : null,
      // RSS publishes no sentiment. Left null on purpose.
      sentiment: null,
    });
  }

  return items;
}

async function fetchFeed(feed: { url: string; source: string }): Promise<NewsItem[]> {
  const cached = cache.get(feed.url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      signal: controller.signal,
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "User-Agent": "AURA-Arena/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${feed.url} responded ${res.status}`);
    const items = parseFeed(await res.text(), feed.source);
    cache.set(feed.url, { items, fetchedAt: Date.now() });
    return items;
  } finally {
    clearTimeout(timer);
  }
}

// -- relevance ----------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Whether an article is about this asset.
 *
 * The full name matches case-insensitively ("bitcoin"), while the ticker must
 * appear as a standalone upper-case token ("BTC"). Requiring upper case for the
 * ticker keeps short symbols from matching ordinary prose — an "OP" headline
 * about an operation is not news about Optimism.
 */
function isRelevant(item: NewsItem, symbol: string, name: string): boolean {
  const haystack = `${item.title} ${item.summary ?? ""}`;
  if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(haystack)) return true;
  if (name && name.toLowerCase() !== symbol.toLowerCase()) {
    return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(haystack);
  }
  return false;
}

/**
 * Real, asset-relevant news for one market.
 *
 * Feeds are fetched concurrently and independently: one dead outlet does not
 * suppress the others. Only when EVERY feed fails is the result UNAVAILABLE,
 * carrying the reason. Feeds that answer with nothing about this asset produce
 * NO_MATCHES, which is a fact about the news cycle rather than a failure.
 */
export async function fetchAssetNews(
  asset: { symbol: string; name: string },
  limit = 6,
): Promise<NewsContext> {
  const feeds = configuredFeeds();
  const fetchedAt = new Date().toISOString();
  const settled = await Promise.allSettled(feeds.map(fetchFeed));

  const failures: string[] = [];
  const collected: NewsItem[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") collected.push(...result.value);
    else failures.push(`${feeds[index].source}: ${result.reason instanceof Error ? result.reason.message : "unreachable"}`);
  });

  const sources = feeds.map((feed) => feed.source);

  if (failures.length === feeds.length) {
    console.error("[news] every feed failed", failures);
    return {
      status: "UNAVAILABLE",
      items: [],
      reason: `No news feed could be reached (${failures.join("; ")}).`,
      sources,
      fetchedAt,
    };
  }

  const seen = new Set<string>();
  const items = collected
    .filter((item) => isRelevant(item, asset.symbol, asset.name))
    .filter((item) => {
      // Syndicated stories repeat across outlets; key on URL and headline.
      const key = `${item.url}|${item.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
    .slice(0, limit);

  return {
    status: items.length > 0 ? "AVAILABLE" : "NO_MATCHES",
    items,
    reason: items.length > 0 ? null : `No recent ${asset.symbol} articles in ${sources.join(", ")}.`,
    sources,
    fetchedAt,
  };
}
