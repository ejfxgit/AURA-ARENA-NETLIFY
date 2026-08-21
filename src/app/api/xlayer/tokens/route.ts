import { NextResponse } from "next/server";
import {
  getXLayerTokens,
  invalidateXLayerTokenCache,
  xLayerCredentialStatus,
  XLAYER_MAX_LIMIT,
} from "@/lib/market/xlayer-tokens";
import { intParam, marketErrorResponse } from "@/lib/market/http";

export const dynamic = "force-dynamic";

/**
 * Real X Layer ON-CHAIN tokens.
 *
 * This is blockchain data, NOT OKX Exchange market data. A token listed here
 * may have no OKX spot market at all, in which case no exchange price exists
 * for it and none is invented.
 *
 * Source: GET https://web3.okx.com/api/v5/xlayer/token/token-list
 *         chainShortName=xlayer, protocolType=token_20, page, limit, orderBy
 *
 * The upstream endpoint is AUTHENTICATED, so it is called only from here, on
 * the server. OKX credentials are read from server-only environment variables
 * and are never sent to the browser or included in any response.
 *
 * Query parameters
 *   page     1-based page number (default 1)
 *   limit    1..50 (default 50 — the documented maximum)
 *   orderBy  passed through when supplied
 *   refresh  "1" bypasses the server cache
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("refresh") === "1") invalidateXLayerTokenCache();

  const page = intParam(params, "page", 1, 1, 10_000);
  const limit = intParam(params, "limit", XLAYER_MAX_LIMIT, 1, XLAYER_MAX_LIMIT);
  const orderBy = (params.get("orderBy") || "").trim();

  // Reported up front so the UI can show a precise configuration state instead
  // of a generic failure. Variable NAMES only — never any value.
  const credentials = xLayerCredentialStatus();
  if (!credentials.configured) {
    return NextResponse.json(
      {
        error: {
          kind: "not_configured",
          message:
            "X Layer on-chain token data is not configured. Add the missing server-side environment variables and restart.",
          missingEnv: credentials.missing,
        },
        fetchedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }

  try {
    const result = await getXLayerTokens({ page, limit, orderBy });
    return NextResponse.json(result);
  } catch (error) {
    return marketErrorResponse(error, "GET /api/xlayer/tokens");
  }
}
