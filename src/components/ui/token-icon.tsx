"use client";

// Token icons for market rows and selectors.
//
// Two deliberate choices:
//
// 1. Every mark is INLINE SVG. No external CDN is referenced, so icons cannot
//    break behind a strict CSP, an offline dev server, or a third-party outage,
//    and no request leaks which markets a user is viewing.
//
// 2. There is no empty box and no "unknown token" placeholder graphic. A token
//    with a hand-drawn mark below gets that mark; every other token gets its
//    real ticker rendered as a monogram in a deterministic brand colour. That is
//    an honest identifier — it always shows what the asset actually is — which
//    matters because OKX lists hundreds of SPOT pairs and no bundled icon set
//    covers all of them.
//
// The marks are simplified brand glyphs drawn from each project's well-known
// visual identity (shape + colour), not copies of official asset files.

import { cn } from "@/lib/utils";

interface Brand {
  /** Primary brand colour. Also drives the monogram fallback. */
  color: string;
  /** Optional second colour for gradients. */
  color2?: string;
  /** Foreground glyph drawn on top of the brand disc. */
  glyph?: (id: string) => React.ReactNode;
  /** Text colour over the disc. Defaults to white. */
  fg?: string;
}

/** Glyph helpers keep the map below readable. */
const text = (value: string, size = 13, weight = 700) =>
  function glyph() {
    return (
      <text
        x="16"
        y="16"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size}
        fontWeight={weight}
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="currentColor"
      >
        {value}
      </text>
    );
  };

const path = (d: string, fill = "currentColor") =>
  function glyph() {
    return <path d={d} fill={fill} />;
  };

/**
 * Brand table. Keys are OKX base-currency codes.
 *
 * Adding a token here upgrades its monogram to a drawn mark; omitting one is
 * not a bug and never yields a blank icon.
 */
const BRANDS: Record<string, Brand> = {
  BTC: { color: "#F7931A", glyph: text("₿", 17) },
  ETH: {
    color: "#627EEA",
    glyph: () => (
      <>
        <path d="M16 5 L16 13.6 L22.5 16.6 Z" fill="currentColor" fillOpacity={0.65} />
        <path d="M16 5 L9.5 16.6 L16 13.6 Z" fill="currentColor" />
        <path d="M16 21.1 L16 27 L22.5 17.9 Z" fill="currentColor" fillOpacity={0.65} />
        <path d="M16 27 L16 21.1 L9.5 17.9 Z" fill="currentColor" />
      </>
    ),
  },
  SOL: {
    color: "#14F195",
    color2: "#9945FF",
    glyph: (id) => (
      <>
        <path d="M9 11.4c0-.3.15-.5.4-.65l2.1-1.2c.2-.1.4-.15.6-.15h10.6c.4 0 .6.45.35.75l-1.9 2.1a.9.9 0 0 1-.65.3H9.4c-.25 0-.4-.2-.4-.45z" fill={`url(#${id}-g)`} />
        <path d="M9 16.4c0-.3.15-.5.4-.65l2.1-1.2c.2-.1.4-.15.6-.15h10.6c.4 0 .6.45.35.75l-1.9 2.1a.9.9 0 0 1-.65.3H9.4c-.25 0-.4-.2-.4-.45z" fill={`url(#${id}-g)`} opacity={0.85} />
        <path d="M23 21.4c0 .3-.15.5-.4.65l-2.1 1.2c-.2.1-.4.15-.6.15H9.3c-.4 0-.6-.45-.35-.75l1.9-2.1a.9.9 0 0 1 .65-.3h11.1c.25 0 .4.2.4.45z" fill={`url(#${id}-g)`} opacity={0.7} />
      </>
    ),
  },
  XRP: {
    color: "#23292F",
    glyph: () => (
      <>
        <path d="M10 9.5h2.7l3.3 3.6 3.3-3.6H22l-4.6 5a1.9 1.9 0 0 1-2.8 0z" fill="currentColor" />
        <path d="M10 22.5h2.7l3.3-3.6 3.3 3.6H22l-4.6-5a1.9 1.9 0 0 0-2.8 0z" fill="currentColor" />
      </>
    ),
    fg: "#ffffff",
  },
  DOGE: { color: "#C2A633", glyph: text("Ð", 16) },
  ADA: {
    color: "#0033AD",
    glyph: () => (
      <>
        <circle cx="16" cy="16" r="2.6" fill="currentColor" />
        {[
          [16, 8.4], [16, 23.6], [9.4, 12.2], [22.6, 12.2], [9.4, 19.8], [22.6, 19.8],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.55" fill="currentColor" />
        ))}
      </>
    ),
  },
  AVAX: { color: "#E84142", glyph: path("M16 7.5 24.5 23h-5.1l-3.4-6.2L13.2 23H8z") },
  LINK: {
    color: "#2A5ADA",
    glyph: () => (
      <path d="M16 7.4l7.2 4.2v8.8L16 24.6l-7.2-4.2v-8.8zm0 3.3l-4.3 2.5v5l4.3 2.5 4.3-2.5v-5z" fill="currentColor" />
    ),
  },
  DOT: {
    color: "#E6007A",
    glyph: () => (
      <>
        <ellipse cx="16" cy="9.2" rx="3.1" ry="2" fill="currentColor" />
        <ellipse cx="16" cy="22.8" rx="3.1" ry="2" fill="currentColor" />
        <ellipse cx="10.3" cy="12.6" rx="3.1" ry="2" fill="currentColor" transform="rotate(-60 10.3 12.6)" />
        <ellipse cx="21.7" cy="19.4" rx="3.1" ry="2" fill="currentColor" transform="rotate(-60 21.7 19.4)" />
        <ellipse cx="10.3" cy="19.4" rx="3.1" ry="2" fill="currentColor" transform="rotate(60 10.3 19.4)" />
        <ellipse cx="21.7" cy="12.6" rx="3.1" ry="2" fill="currentColor" transform="rotate(60 21.7 12.6)" />
      </>
    ),
  },
  LTC: { color: "#A6A9AA", glyph: text("Ł", 16) },
  BCH: { color: "#0AC18E", glyph: text("₿", 16) },
  TON: {
    color: "#0098EA",
    glyph: path("M10.5 12h11L16 24zm1.4-2.4h8.2a.7.7 0 0 1 .55 1.15l-.35.45H11.7l-.35-.45a.7.7 0 0 1 .55-1.15z"),
  },
  TRX: { color: "#EF0027", glyph: path("M8.5 9.5 23.5 12l-6.6 12.2zm2.8 2 4.9 9.1 4.3-8z") },
  SUI: {
    color: "#4DA2FF",
    glyph: path("M16 6.5c3.4 4.3 6.4 7.6 6.4 11.2A6.4 6.4 0 0 1 16 24a6.4 6.4 0 0 1-6.4-6.3c0-3.6 3-6.9 6.4-11.2m0 4.4c-1.9 2.5-3.6 4.4-3.6 6.6A3.7 3.7 0 0 0 16 21.3a3.7 3.7 0 0 0 3.6-3.8c0-2.2-1.7-4.1-3.6-6.6z"),
  },
  APT: { color: "#1B1F23", glyph: text("A", 14, 800), fg: "#ffffff" },
  ARB: {
    color: "#213147",
    color2: "#12AAFF",
    glyph: path("M16 7.6 24 21h-4.2L16 14.2 12.2 21H8z", "#12AAFF"),
  },
  OP: { color: "#FF0420", glyph: text("OP", 11, 800) },
  MATIC: { color: "#8247E5", glyph: path("M16 7.8 23 12v8L16 24.2 9 20v-8zm0 3.4-4 2.4v4.8l4 2.4 4-2.4v-4.8z") },
  POL: { color: "#8247E5", glyph: path("M16 7.8 23 12v8L16 24.2 9 20v-8zm0 3.4-4 2.4v4.8l4 2.4 4-2.4v-4.8z") },
  NEAR: { color: "#111318", glyph: text("N", 14, 800), fg: "#ffffff" },
  ATOM: {
    color: "#2E3148",
    glyph: () => (
      <>
        <circle cx="16" cy="16" r="2.2" fill="currentColor" />
        <ellipse cx="16" cy="16" rx="8" ry="3.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <ellipse cx="16" cy="16" rx="8" ry="3.4" stroke="currentColor" strokeWidth="1.3" fill="none" transform="rotate(60 16 16)" />
        <ellipse cx="16" cy="16" rx="8" ry="3.4" stroke="currentColor" strokeWidth="1.3" fill="none" transform="rotate(120 16 16)" />
      </>
    ),
    fg: "#ffffff",
  },
  FIL: { color: "#0090FF", glyph: text("⨎", 16) },
  UNI: { color: "#FF007A", glyph: text("U", 14, 800) },
  AAVE: { color: "#B6509E", color2: "#2EBAC6", glyph: text("A", 14, 800) },
  OKB: {
    color: "#1F1F1F",
    glyph: () => (
      <>
        {[
          [8.6, 8.6], [14.2, 8.6], [19.8, 8.6],
          [8.6, 14.2], [14.2, 14.2], [19.8, 14.2],
          [8.6, 19.8], [14.2, 19.8], [19.8, 19.8],
        ].map(([x, y], index) =>
          [1, 3, 5, 7].includes(index) ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width="3.6" height="3.6" rx="0.5" fill="currentColor" />
          ),
        )}
      </>
    ),
    fg: "#ffffff",
  },
  PEPE: { color: "#3D8B3D", glyph: text("P", 14, 800) },
  SHIB: { color: "#FFA409", glyph: text("S", 14, 800) },
  USDT: { color: "#26A17B", glyph: text("₮", 16) },
  USDC: { color: "#2775CA", glyph: text("$", 15) },
  TIA: { color: "#7B2BF9", glyph: text("T", 14, 800) },
  SEI: { color: "#9E1F19", glyph: text("S", 14, 800) },
  INJ: { color: "#00A3FF", glyph: text("I", 14, 800) },
  STX: { color: "#5546FF", glyph: text("S", 14, 800) },
  ETC: { color: "#328332", glyph: text("Ξ", 16) },
  XLM: { color: "#14B6E7", glyph: text("✶", 15) },
  ICP: { color: "#F15A24", color2: "#29ABE2", glyph: text("∞", 17) },
  HBAR: { color: "#222222", glyph: text("ℏ", 16), fg: "#ffffff" },
  WLD: { color: "#0E0E0E", glyph: text("◍", 16), fg: "#ffffff" },
  BNB: { color: "#F0B90B", glyph: path("M16 7.6l3 3-3 3-3-3zm-5.4 5.4 3 3-3 3-3-3zm10.8 0 3 3-3 3-3-3zM16 18.4l3 3-3 3-3-3z") },
};

/**
 * Deterministic hue for a token with no drawn mark, derived from its ticker so
 * the same asset always gets the same colour across the app.
 */
function fallbackColor(ticker: string): string {
  let hash = 0;
  for (let index = 0; index < ticker.length; index += 1) {
    hash = (hash * 31 + ticker.charCodeAt(index)) % 360;
  }
  return `hsl(${hash} 62% 44%)`;
}

export interface TokenIconProps {
  /** Base-currency code, e.g. "BTC". Case-insensitive. */
  symbol: string;
  /** Rendered pixel size. Default 32. */
  size?: number;
  className?: string;
}

/**
 * One token's icon. Always renders something identifying — a brand mark when
 * one exists, otherwise the real ticker as a monogram.
 */
export function TokenIcon({ symbol, size = 32, className }: TokenIconProps) {
  const ticker = (symbol || "").toUpperCase();
  const brand = BRANDS[ticker];
  // Stable per-symbol id so gradient defs never collide between rows.
  const gradientId = `tok-${ticker.replace(/[^A-Z0-9]/g, "") || "x"}`;

  const color = brand?.color ?? fallbackColor(ticker);
  const foreground = brand?.fg ?? "#ffffff";
  // Long tickers step down so text never overflows the disc.
  const monogram = ticker.slice(0, ticker.length > 4 ? 4 : ticker.length) || "?";
  const monogramSize = monogram.length >= 4 ? 8.5 : monogram.length === 3 ? 10.5 : 13;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role="img"
      aria-label={`${ticker} logo`}
    >
      {(brand?.color2 || !brand) && (
        <defs>
          <linearGradient id={`${gradientId}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={brand?.color2 ?? color} />
          </linearGradient>
        </defs>
      )}
      <circle cx="16" cy="16" r="16" fill={brand?.color2 ? `url(#${gradientId}-g)` : color} />
      <g color={foreground} fill={foreground}>
        {brand?.glyph ? (
          brand.glyph(gradientId)
        ) : (
          <text
            x="16"
            y="16.5"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={monogramSize}
            fontWeight={800}
            fontFamily="system-ui, -apple-system, sans-serif"
            fill={foreground}
            letterSpacing="-0.2"
          >
            {monogram}
          </text>
        )}
      </g>
    </svg>
  );
}

/**
 * Icon + ticker + long name, the standard way a market identifies itself in a
 * list or selector.
 */
export function TokenIdentity({
  baseAsset,
  quoteAsset,
  name,
  size = 32,
  className,
}: {
  baseAsset: string;
  quoteAsset?: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <TokenIcon symbol={baseAsset} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white/85">
          {quoteAsset ? `${baseAsset} / ${quoteAsset}` : baseAsset}
        </span>
        {name && name !== baseAsset && (
          <span className="block truncate text-[10px] text-white/35">{name}</span>
        )}
      </span>
    </span>
  );
}
