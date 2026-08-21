import { NextResponse } from "next/server";
import { z } from "zod";
import { assetBySymbol, getSnapshot, getCandles } from "@/lib/market/adapter";
import { marketErrorResponse } from "@/lib/market/http";
import { aiErrorResponse } from "@/lib/ai/http";
import { generateThesis } from "@/lib/ai/thesis";
import { getWalletAuth } from "@/lib/supabase/aura";
import { rateLimit } from "@/lib/api/rate-limit";
import type { AgentId } from "@/lib/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  agentId: z.enum(["volt", "mira", "quanta", "nova", "atlas", "rift"]),
  symbol: z.string().min(1),
});

/**
 * Every call here bills a model request, so the route is authenticated and rate
 * limited. It used to be open to anonymous callers with no ceiling, which made it
 * a way for anyone to spend the deployment's model budget.
 */
const ANALYZE_LIMIT = 10;
const ANALYZE_WINDOW_MS = 60_000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const limit = rateLimit(`agents-analyze:${auth.user.id}`, ANALYZE_LIMIT, ANALYZE_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many analysis requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const def = assetBySymbol(parsed.data.symbol);
  if (!def) return NextResponse.json({ error: "Unknown asset" }, { status: 404 });

  // A thesis is only ever built from real OKX data AND a real model decision. If
  // either is unavailable the request fails with the reason: there is no
  // deterministic thesis to fall back to any more.
  try {
    const [snapshot, candles] = await Promise.all([
      getSnapshot(def),
      getCandles(def, 100),
    ]);
    const thesis = await generateThesis(
      parsed.data.agentId as AgentId,
      snapshot,
      candles,
    );
    return NextResponse.json({ thesis });
  } catch (error) {
    return (
      aiErrorResponse(error, `POST /api/agents/analyze ${def.instId}`) ??
      marketErrorResponse(error, `POST /api/agents/analyze ${def.instId}`)
    );
  }
}
