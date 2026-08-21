import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Withdrawal, WithdrawalState } from "../types";

// Supabase access layer for AURA -> USDT (X Layer Testnet) redemptions.
//
// Supabase is the source of truth. There is no in-memory withdrawal store: every
// record, status change and transaction hash is written here, so the history and
// any in-flight redemption survive a server restart.
//
// All four mutations go through security-definer functions added by
// supabase/migrations/202608210001_aura_withdrawals.sql, called with the CALLER'S
// token. Ownership is therefore resolved from auth.uid() inside the database and
// never from a request field: a caller cannot debit, refund or complete another
// account's redemption, and the withdrawals table itself grants SELECT only.

const MIGRATION_HINT =
  "USDT Testnet redemption is not installed. Apply supabase/migrations/202608210001_aura_withdrawals.sql.";

interface WithdrawalRow {
  id: string;
  user_id: string;
  aura_amount: number | string;
  usdt_amount: number | string;
  destination_address: string;
  chain_id: number;
  token_address: string;
  status: WithdrawalState;
  tx_hash: string | null;
  explorer_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
}

/** A withdrawal failure with the HTTP status the route should answer with. */
export class WithdrawalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "WithdrawalError";
  }
}

export function withdrawalFromRow(row: WithdrawalRow): Withdrawal {
  return {
    id: row.id,
    userId: row.user_id,
    auraAmount: Number(row.aura_amount),
    usdtAmount: Number(row.usdt_amount),
    destinationAddress: row.destination_address,
    chainId: row.chain_id,
    tokenAddress: row.token_address,
    status: row.status,
    txHash: row.tx_hash,
    explorerUrl: row.explorer_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
  };
}

/**
 * Turns a database failure into a user-facing message plus status.
 *
 * The RPCs raise stable codes rather than prose, so the wording lives here and
 * the database stays the single place the rules are enforced.
 */
function mapError(error: PostgrestError, context: string): WithdrawalError {
  const raw = (error.message || "").trim();
  const code = raw.split(/[\s:]/)[0]?.toUpperCase() ?? "";

  // Function or table missing: the migration has not been applied.
  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42P01" ||
    error.code === "42703"
  ) {
    return new WithdrawalError(MIGRATION_HINT, 503, "MIGRATION_REQUIRED");
  }
  // The partial unique index is the last line of defence against a double submit.
  if (error.code === "23505") {
    return new WithdrawalError(
      "A withdrawal is already in progress for this account.",
      409,
      "WITHDRAWAL_IN_FLIGHT",
    );
  }
  if (error.code === "23514") {
    return new WithdrawalError("The database rejected this withdrawal amount.", 400, "CHECK_FAILED");
  }

  const known: Record<string, { message: string; status: number }> = {
    AUTH_REQUIRED: { message: "Authentication required", status: 401 },
    PROFILE_REQUIRED: { message: "Wallet onboarding required", status: 403 },
    ACCOUNT_REQUIRED: { message: "Wallet onboarding required", status: 403 },
    AMOUNT_NOT_WHOLE: { message: "Redeem whole AURA only.", status: 400 },
    AMOUNT_BELOW_MINIMUM: { message: "The minimum redemption is 1,000 AURA.", status: 400 },
    INSUFFICIENT_AURA: {
      message: "Your AURA balance does not cover this withdrawal.",
      status: 400,
    },
    DESTINATION_INVALID: { message: "The destination wallet address is not valid.", status: 400 },
    DESTINATION_MISMATCH: {
      message: "Withdrawals are only sent to the wallet this account is registered to.",
      status: 403,
    },
    TOKEN_INVALID: { message: "The configured USDT contract address is not valid.", status: 500 },
    CHAIN_INVALID: { message: "The configured X Layer chain id is not valid.", status: 500 },
    WITHDRAWAL_IN_FLIGHT: {
      message: "A withdrawal is already in progress for this account.",
      status: 409,
    },
    WITHDRAWAL_NOT_FOUND: { message: "Withdrawal not found.", status: 404 },
    WITHDRAWAL_NOT_IN_FLIGHT: { message: "This withdrawal is no longer in progress.", status: 409 },
    WITHDRAWAL_ALREADY_COMPLETED: { message: "This withdrawal is already completed.", status: 409 },
    WITHDRAWAL_ALREADY_FAILED: { message: "This withdrawal already failed.", status: 409 },
    TX_HASH_INVALID: { message: "The payout transaction hash was rejected.", status: 500 },
  };

  const match = known[code];
  if (match) return new WithdrawalError(match.message, match.status, code);

  console.error(`[withdrawals] ${context} failed`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  return new WithdrawalError("Unable to process this withdrawal.", 500, "UNAVAILABLE");
}

function single(data: unknown): Withdrawal {
  if (!data || typeof data !== "object") {
    throw new WithdrawalError("Unable to read the withdrawal record.", 500, "UNREADABLE");
  }
  return withdrawalFromRow(data as WithdrawalRow);
}

export async function listWithdrawals(
  supabase: SupabaseClient,
  userId: string,
  limit = 25,
): Promise<Withdrawal[]> {
  const { data, error } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw mapError(error, "list");
  return (data ?? []).map((row) => withdrawalFromRow(row as WithdrawalRow));
}

/**
 * Debits the AURA and opens a PENDING record, in one database transaction.
 *
 * The balance check, the debit and the in-flight check all happen under a row
 * lock inside request_aura_withdrawal, so two concurrent requests cannot both
 * reserve the same AURA.
 */
export async function requestWithdrawal(
  supabase: SupabaseClient,
  input: { userId: string; auraAmount: number; destination: string; chainId: number; tokenAddress: string },
): Promise<Withdrawal> {
  const { data, error } = await supabase.rpc("request_aura_withdrawal", {
    p_user_id: input.userId,
    p_aura_amount: input.auraAmount,
    p_destination: input.destination,
    p_chain_id: input.chainId,
    p_token_address: input.tokenAddress,
  });
  if (error) throw mapError(error, "request");
  return single(data);
}

/** PENDING -> SENDING, recording the broadcast hash when there is one. */
export async function markWithdrawalSending(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  txHash?: string | null,
  explorerUrl?: string | null,
): Promise<Withdrawal> {
  const { data, error } = await supabase.rpc("mark_aura_withdrawal_sending", {
    p_user_id: userId,
    p_id: id,
    p_tx_hash: txHash ?? null,
    p_explorer_url: explorerUrl ?? null,
  });
  if (error) throw mapError(error, "sending");
  return single(data);
}

/** COMPLETED with the real transaction hash. Idempotent for the same hash. */
export async function completeWithdrawal(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  txHash: string,
  explorerUrl?: string | null,
): Promise<Withdrawal> {
  const { data, error } = await supabase.rpc("complete_aura_withdrawal", {
    p_user_id: userId,
    p_id: id,
    p_tx_hash: txHash,
    p_explorer_url: explorerUrl ?? null,
  });
  if (error) throw mapError(error, "complete");
  return single(data);
}

/**
 * FAILED, restoring the reserved AURA to the balance.
 *
 * Only ever called when nothing moved on chain. The RPC refuses to refund a row
 * that is already COMPLETED and refunds a FAILED row only once.
 */
export async function failWithdrawal(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  reason: string,
  txHash?: string | null,
): Promise<Withdrawal> {
  const { data, error } = await supabase.rpc("fail_aura_withdrawal", {
    p_user_id: userId,
    p_id: id,
    p_error: reason,
    p_tx_hash: txHash ?? null,
  });
  if (error) throw mapError(error, "fail");
  return single(data);
}
