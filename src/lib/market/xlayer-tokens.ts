// X Layer ON-CHAIN token provider. SERVER-SIDE ONLY.
//
// This is NOT exchange market data. X Layer is a blockchain; this endpoint
// returns on-chain token records for it. OKX Exchange SPOT prices come from an
// entirely different provider (./okx.ts) and the two must never be conflated:
// an X Layer token having a `price` field here does not make it a tradable OKX
// spot market, and a token with no OKX market must never be shown an OKX price.
//
// Source (supplied and verified by the project owner):
//   GET https://web3.okx.com/api/v5/xlayer/token/token-list
//   params: chainShortName=xlayer, protocolType=token_20, page, limit, orderBy
//   limit maximum: 50
//
// AUTHENTICATION — PARTIALLY UNVERIFIED, READ BEFORE RELYING ON THIS:
// This endpoint requires OKX credentials. AURA implements the standard OKX v5
// signing scheme (HMAC-SHA256 over timestamp + method + requestPath + body,
// sent as OK-ACCESS-KEY / OK-ACCESS-SIGN / OK-ACCESS-TIMESTAMP /
// OK-ACCESS-PASSPHRASE), plus the OK-ACCESS-PROJECT header used by OKX's
// Web3/OnchainOS products when a project id is configured.
//
// The exact required header set for THIS specific endpoint could not be read
// from the official documentation (the docs site renders client-side and was
// unreachable). If OKX rejects the request, the error is surfaced verbatim
// rather than masked, and no token data is invented. Confirm the header set
// against https://web3.okx.com/id/onchainos/dev-docs/xlayer/developer/data/token-list
// before treating this path as production-ready.
//
// Credentials are read from server-only environment variables. They are never
// exposed to the browser, never placed in NEXT_PUBLIC_* variables, and never
// logged.

import { createHmac } from "node:crypto";
import { serverConfig } from "../config";
import { MarketDataError } from "./okx-types";
import {
  XLAYER_MAX_LIMIT,
  type XLayerToken,
  type XLayerTokenPage,
  type XLayerTokenRow,
} from "./xlayer-types";

// Types live in ./xlayer-types.ts so client components can import them without
// reaching this module's credentials or node:crypto dependency.
export { XLAYER_MAX_LIMIT } from "./xlayer-types";
export type { XLayerToken, XLayerTokenPage, XLayerTokenRow } from "./xlayer-types";

// -- parsing ----------------------------------------------------------------

/** Absent/blank/unparseable -> null. Never silently becomes zero. */
function numberOrNull(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function stringOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function toXLayerToken(row: XLayerTokenRow): XLayerToken {
  const ticker = stringOrNull(row.token) ?? "";
  return {
    name: stringOrNull(row.tokenFullName) ?? ticker,
    ticker,
    contractAddress: stringOrNull(row.tokenContractAddress) ?? "",
    protocolType: stringOrNull(row.protocolType) ?? "",
    precision: numberOrNull(row.precision),
    priceUsd: numberOrNull(row.price),
    marketCapUsd: numberOrNull(row.totalMarketCap),
    transactionAmount24h: numberOrNull(row.transactionAmount24h),
    tvl: numberOrNull(row.tvl),
    holderCount: numberOrNull(row.addressCount),
    totalSupply: numberOrNull(row.totalSupply),
    circulatingSupply: numberOrNull(row.circulatingSupply),
    website: stringOrNull(row.website),
    issueDate: stringOrNull(row.issueDate),
  };
}

// -- auth -------------------------------------------------------------------

export interface XLayerCredentialStatus {
  configured: boolean;
  /** Names of the missing env vars — names only, never values. */
  missing: string[];
}

/** Reports which credentials are absent. Returns variable NAMES only. */
export function xLayerCredentialStatus(): XLayerCredentialStatus {
  const missing: string[] = [];
  if (!serverConfig.okxApiKey) missing.push("OKX_API_KEY");
  if (!serverConfig.okxApiSecret) missing.push("OKX_API_SECRET");
  if (!serverConfig.okxApiPassphrase) missing.push("OKX_API_PASSPHRASE");
  return { configured: missing.length === 0, missing };
}

/**
 * Standard OKX v5 request signature.
 * sign = base64( HMAC-SHA256( timestamp + METHOD + requestPath + body, secret ) )
 * `requestPath` must include the query string exactly as sent.
 */
function signRequest(timestamp: string, method: string, requestPath: string, body: string): string {
  return createHmac("sha256", serverConfig.okxApiSecret)
    .update(`${timestamp}${method.toUpperCase()}${requestPath}${body}`)
    .digest("base64");
}

// -- cache ------------------------------------------------------------------

const TTL_MS = 60_000;
const pageCache = new Map<string, { value: XLayerTokenPage; expires: number }>();

export function invalidateXLayerTokenCache(): void {
  pageCache.clear();
}

// -- fetch ------------------------------------------------------------------

/**
 * Fetches one page of real X Layer on-chain tokens.
 *
 * Throws MarketDataError("not_configured") when credentials are absent — the
 * UI then shows a configuration error. It never returns placeholder tokens.
 */
export async function getXLayerTokens(options?: {
  page?: number;
  limit?: number;
  orderBy?: string;
}): Promise<XLayerTokenPage> {
  const credentials = xLayerCredentialStatus();
  if (!credentials.configured) {
    throw new MarketDataError(
      "not_configured",
      `X Layer on-chain token data requires server credentials. Missing: ${credentials.missing.join(", ")}.`,
      undefined,
      503,
    );
  }

  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const limit = Math.max(1, Math.min(XLAYER_MAX_LIMIT, Math.floor(options?.limit ?? XLAYER_MAX_LIMIT)));
  const orderBy = options?.orderBy ?? "";

  const cacheKey = `${page}:${limit}:${orderBy}`;
  const hit = pageCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value;

  const query = new URLSearchParams({
    chainShortName: "xlayer",
    protocolType: "token_20",
    page: String(page),
    limit: String(limit),
  });
  if (orderBy) query.set("orderBy", orderBy);

  // The signature must cover the path + query exactly as transmitted.
  const requestPath = `/api/v5/xlayer/token/token-list?${query.toString()}`;
  const timestamp = new Date().toISOString();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "OK-ACCESS-KEY": serverConfig.okxApiKey,
    "OK-ACCESS-SIGN": signRequest(timestamp, "GET", requestPath, ""),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": serverConfig.okxApiPassphrase,
  };
  // Required by OKX Web3 / OnchainOS products. Sent only when configured.
  if (serverConfig.okxProjectId) headers["OK-ACCESS-PROJECT"] = serverConfig.okxProjectId;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(`${serverConfig.okxWeb3ApiBase}${requestPath}`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new MarketDataError(
      aborted ? "timeout" : "network",
      aborted
        ? "The X Layer token API did not respond in time"
        : "Could not reach the X Layer token API",
      undefined,
      504,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    throw new MarketDataError(
      "not_configured",
      "The X Layer token API rejected the configured OKX credentials (check the key, passphrase, project id and IP allowlist).",
      String(response.status),
      502,
    );
  }
  if (response.status === 429) {
    throw new MarketDataError("rate_limit", "X Layer token API rate limit reached.", "429", 429);
  }
  if (!response.ok) {
    throw new MarketDataError("http", `X Layer token API returned HTTP ${response.status}`, undefined, 502);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new MarketDataError("malformed", "X Layer token API returned a body that is not JSON", undefined, 502);
  }

  const envelope = body as { code?: unknown; msg?: unknown; data?: unknown };
  if (typeof envelope.code !== "string") {
    throw new MarketDataError("malformed", "X Layer token response is missing its `code` field", undefined, 502);
  }
  if (envelope.code !== "0") {
    const message = typeof envelope.msg === "string" && envelope.msg ? envelope.msg : "no message";
    throw new MarketDataError(
      "api_code",
      `X Layer token API rejected the request (code ${envelope.code}: ${message})`,
      envelope.code,
      502,
    );
  }
  if (!Array.isArray(envelope.data)) {
    throw new MarketDataError("malformed", "X Layer token response `data` was not an array", envelope.code, 502);
  }

  // The X Layer endpoints wrap their rows one level deeper than the exchange
  // API: data[0] carries the page envelope with the token array inside it.
  // Both shapes are accepted so a documented change in either direction still
  // yields real data rather than an empty screen.
  const first = envelope.data[0] as Record<string, unknown> | undefined;
  const nested = first && Array.isArray(first.tokenList) ? (first.tokenList as XLayerTokenRow[]) : null;
  const rows: XLayerTokenRow[] = nested ?? (envelope.data as XLayerTokenRow[]);

  const tokens = rows
    .filter((row): row is XLayerTokenRow => Boolean(row) && typeof row === "object")
    .map(toXLayerToken)
    // A record with neither a ticker nor a contract address is not usable.
    .filter((token) => token.ticker || token.contractAddress);

  const result: XLayerTokenPage = {
    tokens,
    page,
    limit,
    hasMore: tokens.length >= limit,
    fetchedAt: new Date().toISOString(),
  };

  pageCache.set(cacheKey, { value: result, expires: Date.now() + TTL_MS });
  return result;
}
