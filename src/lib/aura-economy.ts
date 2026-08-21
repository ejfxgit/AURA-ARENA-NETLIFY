// The AURA demo economy, in one place.
//
// AURA is the reward unit of Demo mode. It is NOT dollars, and it is never
// displayed with a "$": every reward, balance, stake and P&L figure that belongs
// to the platform economy is denominated in AURA. Market prices stay in their
// real quote currency and keep the "$" formatters in lib/utils.ts.
//
// Redemption is a fixed, non-negotiable rate:
//
//   1,000 AURA = 1 USDT on X Layer TESTNET
//
// Testnet USDT has no monetary value. Every surface that shows a redemption
// figure also carries TESTNET_NOTICE, because a number that looks like a dollar
// amount must never be mistaken for one.
//
// Browser-safe by design: no secrets, no server config, no treasury details.
// Server-only treasury settings live in lib/config.ts.

/** AURA required for one testnet USDT. Fixed by product definition. */
export const AURA_PER_USDT = 1000;

/** Smallest redeemable amount, in AURA. Equals exactly 1 USDT testnet. */
export const MIN_WITHDRAWAL_AURA = 1000;

/** Unit label for the reward currency. */
export const AURA_UNIT = "AURA";

/** Token label used wherever a redemption value is shown. */
export const USDT_TESTNET_UNIT = "USDT";

/** Shown next to every redemption figure. */
export const TESTNET_NOTICE = "TESTNET / NO REAL VALUE";

/** One-line statement of the rate, for headers and tooltips. */
export const AURA_RATE_LABEL = "1,000 AURA = 1 USDT (X Layer Testnet)";

/** Longer explanation reused across landing, portfolio and withdraw. */
export const AURA_ECONOMY_EXPLANATION =
  "Battles pay out AURA, the reward unit of Demo mode. AURA can be redeemed for USDT on X Layer Testnet at a fixed 1,000 AURA = 1 USDT. Testnet USDT is a test asset with no monetary value.";

/**
 * Testnet USDT for an AURA amount.
 *
 * Truncated to the six decimals USDT uses, never rounded up, so a payout can
 * never exceed the AURA that was debited for it.
 */
export function auraToUsdt(aura: number): number {
  if (!Number.isFinite(aura) || aura <= 0) return 0;
  return Math.floor((aura / AURA_PER_USDT) * 1e6) / 1e6;
}

/** AURA needed for a testnet USDT amount. */
export function usdtToAura(usdt: number): number {
  if (!Number.isFinite(usdt) || usdt <= 0) return 0;
  return usdt * AURA_PER_USDT;
}

/**
 * The largest whole-AURA amount a balance can redeem.
 *
 * Redemptions are whole AURA only: it keeps the amount, the USDT value and the
 * on-chain transfer exactly representable, with no rounding anywhere in the
 * chain. Fractional AURA earned from battles stays in the balance.
 */
export function redeemableAura(balance: number): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  return Math.floor(balance);
}

/** True when this balance can currently fund at least the minimum redemption. */
export function canRedeem(balance: number): boolean {
  return redeemableAura(balance) >= MIN_WITHDRAWAL_AURA;
}

/**
 * Formats an AURA amount, e.g. "1,000 AURA" or "-42.50 AURA".
 *
 * Whole numbers stay whole; fractional rewards keep two decimals. `sign: true`
 * prefixes a positive value with "+", matching the P&L formatters.
 */
export function fmtAura(n: number, opts?: { sign?: boolean; unit?: boolean }): string {
  const value = Number.isFinite(n) ? n : 0;
  const dp = Number.isInteger(value) ? 0 : 2;
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  const sign = value < 0 ? "-" : opts?.sign && value > 0 ? "+" : "";
  return opts?.unit === false ? `${sign}${body}` : `${sign}${body} ${AURA_UNIT}`;
}

/** Formats a testnet USDT amount, e.g. "10.00 USDT". */
export function fmtUsdtTestnet(n: number, opts?: { unit?: boolean }): string {
  const value = Number.isFinite(n) ? n : 0;
  const body = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return opts?.unit === false ? body : `${body} ${USDT_TESTNET_UNIT}`;
}

/** "1,000 AURA -> 1.00 USDT", for confirmation rows. */
export function fmtRedemption(aura: number): string {
  return `${fmtAura(aura)} → ${fmtUsdtTestnet(auraToUsdt(aura))}`;
}

// -- battle stakes -----------------------------------------------------------

/**
 * Smallest stake a battle can be created with, in AURA.
 *
 * There is deliberately NO platform maximum. The only ceiling on a stake is the
 * caller's own available balance, read server-side when the battle is created
 * and re-checked atomically under `for update` when the stake is reserved
 * (start_wallet_battle). A fixed cap would have been a second, quieter rule
 * that disagreed with the balance the user can actually see.
 */
export const MIN_BATTLE_STAKE_AURA = 1;

/**
 * Decimal places a stake may carry. Matches how fmtAura renders AURA and stays
 * well inside demo_accounts.current_balance, which is numeric(18, 4).
 */
export const BATTLE_STAKE_DECIMALS = 2;

/**
 * Convenience shortcuts for the stake selector, and nothing more.
 *
 * No validation branch, settlement path or business rule may key off these
 * values: any stake that clears battleStakeIssue() is equally valid.
 */
export const BATTLE_STAKE_PRESETS = [25, 50, 100, 250] as const;

/** The stake the selector starts on. One of the presets, purely for the form. */
export const DEFAULT_BATTLE_STAKE_AURA = 50;

/**
 * The AI counterparty's notional stake, used only to size the agent's side of
 * the P&L comparison. Named here so no route re-declares it as a bare literal.
 */
export const AI_BATTLE_STAKE_AURA = 100;

/**
 * True when `aura` carries no more precision than a stake is allowed to.
 *
 * Compared with a tolerance rather than by equality: 175.55 * 100 is
 * 17554.999999999998 in binary floating point, so an exact test would reject
 * amounts that are perfectly valid at two decimal places.
 */
function withinStakePrecision(aura: number): boolean {
  const scaled = aura * 10 ** BATTLE_STAKE_DECIMALS;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/**
 * The largest stake a balance can currently fund, truncated to the allowed
 * precision so the suggestion can never exceed the balance itself.
 */
export function maxBattleStake(balance: number): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  const scale = 10 ** BATTLE_STAKE_DECIMALS;
  return Math.floor(balance * scale) / scale;
}

/**
 * Why this stake cannot fund a battle, or null when it can.
 *
 * Shared by the stake form and POST /api/battles so both apply one rule. The
 * server calls it with a freshly read balance and its verdict is the
 * authoritative one; the client copy only keeps the form honest.
 *
 * The insufficient-balance message is worded to match the exception raised by
 * start_wallet_battle, so the same failure reads the same at every layer.
 */
export function battleStakeIssue(aura: number, balance: number): string | null {
  if (typeof aura !== "number" || Number.isNaN(aura)) return "Enter a stake in AURA.";
  if (!Number.isFinite(aura)) return "Enter a stake in AURA.";
  if (aura <= 0) return "Your stake must be greater than zero.";
  if (aura < MIN_BATTLE_STAKE_AURA) return `The minimum stake is ${fmtAura(MIN_BATTLE_STAKE_AURA)}.`;
  if (!withinStakePrecision(aura)) {
    return `Stakes support up to ${BATTLE_STAKE_DECIMALS} decimal places.`;
  }
  if (aura > balance) return "Insufficient AURA balance";
  return null;
}

// -- withdrawal lifecycle ----------------------------------------------------

export type WithdrawalStatus = "PENDING" | "SENDING" | "COMPLETED" | "FAILED";

export const WITHDRAWAL_STATUS_META: Record<
  WithdrawalStatus,
  { label: string; detail: string; tone: string }
> = {
  PENDING: {
    label: "Pending",
    detail: "AURA is reserved. The treasury transfer has not been broadcast yet.",
    tone: "text-aura-wait border-aura-wait/25 bg-aura-wait/[0.08]",
  },
  SENDING: {
    label: "Sending",
    detail: "The USDT transfer is broadcast and waiting for confirmation on X Layer Testnet.",
    tone: "text-aura-accent border-aura-accent/25 bg-aura-accent/[0.08]",
  },
  COMPLETED: {
    label: "Completed",
    detail: "Confirmed on X Layer Testnet. The transaction hash below is the real payout.",
    tone: "text-aura-long border-aura-long/25 bg-aura-long/[0.08]",
  },
  FAILED: {
    label: "Failed",
    detail: "No USDT moved. The reserved AURA was returned to your balance.",
    tone: "text-aura-short border-aura-short/25 bg-aura-short/[0.08]",
  },
};

/** True while a withdrawal still occupies the one in-flight slot. */
export function isInFlight(status: WithdrawalStatus): boolean {
  return status === "PENDING" || status === "SENDING";
}

/**
 * Why a requested amount cannot be redeemed, or null when it can.
 * The server re-validates all of this; this only keeps the form honest.
 */
export function withdrawalAmountIssue(aura: number, balance: number): string | null {
  if (!Number.isFinite(aura) || aura <= 0) return "Enter an amount in AURA.";
  if (!Number.isInteger(aura)) return "Redeem whole AURA only.";
  if (aura < MIN_WITHDRAWAL_AURA) {
    return `The minimum redemption is ${fmtAura(MIN_WITHDRAWAL_AURA)}.`;
  }
  if (aura > redeemableAura(balance)) {
    return `Your balance holds ${fmtAura(redeemableAura(balance))}.`;
  }
  return null;
}
