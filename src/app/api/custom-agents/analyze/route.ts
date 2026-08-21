import { NextResponse } from "next/server";
import { z } from "zod";
import { customAgentFromRow, type CustomAgentRow } from "@/lib/custom-agents";
import { generateCustomAgentAnalysis } from "@/lib/ai/custom-thesis";
import { assetBySymbol, getCandles, getSnapshot } from "@/lib/market/adapter";
import { marketErrorResponse } from "@/lib/market/http";
import { aiErrorResponse } from "@/lib/ai/http";
import { getWalletAuth } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

const schema = z.object({
  customAgentId: z.string().uuid(),
  // Accepts "BTC" or a full OKX instrument id such as "BTC-USDT".
  symbol: z.string().min(1).max(41),
});

export async function POST(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid analysis request" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("custom_agents")
    .select("*")
    .eq("id", parsed.data.customAgentId)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load custom agent" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Custom agent not found" }, { status: 404 });

  const asset = assetBySymbol(parsed.data.symbol);
  if (!asset) return NextResponse.json({ error: "Unknown asset" }, { status: 404 });

  // Real OKX data and a real model decision only. If either is unavailable the
  // request fails with the reason rather than producing a synthesized analysis.
  try {
    const [snapshot, candles] = await Promise.all([getSnapshot(asset), getCandles(asset, 100)]);
    const analysis = await generateCustomAgentAnalysis(
      customAgentFromRow(data as CustomAgentRow),
      snapshot,
      candles,
    );
    return NextResponse.json({ analysis });
  } catch (analysisError) {
    return (
      aiErrorResponse(analysisError, `POST /api/custom-agents/analyze ${asset.instId}`) ??
      marketErrorResponse(analysisError, `POST /api/custom-agents/analyze ${asset.instId}`)
    );
  }
}
