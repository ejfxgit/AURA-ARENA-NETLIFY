// Mode boundaries.
//
// AURA mixes two things that are easy to confuse, so they are named here once
// and referenced everywhere instead of being re-explained per component.
//
//   MARKET DATA  — always REAL.
//     Prices, 24h statistics and candles come from the OKX public API and its
//     websocket feed. There is no mock market mode, no seeded price generator
//     and no fallback price. When the feed is unavailable the UI shows an
//     unavailable/disconnected state; it never substitutes a number.
//
//   CAPITAL & SETTLEMENT — always DEMO.
//     Balances, position sizes and P&L are simulated with demo capital. No
//     order is ever sent to an exchange and no real funds move. This is the
//     part of the product that is intentionally a simulation, and it is always
//     labelled as such in the UI.
//
// The distinction that matters: a DEMO position is still valued against a REAL
// price. "Demo" describes the money, never the market data.

/** Market-data provenance. Only one value exists by design. */
export type MarketDataMode = "REAL";

/** Capital provenance. Only one value exists by design. */
export type CapitalMode = "DEMO";

export const MARKET_DATA_MODE: MarketDataMode = "REAL";
export const CAPITAL_MODE: CapitalMode = "DEMO";

/**
 * True when market values may come from anything other than the live feed.
 *
 * Hardcoded false. It exists as a single, greppable assertion: if a future
 * change introduces a simulated market source, this must become configurable
 * and every call site has to handle it, rather than mock data quietly reaching
 * a screen that claims to be live.
 */
export const MARKET_DATA_IS_SIMULATED = false;

/** Copy for the badge shown wherever demo capital is displayed. */
export const CAPITAL_MODE_LABEL = "DEMO CAPITAL";

/** Copy for the tooltip explaining the split. */
export const MODE_EXPLANATION =
  "Prices and candles are live OKX market data. Balances and P&L are demo capital — no real funds move.";
