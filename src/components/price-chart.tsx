"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  XAxis,
} from "recharts";
import type { Candle } from "@/lib/types";
import { fmtUsd } from "@/lib/utils";

export function PriceChart({
  candles,
  color = "#7c5cff",
  height = 280,
}: {
  candles: Candle[];
  color?: string;
  height?: number;
}) {
  const data = candles.map((c) => ({
    t: new Date(c.time * 1000).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    price: c.close,
  }));
  const up = candles.length > 1 && candles[candles.length - 1].close >= candles[0].close;
  const stroke = color === "auto" ? (up ? "#22e39a" : "#ff4d5e") : color;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="t"
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={["dataMin", "dataMax"]}
          tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={60}
          tickFormatter={(v) => fmtUsd(Number(v), { dp: 0 })}
          orientation="right"
        />
        <Tooltip
          contentStyle={{
            background: "#0d1220",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            fontSize: 12,
          }}
          labelStyle={{ color: "rgba(255,255,255,0.5)" }}
          formatter={(v: number) => [fmtUsd(v), "Price"]}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke={stroke}
          strokeWidth={2}
          fill="url(#priceFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
