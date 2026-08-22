// Server-only env access. Browser-safe values live in public-config.ts so this
// module can never be pulled into a client bundle by a public UI component.

function isPlaceholderSupabaseUrl(value: string): boolean {
  return /your-project\.supabase\.co/i.test(value) || /<supabase-project-ref>/i.test(value);
}

export function supabaseConfigError(kind: "public" | "admin" = "admin"): string | null {
  const missing: string[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const secret = process.env.SUPABASE_SECRET_KEY || "";
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishable) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (kind === "admin" && !secret) missing.push("SUPABASE_SECRET_KEY");
  if (missing.length) return `Supabase is not configured. Set ${missing.join(" and ")}.`;
  if (isPlaceholderSupabaseUrl(url)) return "NEXT_PUBLIC_SUPABASE_URL is still a placeholder. Set the real Supabase project URL.";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
      return "NEXT_PUBLIC_SUPABASE_URL must be a real https://*.supabase.co project URL.";
    }
  } catch {
    return "NEXT_PUBLIC_SUPABASE_URL is not a valid URL.";
  }
  if (!/^sb_(publishable|anon)_/.test(publishable) && !/^eyJ/.test(publishable)) {
    return "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a recognizable Supabase publishable/anon key.";
  }
  if (kind === "admin" && !/^sb_secret_/.test(secret) && !/^eyJ/.test(secret)) {
    return "SUPABASE_SECRET_KEY is not a recognizable Supabase secret/service-role key.";
  }
  return null;
}

export const serverConfig = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseSecret: process.env.SUPABASE_SECRET_KEY || "",
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  openrouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  xLayerRpc: process.env.X_LAYER_RPC_URL || "https://testrpc.xlayer.tech/terigon",
  xLayerChainId: Number(process.env.X_LAYER_CHAIN_ID || 1952),
  xLayerContract: process.env.X_LAYER_CONTRACT_ADDRESS || "",
  xLayerDeployerKey: process.env.X_LAYER_DEPLOYER_PRIVATE_KEY || "",

  // AURA -> USDT (X Layer Testnet) redemption treasury. SERVER ONLY.
  //
  // The private key signs every payout inside the route handler and must never
  // appear in a NEXT_PUBLIC_* variable, a client component or a response body.
  // The token address is required rather than defaulted: guessing a contract
  // would mean sending a redemption to an address nobody verified.
  xLayerUsdtAddress: process.env.X_LAYER_USDT_CONTRACT_ADDRESS || "",
  xLayerTreasuryKey: process.env.X_LAYER_TREASURY_PRIVATE_KEY || "",
  // OKX Exchange public market data (api/v5). PUBLIC endpoints: instruments,
  // tickers and candles need no key, secret or passphrase, so none is sent.
  okxApiBase: process.env.OKX_API_BASE_URL || "https://www.okx.com",

  // OKX Web3 / X Layer ON-CHAIN data. Separate system from the exchange above.
  // The token-list endpoint is authenticated, so these are server-only secrets:
  // they must never appear in a NEXT_PUBLIC_* variable or in client code.
  okxWeb3ApiBase: process.env.OKX_WEB3_API_BASE_URL || "https://web3.okx.com",
  okxApiKey: process.env.OKX_API_KEY || "",
  okxApiSecret: process.env.OKX_API_SECRET || "",
  okxApiPassphrase: process.env.OKX_API_PASSPHRASE || "",
  okxProjectId: process.env.OKX_PROJECT_ID || "",

  // News. Free public RSS/Atom feeds — no API key, no paid subscription. Override
  // the feed list with a comma-separated NEWS_RSS_FEEDS; the defaults live in
  // lib/news/rss.ts so an unset variable still yields real news.
  //
  // NEWS_API_BASE_URL is legacy. It pointed at a credentialed provider that was
  // never implemented, and nothing reads it for fetching any more. It is kept
  // only so an existing .env.local does not look broken.
  newsApiBase: process.env.NEWS_API_BASE_URL || "",
  newsRssFeeds: (process.env.NEWS_RSS_FEEDS || "")
    .split(",")
    .map((feed) => feed.trim())
    .filter((feed) => feed.length > 0),
};

export function hasOpenRouter() {
  return serverConfig.openrouterKey.length > 0;
}

export function hasSupabase() {
  return supabaseConfigError("admin") === null;
}

export function hasXLayerSigner() {
  return (
    serverConfig.xLayerContract.length > 0 &&
    serverConfig.xLayerDeployerKey.length > 0
  );
}

/**
 * Why the redemption treasury cannot be used, or null when it is ready.
 *
 * Returns VARIABLE NAMES only — never a value, never a partial key. A missing or
 * malformed treasury is a visible configuration error: no redemption is opened,
 * no AURA is debited and nothing is faked.
 */
export function treasuryConfigError(): string | null {
  const missing: string[] = [];
  if (!serverConfig.xLayerUsdtAddress) missing.push("X_LAYER_USDT_CONTRACT_ADDRESS");
  if (!serverConfig.xLayerTreasuryKey) missing.push("X_LAYER_TREASURY_PRIVATE_KEY");
  if (missing.length) {
    return `USDT Testnet redemption is not configured. Set ${missing.join(" and ")} in the server environment.`;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(serverConfig.xLayerUsdtAddress)) {
    return "X_LAYER_USDT_CONTRACT_ADDRESS is not a valid contract address.";
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(serverConfig.xLayerTreasuryKey)) {
    return "X_LAYER_TREASURY_PRIVATE_KEY is not a valid 32-byte hex private key.";
  }
  if (!serverConfig.xLayerRpc) {
    return "X_LAYER_RPC_URL is not configured.";
  }
  if (!Number.isFinite(serverConfig.xLayerChainId) || serverConfig.xLayerChainId <= 0) {
    return "X_LAYER_CHAIN_ID is not a valid chain id.";
  }
  return null;
}

export function hasTreasury() {
  return treasuryConfigError() === null;
}
