// X Layer on-chain token types.
//
// Deliberately free of server-only imports (no node:crypto, no serverConfig) so
// client components can import these types without any risk of pulling the
// authenticated fetch implementation — or its credentials — into the browser
// bundle. The implementation lives in ./xlayer-tokens.ts, server-side only.

/**
 * One on-chain token record, field-for-field as named by the X Layer
 * token-list API. Every numeric arrives as a string, and every field is
 * optional because the API documents them as "can contain": absence is
 * reported as null, never as 0.
 */
export interface XLayerTokenRow {
  tokenFullName?: string;
  token?: string;
  precision?: string;
  tokenContractAddress?: string;
  protocolType?: string;
  addressCount?: string;
  totalSupply?: string;
  circulatingSupply?: string;
  price?: string;
  website?: string;
  totalMarketCap?: string;
  issueDate?: string;
  transactionAmount24h?: string;
  tvl?: string;
}

/** AURA's normalized on-chain token. `null` means "OKX did not supply it". */
export interface XLayerToken {
  /** Long name, e.g. "Wrapped Ether". */
  name: string;
  /** Ticker, e.g. "WETH". */
  ticker: string;
  contractAddress: string;
  protocolType: string;
  precision: number | null;
  /**
   * USD price as reported on-chain by OKX for this token contract.
   * This is NOT an OKX Exchange spot quote and must never be presented as one.
   */
  priceUsd: number | null;
  marketCapUsd: number | null;
  transactionAmount24h: number | null;
  tvl: number | null;
  holderCount: number | null;
  totalSupply: number | null;
  circulatingSupply: number | null;
  website: string | null;
  issueDate: string | null;
}

export interface XLayerTokenPage {
  tokens: XLayerToken[];
  page: number;
  limit: number;
  /** True when the page came back full, so another page may exist. */
  hasMore: boolean;
  fetchedAt: string;
}

/** Maximum page size the token-list endpoint accepts. */
export const XLAYER_MAX_LIMIT = 50;
