"use client";

// Live price chart.
//
// Renders the candle series held in the central market store. It does not fetch,
// poll, interpolate or animate anything on its own — it is a pure view over
// whatever real candles have arrived.
//
// Trading-terminal behaviour it implements:
//   * the newest bar updates in place while the interval is open
//   * a closed interval appends the next bar, so the series auto-scrolls
//   * the live last price is drawn as a reference line with its own label
//   * updates do not animate, which is what stops the flicker/rubber-banding
//     you get when Recharts tweens on every tick
//   * optional volume row when the feed supplies volume
//
// Visual identity matches the existing PriceChart (same palette, same axes).

import { memo, useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LiveCandle } from "@/lib/market/market-data-service";
import type { CandleBar } from "@/lib/market/okx-types";
import { fmtPrice } from "@/lib/utils";

const UP = "#22e39a";
const DOWN = "#ff4d5e";
const ACCENT = "#7c5cff";

/** Bars whose interval is under a day get a time label; daily bars get a date. */
function labelFor(timeSeconds: number, bar: CandleBar): string {
  const date = new Date(timeSeconds * 1000);
  if (bar === "1D") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (bar === "4H" || bar === "1H") {
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface Row {
  t: string;
  close: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  closed: boolean;
}

export interface LivePriceChartProps {
  candles: LiveCandle[];
  bar: CandleBar;
  /** Live last price. Drawn as a reference line when supplied. */
  livePrice?: number | null;
  height?: number;
  showVolume?: boolean;
}

function LivePriceChartImpl({
  candles,
  bar,
  livePrice,
  height = 280,
  showVolume = true,
}: LivePriceChartProps) {
  const rows = useMemo<Row[]>(
    () =>
      candles.map((candle) => ({
        t: labelFor(candle.time, bar),
        close: candle.close,
        volume: candle.volume,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        closed: candle.closed,
      })),
    [candles, bar],
  );

  const first = candles[0];
  const last = candles[candles.length - 1];
  const up = Boolean(first && last && last.close >= first.close);
  const stroke = up ? UP : DOWN;

  // Pad the domain so the live-price line is never clipped at the edge.
  const domain = useMemo<[number, number] | undefined>(() => {
    if (candles.length === 0) return undefined;
    let low = Infinity;
    let high = -Infinity;
    for (const candle of candles) {
      if (candle.low < low) low = candle.low;
      if (candle.high > high) high = candle.high;
    }
    if (livePrice != null && Number.isFinite(livePrice)) {
      low = Math.min(low, livePrice);
      high = Math.max(high, livePrice);
    }
    if (!Number.isFinite(low) || !Number.isFinite(high)) return undefined;
    const pad = (high - low) * 0.06 || Math.abs(high) * 0.001 || 1;
    return [low - pad, high + pad];
  }, [candles, livePrice]);

  if (candles.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="livePriceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />

        <XAxis
          dataKey="t"
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          minTickGap={44}
        />
        <YAxis
          yAxisId="price"
          domain={domain ?? ["dataMin", "dataMax"]}
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={68}
          orientation="right"
          tickFormatter={(value) => fmtPrice(Number(value))}
        />
        {showVolume && (
          // Hidden axis: volume shares the plot but must not rescale price.
          <YAxis yAxisId="volume" hide domain={[0, (max: number) => max * 4]} />
        )}

        <Tooltip
          contentStyle={{
            background: "#0d1220",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10,
            fontSize: 12,
          }}
          labelStyle={{ color: "rgba(255,255,255,0.5)" }}
          formatter={(value: number, name: string) => {
            if (name === "volume") return [Number(value).toLocaleString("en-US"), "Volume"];
            return [fmtPrice(Number(value)), "Price"];
          }}
        />

        {showVolume && (
          <Bar
            yAxisId="volume"
            dataKey="volume"
            fill={ACCENT}
            fillOpacity={0.16}
            isAnimationActive={false}
          />
        )}

        <Area
          yAxisId="price"
          type="monotone"
          dataKey="close"
          stroke={stroke}
          strokeWidth={1.8}
          fill="url(#livePriceFill)"
          // Animation off: with a bar updating several times a second, tweening
          // makes the line rubber-band and read as noise.
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 3, fill: stroke, stroke: "#0d1220", strokeWidth: 2 }}
        />

        {livePrice != null && Number.isFinite(livePrice) && (
          <ReferenceLine
            yAxisId="price"
            y={livePrice}
            stroke={stroke}
            strokeDasharray="3 3"
            strokeOpacity={0.75}
            label={{
              value: fmtPrice(livePrice),
              position: "right",
              fill: stroke,
              fontSize: 10,
              fontWeight: 700,
            }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Memoized: the chart re-renders only when the candle array identity changes,
 * which the store guarantees happens only on a real update.
 */
export const LivePriceChart = memo(LivePriceChartImpl);
