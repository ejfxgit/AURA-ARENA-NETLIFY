import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHex } from "viem";
import { z } from "zod";
import { saveBattle } from "@/lib/store";
import { loadAuthoritativeBattle } from "@/lib/battle/persistence";
import { runChallenge } from "@/lib/challenge/pipeline";
import { rateLimit } from "@/lib/ratelimit";
import type { Battle } from "@/lib/types";
import { isBattleExpired } from "@/lib/battle/timing";
import { getWalletAuth, persistUnsettledBattle } from "@/lib/supabase/aura";
import {
  createWalletAuthChallenge,
  verifyWalletAuthChallenge,
  WALLET_CHALLENGE_COOKIE,
  WalletAuthError,
} from "@/lib/supabase/web3-auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  battleId: z.string().min(1),
  message: z.string().min(3).max(400),
});

const walletChallengeSchema = z.object({
  action: z.literal("wallet-auth-challenge"),
  walletAddress: z.string().refine(isAddress, "Invalid wallet address"),
  chainId: z.literal(1952),
});

const walletVerifySchema = z.object({
  action: z.literal("wallet-auth-verify"),
  walletAddress: z.string().refine(isAddress, "Invalid wallet address"),
  message: z.string().min(1),
  signature: z.string().refine((value) => isHex(value), "Invalid wallet signature"),
});

function isSecureRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return forwardedProto ? forwardedProto === "https" : new URL(req.url).protocol === "https:";
}

function clearWalletChallenge(response: NextResponse, req: NextRequest) {
  response.cookies.set(WALLET_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (body?.action === "wallet-auth-challenge") {
    const parsed = walletChallengeSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid wallet challenge request" }, { status: 400 });
    try {
      const challenge = await createWalletAuthChallenge(parsed.data.walletAddress, req.url, req.headers);
      const response = NextResponse.json(
        {
          walletAddress: challenge.walletAddress,
          message: challenge.message,
          expiresAt: challenge.expiresAt,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      );
      response.cookies.set(WALLET_CHALLENGE_COOKIE, challenge.cookieValue, {
        httpOnly: true,
        sameSite: "strict",
        secure: isSecureRequest(req),
        path: "/",
        maxAge: 300,
      });
      return response;
    } catch (error) {
      const status = error instanceof WalletAuthError ? error.status : 500;
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to create wallet challenge" },
        { status },
      );
    }
  }

  if (body?.action === "wallet-auth-verify") {
    const parsed = walletVerifySchema.safeParse(body);
    if (!parsed.success) {
      return clearWalletChallenge(
        NextResponse.json({ error: "Invalid wallet verification request" }, { status: 400 }),
        req,
      );
    }
    try {
      const result = await verifyWalletAuthChallenge({
        cookieValue: req.cookies.get(WALLET_CHALLENGE_COOKIE)?.value || "",
        walletAddress: parsed.data.walletAddress,
        message: parsed.data.message,
        signature: parsed.data.signature,
      });
      return clearWalletChallenge(NextResponse.json(result), req);
    } catch (error) {
      const status = error instanceof WalletAuthError ? error.status : 500;
      return clearWalletChallenge(
        NextResponse.json(
          { error: error instanceof Error ? error.message : "Unable to verify wallet" },
          { status },
        ),
        req,
      );
    }
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { battleId, message } = parsed.data;

  // Rate limit AI challenge endpoint: 6 per 30s per user.
  if (!rateLimit(`chal:${auth.user.id}`, 6, 30000)) {
    return NextResponse.json(
      { error: "Slow down — too many challenges. Try again shortly." },
      { status: 429 },
    );
  }

  let battle: Battle | undefined;
  try {
    battle = (await loadAuthoritativeBattle(auth.supabase, auth.user.id, battleId)) ?? undefined;
  } catch {
    return NextResponse.json({ error: "Unable to load battle" }, { status: 503 });
  }
  if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  if (battle.status !== "WAITING" && battle.status !== "ACTIVE") {
    return NextResponse.json({ error: "Challenges close when the battle is settled." }, { status: 409 });
  }
  if (battle.status === "ACTIVE" && isBattleExpired(battle)) {
    return NextResponse.json({ error: "Challenges close when the battle expires." }, { status: 409 });
  }

  const { challenge, recalculation, decision } = await runChallenge(battle, auth.user.id, message);
  battle.challenges.push(challenge);
  // The AI side can only be moved by a fresh OpenRouter decision. When the
  // pipeline did not obtain one (`source: "UNCHANGED"`), these are the values the
  // model already produced, so the persisted direction stays the model's own and
  // deterministic factor math never reaches it.
  battle.ai_direction = decision.direction;
  battle.ai_confidence_after = decision.confidence;
  // Conditional write: the battle can settle while the review is in flight, and a
  // settled result is canonical. Rather than overwrite it, the challenge is
  // rejected — exactly as it would have been had it arrived a moment later.
  let written: boolean;
  try {
    written = await persistUnsettledBattle(auth.supabase, auth.user.id, battle);
  } catch {
    return NextResponse.json({ error: "Unable to persist challenge" }, { status: 503 });
  }
  if (!written) {
    return NextResponse.json({ error: "Challenges close when the battle is settled." }, { status: 409 });
  }
  saveBattle(battle);

  return NextResponse.json({ challenge, recalculation, battle });
}
