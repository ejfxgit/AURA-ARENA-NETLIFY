"use client";

// Market selector.
//
// Replaces the old hardcoded three-button BTC/ETH/SOL strip. The list is built
// from the real OKX SPOT instrument catalogue via useMarketRegistry() — there is
// no symbol allowlist in this file, so whatever OKX lists is selectable.
//
// Each row shows icon + pair + long name + live price + live 24h change. Prices
// come from the central websocket store, so an open selector ticks like an
// exchange rather than showing whatever the last page load happened to fetch.
//
// Only the rows actually rendered subscribe to a ticker, and each unsubscribes
// on unmount, so opening the selector does not leave hundreds of live channels
// running behind it.

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, RefreshCw, Search, X } from "lucide-react";
import {
  useLiveTicker,
  useMarketRegistry,
  type MarketRegistryEntry,
} from "@/lib/market/use-live-market";
import { cn, fmtPctOrNa, fmtPrice, pnlColorOrNa } from "@/lib/utils";
import { TokenIcon } from "@/components/ui/token-icon";
import { LiveStatus } from "@/components/live-status";

/** Rows rendered at once. Keeps live subscriptions and DOM size bounded. */
const VISIBLE_LIMIT = 60;

function matches(market: MarketRegistryEntry, query: string): boolean {
  if (!query) return true;
  return (
    market.symbol.includes(query) ||
    market.baseAsset.includes(query) ||
    market.quoteAsset.includes(query) ||
    market.name.toUpperCase().includes(query)
  );
}

/** One selectable row. Subscribes to its own live ticker. */
function MarketRow({
  market,
  active,
  onSelect,
}: {
  market: MarketRegistryEntry;
  active: boolean;
  onSelect: (symbol: string) => void;
}) {
  const ticker = useLiveTicker(market.symbol);
  // Live values when the socket has delivered them, otherwise the REST values
  // the registry was built from. Never a placeholder.
  const price = ticker?.last ?? market.price;
  const change = ticker?.changePercent ?? market.priceChange24h;

  return (
    <button
      type="button"
      onClick={() => onSelect(market.symbol)}
      className={cn(
        "focus-ring flex w-full items-center gap-3 border-b border-white/[0.05] px-3 py-2.5 text-left transition-colors last:border-0",
        active ? "bg-aura-accent/[0.1]" : "hover:bg-white/[0.03]",
      )}
    >
      <TokenIcon symbol={market.baseAsset} size={28} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-white/85">{market.symbol}</span>
          {active && <Check size={12} className="shrink-0 text-aura-accent" />}
        </span>
        <span className="block truncate text-[10px] text-white/32">{market.name}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="mono block text-xs font-semibold text-white/80">{fmtPrice(price)}</span>
        <span className={cn("mono block text-[10px]", pnlColorOrNa(change))}>
          {fmtPctOrNa(change)}
        </span>
      </span>
    </button>
  );
}

export interface MarketSelectorProps {
  /** Currently selected OKX instrument id, e.g. "BTC-USDT". */
  value: string;
  onChange: (symbol: string) => void;
  /** Restrict to one quote currency, e.g. "USDT". Empty shows every quote. */
  quoteFilter?: string;
  className?: string;
}

/**
 * Live price for the currently selected market, shown in the selector header so
 * a selection change is visibly reflected in live data straight away.
 */
function SelectedPrice({ symbol, fallback }: { symbol: string; fallback: number | undefined }) {
  const ticker = useLiveTicker(symbol);
  const price = ticker?.last ?? fallback;
  const change = ticker?.changePercent ?? null;
  if (price === undefined) return null;
  return (
    <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
      <span className="mono text-xs font-semibold text-white/85">{fmtPrice(price)}</span>
      {change !== null && (
        <span className={cn("mono text-[10px]", pnlColorOrNa(change))}>{fmtPctOrNa(change)}</span>
      )}
    </span>
  );
}

export function MarketSelector({
  value,
  onChange,
  quoteFilter = "",
  className,
}: MarketSelectorProps) {
  const { markets, loading, error, reload } = useMarketRegistry();
  const [query, setQuery] = useState("");
  // Keeps typing responsive while a long list re-filters.
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toUpperCase();
    const quote = quoteFilter.trim().toUpperCase();
    const rows = markets.filter(
      (market) => (!quote || market.quoteAsset === quote) && matches(market, q),
    );
    // With a query, exact ticker matches surface first.
    if (q) {
      rows.sort((a, b) => {
        const aExact = a.baseAsset === q ? 0 : 1;
        const bExact = b.baseAsset === q ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return b.volume24h - a.volume24h;
      });
    }
    return rows;
  }, [markets, deferredQuery, quoteFilter]);

  const visible = filtered.slice(0, VISIBLE_LIMIT);
  const selected = markets.find((market) => market.symbol === value);

  const handleSelect = useCallback(
    (symbol: string) => {
      // Selecting the same market again is a no-op, which avoids tearing down
      // and rebuilding an identical subscription.
      if (symbol !== value) onChange(symbol);
    },
    [onChange, value],
  );

  /**
   * With no selection yet, adopt the highest-volume market the registry
   * actually returned. The default is therefore data-driven — there is no
   * hardcoded starting symbol anywhere in this path.
   */
  useEffect(() => {
    if (value || markets.length === 0) return;
    const quote = quoteFilter.trim().toUpperCase();
    const candidates = quote ? markets.filter((m) => m.quoteAsset === quote) : markets;
    // useMarketRegistry requests sort=volume, so index 0 is the deepest market.
    const first = candidates[0];
    if (first) onChange(first.symbol);
  }, [value, markets, quoteFilter, onChange]);

  return (
    <div className={cn("min-w-0", className)}>
      {/* current selection */}
      <div className="mb-2 flex items-center gap-2">
        <TokenIcon symbol={selected?.baseAsset ?? value.split("-")[0]} size={22} />
        <span className="min-w-0 truncate text-xs font-semibold text-white/80">
          {selected?.symbol ?? value}
        </span>
        {value && <SelectedPrice symbol={value} fallback={selected?.price} />}
        <LiveStatus showLabel={false} />
      </div>

      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search any listed OKX market…"
          aria-label="Search markets"
          className="focus-ring h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.02] pl-8 pr-7 text-xs outline-none placeholder:text-white/25 focus:border-aura-accent/40"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear market search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-white/30 hover:text-white"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {error && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-aura-short/25 bg-aura-short/[0.06] px-2.5 py-2 text-[11px] leading-4 text-aura-short">
          <span className="min-w-0">{error}</span>
          <button
            type="button"
            onClick={reload}
            className="focus-ring shrink-0 rounded p-0.5 hover:text-white"
            aria-label="Retry loading markets"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      )}

      <div className="max-h-[280px] overflow-y-auto rounded-md border border-white/[0.07] bg-black/20">
        {loading && markets.length === 0 && (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-[11px] text-white/35">
            <RefreshCw size={12} className="animate-spin" /> Loading OKX markets…
          </div>
        )}
        {!loading && filtered.length === 0 && !error && (
          <div className="px-3 py-8 text-center text-[11px] text-white/35">
            No listed OKX market matches that search.
          </div>
        )}
        {visible.map((market) => (
          <MarketRow
            key={market.symbol}
            market={market}
            active={market.symbol === value}
            onSelect={handleSelect}
          />
        ))}
      </div>

      <div className="mt-1.5 text-[10px] text-white/25">
        {markets.length > 0
          ? `${filtered.length} of ${markets.length} live OKX spot markets${
              filtered.length > VISIBLE_LIMIT ? ` · showing first ${VISIBLE_LIMIT}` : ""
            }`
          : ""}
      </div>
    </div>
  );
}

/**
 * Compact native-select variant of the same registry.
 *
 * Used where a full list panel does not fit (the agent-analysis modal). It reads
 * the SAME useMarketRegistry() source as MarketSelector and the Markets page, so
 * there is exactly one market list in the app — this is a different control, not
 * a different data source.
 */
export function MarketSelect({
  value,
  onChange,
  quoteFilter = "",
  className,
  ariaLabel = "Select market",
}: MarketSelectorProps & { ariaLabel?: string }) {
  const { markets, loading, error } = useMarketRegistry();

  const options = useMemo(() => {
    const quote = quoteFilter.trim().toUpperCase();
    return quote ? markets.filter((market) => market.quoteAsset === quote) : markets;
  }, [markets, quoteFilter]);

  const selected = markets.find((market) => market.symbol === value);

  // Adopt the deepest listed market when nothing is selected yet, so the control
  // never needs a hardcoded default symbol.
  useEffect(() => {
    if (value || options.length === 0) return;
    onChange(options[0].symbol);
  }, [value, options, onChange]);

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <TokenIcon symbol={selected?.baseAsset ?? value.split("-")[0] ?? ""} size={24} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        disabled={loading && markets.length === 0}
        className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2 text-sm text-white disabled:opacity-50"
      >
        {/* Real listed instruments only — no fallback option list. */}
        {loading && markets.length === 0 && <option value="">Loading OKX markets…</option>}
        {error && markets.length === 0 && <option value="">Market list unavailable</option>}
        {options.map((market) => (
          <option key={market.symbol} value={market.symbol}>
            {market.symbol}
            {market.name && market.name !== market.baseAsset ? ` · ${market.name}` : ""}
          </option>
        ))}
      </select>
    </span>
  );
}
