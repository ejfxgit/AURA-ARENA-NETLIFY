// Symbol <-> OKX instrument-id resolution.
//
// This file contains NO market data. It holds only:
//   * a deterministic symbol -> OKX instId mapping (string manipulation, no prices)
//   * display labels for well-known base currencies (cosmetic text, not financial data)
//   * the default instruments the UI pre-selects
//
// Whether an instrument actually exists is never assumed here. It is validated
// against the real instrument list returned by
// GET /api/v5/public/instruments?instType=SPOT (see ./okx.ts).

/** Quote currency used when a caller supplies only a base currency ("BTC"). */
export const DEFAULT_QUOTE = "USDT";

export interface AssetDef {
  /** Base currency, e.g. "BTC". Battles persist this value. */
  symbol: string;
  /** OKX SPOT instrument id, e.g. "BTC-USDT". */
  instId: string;
  /** Quote currency, e.g. "USDT". */
  quote: string;
  /** Human label for the base currency. Cosmetic only. */
  name: string;
}

/**
 * Cosmetic display names for common base currencies. OKX's instrument endpoint
 * returns `baseCcy` ("BTC") but no long-form project name, so the label is
 * resolved here. Unknown currencies fall back to the ticker itself — never to a
 * fabricated name.
 */
const DISPLAY_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  DOT: "Polkadot",
  LTC: "Litecoin",
  BCH: "Bitcoin Cash",
  TON: "Toncoin",
  TRX: "TRON",
  SUI: "Sui",
  APT: "Aptos",
  ARB: "Arbitrum",
  OP: "Optimism",
  MATIC: "Polygon",
  NEAR: "NEAR Protocol",
  ATOM: "Cosmos",
  FIL: "Filecoin",
  UNI: "Uniswap",
  AAVE: "Aave",
  OKB: "OKB",
  PEPE: "Pepe",
  SHIB: "Shiba Inu",
  WLD: "Worldcoin",
  TIA: "Celestia",
  SEI: "Sei",
  INJ: "Injective",
  STX: "Stacks",
  ETC: "Ethereum Classic",
  XLM: "Stellar",
  ICP: "Internet Computer",
  HBAR: "Hedera",
  USDC: "USD Coin",
  USDT: "Tether",
};

export function displayNameFor(baseCcy: string): string {
  return DISPLAY_NAMES[baseCcy.toUpperCase()] || baseCcy.toUpperCase();
}

/** OKX currency codes are uppercase alphanumerics. */
const CCY = /^[A-Z0-9]{1,20}$/;

/**
 * Resolves a caller-supplied symbol into an OKX SPOT instrument definition.
 *
 * Accepts, case-insensitively:
 *   "BTC"        -> BTC-USDT   (bare base currency, default quote)
 *   "BTC-USDT"   -> BTC-USDT   (full instrument id)
 *   "BTC/USDT"   -> BTC-USDT   (slash-separated pair)
 *
 * Returns undefined for anything that is not a syntactically valid instrument
 * id. This is pure string parsing: it proves nothing about whether OKX lists
 * the instrument, which ./okx.ts verifies against the live instrument list.
 */
export function assetBySymbol(symbol: string): AssetDef | undefined {
  const raw = (symbol || "").trim().toUpperCase().replace(/\//g, "-");
  if (!raw) return undefined;

  const parts = raw.split("-").filter(Boolean);
  if (parts.length > 2) return undefined;

  const base = parts[0];
  const quote = parts[1] || DEFAULT_QUOTE;
  if (!CCY.test(base) || !CCY.test(quote)) return undefined;
  if (base === quote) return undefined;

  return {
    symbol: base,
    instId: `${base}-${quote}`,
    quote,
    name: displayNameFor(base),
  };
}

/** Builds an AssetDef from an instrument the OKX API actually returned. */
export function assetFromInstrument(baseCcy: string, quoteCcy: string): AssetDef {
  const base = baseCcy.toUpperCase();
  const quote = quoteCcy.toUpperCase();
  return { symbol: base, instId: `${base}-${quote}`, quote, name: displayNameFor(base) };
}

/**
 * NOTE: there is deliberately NO exported list of default/preselected
 * instruments here.
 *
 * The tradable market list has exactly one source: the live OKX SPOT instrument
 * catalogue (GET /api/v5/public/instruments), surfaced to the browser through
 * /api/markets and consumed via useMarketRegistry(). UI defaults are resolved
 * from that registry (highest 24h quote volume), so a three-symbol array can no
 * longer silently become the app's idea of "the markets".
 */
