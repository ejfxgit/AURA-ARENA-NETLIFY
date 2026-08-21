import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAddress } from "viem";
import { z } from "zod";
import { AURA_PER_USDT, MIN_WITHDRAWAL_AURA } from "@/lib/aura-economy";
import {
  payoutChainId,
  payoutStatus,
  sendUsdtPayout,
  TreasuryConfigurationError,
  usdtTokenAddress,
} from "@/lib/chain/usdt";
import { treasuryConfigError } from "@/lib/config";
import { rateLimit } from "@/lib/ratelimit";
import { getWalletAuth, loadWalletAccount } from "@/lib/supabase/aura";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  completeWithdrawal,
  failWithdrawal,
  listWithdrawals,
  markWithdrawalSending,
  requestWithdrawal,
  WithdrawalError,
} from "@/lib/supabase/withdrawals";
import type { DemoAccount, Withdrawal } from "@/lib/types";

export const dynamic = "force-dynamic";
// A payout waits for a real receipt (45s cap in lib/chain/usdt.ts) on top of the
// contract reads, so the handler needs more than the platform default.
export const maxDuration = 60;

/**
 * AURA -> USDT (X Layer Testnet) redemptions.
 *
 * The order of operations is the safety property of this route and must not be
 * rearranged:
 *   1. authenticate, and resolve the destination from the SESSION wallet
 *   2. verify the treasury configuration BEFORE touching any balance, so a
 *      misconfigured deployment can never leave AURA reserved
 *   3. reserve (debit) the AURA and open the PENDING record in one database
 *      transaction — public.request_aura_withdrawal holds the row lock
 *   4. sign and broadcast the transfer server-side
 *   5. COMPLETED only with a confirmed transfer, FAILED + refund only when
 *      nothing moved, SENDING when a broadcast transaction is not yet confirmed
 *
 * The treasury key is only ever read inside lib/chain/usdt.ts, on the server. No
 * response, log line or error message from this route contains it.
 */

const requestSchema = z.object({
  // Whole AURA only: it keeps the AURA amount, the USDT value and the on-chain
  // units exactly representable with no rounding in between.
  auraAmount: z.number().int().min(MIN_WITHDRAWAL_AURA).max(100_000_000),
  destinationAddress: z.string().refine(isAddress, "Invalid wallet address"),
});

interface Payload {
  walletAddress: string;
  withdrawals: Withdrawal[];
  account: DemoAccount | null;
  economy: { auraPerUsdt: number; minimumAura: number; chainId: number };
  treasury: { configured: boolean; error: string | null };
}

function treasuryState() {
  const error = treasuryConfigError();
  return { configured: error === null, error };
}

/**
 * Brings records left in SENDING up to date.
 *
 * A broadcast transfer whose receipt had not arrived when the request ended stays
 * SENDING with its real hash. Reading the receipt here is the only way it becomes
 * COMPLETED or FAILED, and it is exactly why a pending payout is never refunded
 * on the spot: the tokens may still be moving.
 */
async function reconcileInFlight(
  supabase: SupabaseClient,
  userId: string,
  withdrawals: Withdrawal[],
): Promise<Withdrawal[]> {
  if (treasuryConfigError()) return withdrawals;
  const pending = withdrawals.filter((row) => row.status === "SENDING" && row.txHash);
  if (!pending.length) return withdrawals;

  const settled = new Map<string, Withdrawal>();
  for (const row of pending) {
    try {
      const state = await payoutStatus(row.txHash as string);
      if (state.status === "SUCCESS") {
        settled.set(row.id, await completeWithdrawal(supabase, userId, row.id, row.txHash as string, row.explorerUrl));
      } else if (state.status === "FAILED") {
        settled.set(
          row.id,
          await failWithdrawal(
            supabase,
            userId,
            row.id,
            state.error ?? "The USDT transfer failed on X Layer Testnet.",
            row.txHash,
          ),
        );
      }
    } catch (error) {
      console.error("[withdrawals] reconcile failed", {
        id: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return withdrawals.map((row) => settled.get(row.id) ?? row);
}

export async function GET(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let withdrawals: Withdrawal[] = [];
  try {
    withdrawals = await reconcileInFlight(
      getSupabaseAdmin(),
      auth.user.id,
      await listWithdrawals(auth.supabase, auth.user.id),
    );
  } catch (error) {
    if (error instanceof WithdrawalError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          treasury: treasuryState(),
        },
        { status: error.status },
      );
    }
    console.error("[withdrawals] GET failed", error);
    return NextResponse.json({ error: "Unable to load withdrawals" }, { status: 500 });
  }

  // Re-read the account: a reconciled refund changes the balance.
  let account = auth.bundle.account;
  try {
    const bundle = await loadWalletAccount(auth.supabase, auth.user.id);
    account = bundle.account ?? account;
  } catch {
    /* the listed records are still correct; the cached account is close enough */
  }

  const payload: Payload = {
    walletAddress: auth.walletAddress,
    withdrawals,
    account,
    economy: {
      auraPerUsdt: AURA_PER_USDT,
      minimumAura: MIN_WITHDRAWAL_AURA,
      chainId: payoutChainId(),
    },
    treasury: treasuryState(),
  };
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Per-account throttle. The one-in-flight database rule already blocks a
  // double payout; this keeps a hammered button from queuing RPC work.
  if (!rateLimit(`withdrawal:${auth.user.id}`, 5, 60_000)) {
    return NextResponse.json(
      { error: "Too many withdrawal attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Enter a whole AURA amount of at least ${MIN_WITHDRAWAL_AURA.toLocaleString("en-US")} and confirm your wallet.` },
      { status: 400 },
    );
  }

  // The payout destination is the wallet of the authenticated session. A request
  // cannot nominate someone else's address, and the database re-checks it
  // against the stored profile inside request_aura_withdrawal.
  if (parsed.data.destinationAddress.toLowerCase() !== auth.walletAddress) {
    return NextResponse.json(
      { error: "Connect the wallet this account is registered to before withdrawing." },
      { status: 403 },
    );
  }

  // Configuration is checked BEFORE any AURA is reserved: an unconfigured
  // treasury must be a visible error, not a stuck balance.
  const configError = treasuryConfigError();
  if (configError) {
    return NextResponse.json({ error: configError, treasury: treasuryState() }, { status: 503 });
  }

  const balance = auth.bundle.account?.current_balance ?? 0;
  if (parsed.data.auraAmount > balance) {
    return NextResponse.json(
      { error: "Your AURA balance does not cover this withdrawal." },
      { status: 400 },
    );
  }

  const respond = async (payload: Record<string, unknown>, status: number) => {
    let account = auth.bundle.account;
    try {
      const bundle = await loadWalletAccount(auth.supabase, auth.user.id);
      account = bundle.account ?? account;
    } catch {
      /* the record is authoritative; the client refreshes the account itself */
    }
    return NextResponse.json({ ...payload, account, walletAddress: auth.walletAddress }, { status });
  };

  // Step 3: reserve. From here on, AURA has left the balance and every exit path
  // must either complete the payout or restore it.
  const admin = getSupabaseAdmin();
  let record: Withdrawal;
  try {
    record = await requestWithdrawal(admin, {
      userId: auth.user.id,
      auraAmount: parsed.data.auraAmount,
      destination: auth.walletAddress,
      chainId: payoutChainId(),
      tokenAddress: usdtTokenAddress(),
    });
  } catch (error) {
    if (error instanceof WithdrawalError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TreasuryConfigurationError) {
      return NextResponse.json({ error: error.message, treasury: treasuryState() }, { status: 503 });
    }
    console.error("[withdrawals] reserve failed", error);
    return NextResponse.json({ error: "Unable to open this withdrawal." }, { status: 500 });
  }

  /** Restores the reserved AURA. Used only when nothing moved on chain. */
  const refund = async (reason: string, txHash?: string | null) => {
    try {
      return await failWithdrawal(admin, auth.user.id, record.id, reason, txHash);
    } catch (error) {
      // The payout did not happen but the AURA is still reserved. Reporting this
      // honestly is the only correct outcome: the record stays in flight and the
      // reconcile pass on GET will not touch it, because it has no hash.
      console.error("[withdrawals] refund failed — AURA is still reserved", {
        id: record.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  try {
    await markWithdrawalSending(admin, auth.user.id, record.id);
  } catch (error) {
    console.error("[withdrawals] unable to mark sending", {
      id: record.id,
      message: error instanceof Error ? error.message : String(error),
    });
    const refunded = await refund("The withdrawal could not be started. No USDT was sent.");
    return respond(
      {
        error: "The withdrawal could not be started. No USDT was sent.",
        withdrawal: refunded ?? record,
      },
      503,
    );
  }

  // Step 4: the only place a transfer is signed. `record.usdtAmount` comes from
  // the database, computed from the debited AURA — never from the request body.
  let payout;
  try {
    payout = await sendUsdtPayout({ to: record.destinationAddress, usdtAmount: record.usdtAmount });
  } catch (error) {
    const message =
      error instanceof TreasuryConfigurationError
        ? error.message
        : "The USDT transfer could not be attempted.";
    console.error("[withdrawals] payout threw", {
      id: record.id,
      message: error instanceof Error ? error.message : String(error),
    });
    const refunded = await refund(message);
    return respond({ error: message, withdrawal: refunded ?? record }, 503);
  }

  if (payout.status === "SUCCESS" && payout.txHash) {
    try {
      const completed = await completeWithdrawal(
        admin,
        auth.user.id,
        record.id,
        payout.txHash,
        payout.explorerUrl,
      );
      return respond({ withdrawal: completed }, 200);
    } catch (error) {
      // The tokens DID move. The record must not be refunded or marked failed;
      // it keeps its hash and the next GET reconciles it to COMPLETED.
      console.error("[withdrawals] payout confirmed but the record was not completed", {
        id: record.id,
        txHash: payout.txHash,
        message: error instanceof Error ? error.message : String(error),
      });
      try {
        await markWithdrawalSending(admin, auth.user.id, record.id, payout.txHash, payout.explorerUrl);
      } catch {
        /* logged above; the hash is in the log either way */
      }
      return respond(
        {
          withdrawal: { ...record, status: "SENDING", txHash: payout.txHash, explorerUrl: payout.explorerUrl },
          warning:
            "The USDT transfer was sent but the record could not be finalised. Refresh to see the confirmed state.",
        },
        202,
      );
    }
  }

  if (payout.status === "PENDING" && payout.txHash) {
    // Broadcast, not yet confirmed. The AURA stays reserved on purpose.
    try {
      const sending = await markWithdrawalSending(
        admin,
        auth.user.id,
        record.id,
        payout.txHash,
        payout.explorerUrl,
      );
      return respond({ withdrawal: sending, warning: payout.error }, 202);
    } catch (error) {
      console.error("[withdrawals] unable to record the pending hash", {
        id: record.id,
        txHash: payout.txHash,
        message: error instanceof Error ? error.message : String(error),
      });
      return respond({ withdrawal: record, warning: payout.error }, 202);
    }
  }

  // Nothing moved: restore the AURA and record the failure.
  const reason = payout.error ?? "The USDT transfer failed. No tokens were moved.";
  const refunded = await refund(reason, payout.txHash);
  return respond(
    {
      error: refunded
        ? reason
        : `${reason} Your AURA is still reserved — refresh in a moment or contact support.`,
      withdrawal: refunded ?? record,
    },
    502,
  );
}
