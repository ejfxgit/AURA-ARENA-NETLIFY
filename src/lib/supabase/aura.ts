import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  Battle,
  CustomAgentAvatarStyle,
  DemoAccount,
  UserSettings,
  WalletAccountBundle,
  WalletProfile,
} from "../types";
import { userSettingsFromRow, type UserSettingsRow } from "../account";
import { hasSupabase } from "../config";
import { getAuthenticatedSupabase, getSupabaseAdmin } from "./server";
import { walletAddressFromUser } from "./wallet-identity";
import { normalizeBattleTiming } from "../battle/timing";
import { normalizeBattleLeverage } from "../battle/leverage";

export { walletAddressFromUser } from "./wallet-identity";

interface ProfileRow {
  id: string;
  wallet_address: string;
  display_name: string;
  username: string | null;
  bio: string | null;
  avatar_style: CustomAgentAvatarStyle | null;
  avatar_url: string | null;
  timezone: string | null;
  language: string | null;
  settings: Record<string, unknown> | null;
  reputation_score: number;
  created_at: string;
  updated_at: string;
}

interface DemoAccountRow {
  user_id: string;
  starting_balance: number | string;
  current_balance: number | string;
  realized_pnl: number | string;
  unrealized_pnl: number | string;
  total_battles: number;
  wins: number;
  losses: number;
  valid_challenges: number;
  invalid_challenges: number;
  /** Added by 202608210001_aura_withdrawals.sql. Absent on older schemas. */
  aura_withdrawn_total?: number | string | null;
}

function profileFromRow(row: ProfileRow): WalletProfile {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    // Fallbacks keep the workspace usable if 202608180002_profile_settings.sql
    // has not been applied yet; the settings API reports the real cause.
    username: row.username ?? null,
    bio: row.bio ?? "",
    avatarStyle: row.avatar_style ?? null,
    avatarUrl: row.avatar_url ?? null,
    timezone: row.timezone ?? "UTC",
    language: row.language ?? "en",
    settings: row.settings ?? {},
    reputationScore: row.reputation_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function accountFromRow(row: DemoAccountRow): DemoAccount {
  return {
    userId: row.user_id,
    starting_balance: Number(row.starting_balance),
    current_balance: Number(row.current_balance),
    realized_pnl: Number(row.realized_pnl),
    unrealized_pnl: Number(row.unrealized_pnl),
    total_battles: row.total_battles,
    wins: row.wins,
    losses: row.losses,
    valid_challenges: row.valid_challenges,
    invalid_challenges: row.invalid_challenges,
    // 0 until 202608210001_aura_withdrawals.sql is applied. The withdrawal API
    // reports that migration explicitly rather than silently reading a gap.
    aura_withdrawn_total: Number(row.aura_withdrawn_total ?? 0),
  };
}

export async function loadWalletAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<WalletAccountBundle> {
  const [{ data: profile, error: profileError }, { data: account, error: accountError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("demo_accounts").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (profileError || accountError) throw new Error("Unable to load wallet account");
  return {
    profile: profile ? profileFromRow(profile as ProfileRow) : null,
    account: account ? accountFromRow(account as DemoAccountRow) : null,
  };
}

export async function createWalletAccount(
  userId: string,
  walletAddress: string,
  displayName: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const normalizedAddress = walletAddress.toLowerCase();
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("wallet_address", normalizedAddress)
    .maybeSingle();
  if (existingProfileError) throw new Error("Unable to check wallet profile");
  if (existingProfile && existingProfile.id !== userId) {
    throw new Error("Wallet session must be refreshed");
  }
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    wallet_address: normalizedAddress,
    display_name: displayName,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) {
    if (profileError.code === "23505") throw new Error("Wallet session must be refreshed");
    throw new Error(profileError.message || "Unable to create wallet profile");
  }

  const { error: accountError } = await supabase.from("demo_accounts").upsert(
    { user_id: userId },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (accountError) throw new Error(accountError.message || "Unable to create demo account");
}

/**
 * Reads the caller's workspace settings. Returns null when the row does not
 * exist yet so callers can decide whether to create the default row.
 */
export async function loadUserSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? userSettingsFromRow(data as UserSettingsRow) : null;
}

/**
 * Returns the caller's settings, creating the default row on first use.
 * Ownership comes from the authenticated user id, never from the request body,
 * and the insert is additionally constrained by the user_settings RLS policy.
 */
export async function ensureUserSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserSettings> {
  const existing = await loadUserSettings(supabase, userId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("user_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  // A concurrent request may have created the row first: fall back to reading it.
  if (error?.code === "23505") {
    const row = await loadUserSettings(supabase, userId);
    if (row) return row;
  }
  if (error || !data) throw error ?? new Error("Unable to create user settings");
  return userSettingsFromRow(data as UserSettingsRow);
}

export async function saveDemoAccount(supabase: SupabaseClient, account: DemoAccount): Promise<void> {
  const { error } = await supabase
    .from("demo_accounts")
    .update({
      current_balance: account.current_balance,
      realized_pnl: account.realized_pnl,
      unrealized_pnl: account.unrealized_pnl,
      total_battles: account.total_battles,
      wins: account.wins,
      losses: account.losses,
      valid_challenges: account.valid_challenges,
      invalid_challenges: account.invalid_challenges,
    })
    .eq("user_id", account.userId);
  if (error) throw new Error("Unable to save demo account");
}

export async function saveProfileReputation(
  supabase: SupabaseClient,
  userId: string,
  reputationScore: number,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ reputation_score: reputationScore })
    .eq("id", userId);
  if (error) throw new Error("Unable to save reputation");
}

const battleStatusRank: Record<Battle["status"], number> = {
  WAITING: 0,
  STARTING: 1,
  ACTIVE: 2,
  FINISHED: 3,
  SETTLING: 4,
  VERIFIED: 5,
};

function isPersistedBattleAtLeastAsNew(current: Battle, next: Battle): boolean {
  if (current.id !== next.id) return false;
  return battleStatusRank[current.status] >= battleStatusRank[next.status];
}

export async function persistBattle(
  supabase: SupabaseClient,
  ownerId: string,
  battle: Battle,
): Promise<void> {
  const existing = await loadBattle(supabase, ownerId, battle.id);
  if (existing && isPersistedBattleAtLeastAsNew(existing, battle) && existing.status !== battle.status) {
    return;
  }
  const { error } = await supabase.from("user_battles").upsert({
    id: battle.id,
    owner_id: ownerId,
    battle,
    created_at: battle.createdAt,
  });
  if (error) throw new Error(`Unable to persist battle (${error.code ?? "database"}: ${error.message})`);
}

/**
 * Writes the battle only while the persisted row is still unsettled.
 *
 * Live-price refreshes and challenges are computed from a row that was read
 * moments earlier, and a settlement can land in that window. A settled result is
 * canonical, so those writes must be conditional rather than a blind upsert:
 * `false` means the stored row has already been settled and the caller's copy is
 * now stale, so it was NOT written and must not be published.
 *
 * The filter matches on the stored JSON flag. Every battle row is created with
 * `settlement_applied: false` (see POST /api/battles), so a row that does not
 * match is either settled or malformed — in both cases skipping the write is the
 * safe outcome.
 */
export async function persistUnsettledBattle(
  supabase: SupabaseClient,
  ownerId: string,
  battle: Battle,
): Promise<boolean> {
  let query = supabase
    .from("user_battles")
    .update({ battle })
    .eq("id", battle.id)
    .eq("owner_id", ownerId)
    .eq("battle->>settlement_applied", "false")
    .eq("battle->>status", battle.status);

  if (battle.expires_at) {
    // ACTIVE timing is part of the canonical battle identity. A stale worker
    // must not be able to write an older expires_at over a newer start.
    query = query.eq("battle->>expires_at", battle.expires_at);
  }

  const { data, error } = await query.select("id");
  if (error) throw new Error("Unable to persist battle");
  return (data?.length ?? 0) > 0;
}

export interface BattleStartOutcome {
  applied: boolean;
  battle: Battle;
  account: DemoAccount;
}

/** Atomically reserves the stake and stores the first canonical battle start. */
export async function startWalletBattle(
  _supabase: SupabaseClient,
  battle: Battle,
): Promise<BattleStartOutcome> {
  const { data, error } = await getSupabaseAdmin().rpc("start_wallet_battle", {
    p_user_id: battle.userId,
    p_battle: battle,
  });
  if (error) throw new Error(error.message || "Unable to reserve battle stake");
  const payload = data as { applied?: boolean; battle?: Battle; account?: DemoAccountRow } | null;
  if (!payload?.battle || !payload.account) throw new Error("Unable to read battle start result");
  return {
    applied: payload.applied === true,
    battle: normalizeBattleLeverage(normalizeBattleTiming(payload.battle as Battle & { duration_minutes?: number })),
    account: accountFromRow(payload.account),
  };
}

/**
 * The outcome of one settlement attempt.
 *
 * `applied` is true only for the request whose settlement transaction actually
 * credited the account. A concurrent or retried request gets `applied: false` and
 * the battle that was already stored — the FIRST settlement is canonical.
 */
export interface SettlementOutcome {
  applied: boolean;
  battle: Battle;
}

/**
 * Runs the settlement transaction and returns the canonical persisted battle.
 *
 * `settle_wallet_battle` takes the row lock, credits balance/counters/reputation
 * and stores the battle in one transaction, and returns what is stored. The
 * caller must treat the returned battle — not its own draft — as the result, so a
 * second request can never publish an exit price or winner that differs from the
 * one the account was credited against.
 */
export async function settleWalletBattle(
  _supabase: SupabaseClient,
  battle: Battle,
  validChallenges: number,
  invalidChallenges: number,
): Promise<SettlementOutcome> {
  const { data, error } = await getSupabaseAdmin().rpc("settle_wallet_battle", {
    p_user_id: battle.userId,
    p_battle: battle,
    p_human_pnl: battle.human_pnl,
    p_winner: battle.winner ?? "DRAW",
    p_valid_challenges: validChallenges,
    p_invalid_challenges: invalidChallenges,
  });
  if (error) throw new Error("Unable to settle wallet demo account");

  const payload = data as { applied?: boolean; battle?: Battle } | null;
  if (payload && typeof payload === "object" && payload.battle) {
    return {
      applied: payload.applied === true,
      battle: normalizeBattleLeverage(normalizeBattleTiming(payload.battle as Battle & { duration_minutes?: number })),
    };
  }
  throw new Error("Unable to read the settled battle");
}

export async function loadBattle(
  _supabase: SupabaseClient,
  ownerId: string,
  battleId: string,
): Promise<Battle | null> {
  const { data, error } = await getSupabaseAdmin().rpc("get_wallet_battle", {
    p_user_id: ownerId,
    p_battle_id: battleId,
  });
  if (error) throw new Error("Unable to load battle");
  return data ? normalizeBattleLeverage(normalizeBattleTiming(data as Battle & { duration_minutes?: number })) : null;
}

export async function listBattlesForUser(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<Battle[]> {
  const { data, error } = await supabase
    .from("user_battles")
    .select("battle")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load battle history (${error.code ?? "database"}: ${error.message})`);
  return (data ?? []).map((row) => normalizeBattleLeverage(normalizeBattleTiming(row.battle as Battle & { duration_minutes?: number })));
}

/**
 * Cross-user league data, read from persisted settlements.
 *
 * Every source table is owner-scoped by RLS, so a league cannot be assembled
 * with a caller's own token — it would always return a league of one. These read
 * through the two security-definer functions added by
 * supabase/migrations/202608190002_leaderboard_from_persisted_battles.sql, which
 * expose only aggregates and an anonymized identity.
 *
 * Failures throw rather than resolving to empty. An empty league and an
 * unreadable one are different facts, and reporting a database outage as "no one
 * has battled yet" would be a fabricated statistic.
 */
export type LeaderboardUnavailableKind = "not_configured" | "migration_required" | "unavailable";

export class LeaderboardUnavailableError extends Error {
  constructor(message: string, readonly kind: LeaderboardUnavailableKind) {
    super(message);
    this.name = "LeaderboardUnavailableError";
  }
}

/** Raw per-user totals. Rate math stays in the API route. */
export interface LeaderboardHumanRow {
  user_id: string;
  realized_pnl: number | string;
  wins: number;
  losses: number;
  valid_challenges: number;
  invalid_challenges: number;
  reputation_score: number;
}

/** Raw per-agent totals for the built-in specialists. */
export interface LeaderboardAgentRow {
  agent_id: string;
  wins: number;
  losses: number;
  realized_pnl: number | string;
  valid_challenges: number;
  defended_challenges: number;
}

export async function loadLeaderboard(limit = 50): Promise<{
  humans: LeaderboardHumanRow[];
  agents: LeaderboardAgentRow[];
}> {
  if (!hasSupabase()) {
    throw new LeaderboardUnavailableError(
      "Leaderboard data is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.",
      "not_configured",
    );
  }

  const admin = getSupabaseAdmin();
  const [humans, agents] = await Promise.all([
    admin.rpc("leaderboard_humans", { p_limit: limit }),
    admin.rpc("leaderboard_agents"),
  ]);

  for (const result of [humans, agents]) {
    // PGRST202 is "function not found in schema cache".
    if (result.error?.code === "PGRST202") {
      throw new LeaderboardUnavailableError(
        "Leaderboard functions are missing. Apply supabase/migrations/202608190002_leaderboard_from_persisted_battles.sql.",
        "migration_required",
      );
    }
    if (result.error) {
      console.error("[leaderboard] read failed", {
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
      });
      throw new LeaderboardUnavailableError("Unable to read leaderboard data", "unavailable");
    }
  }

  return {
    humans: (humans.data ?? []) as LeaderboardHumanRow[],
    agents: (agents.data ?? []) as LeaderboardAgentRow[],
  };
}

export type WalletAuthResult =  | {
      ok: true;
      supabase: SupabaseClient;
      user: User;
      walletAddress: string;
      bundle: WalletAccountBundle;
    }
  | { ok: false; error: string; status: number };

export async function getWalletAuth(
  req: Request,
  requireProfile = true,
): Promise<WalletAuthResult> {
  const auth = await getAuthenticatedSupabase(req);
  if (!auth.ok) return auth;
  const walletAddress = walletAddressFromUser(auth.user);
  if (!walletAddress) {
    return { ok: false, error: "Wallet-authenticated session required", status: 403 };
  }
  try {
    const bundle = await loadWalletAccount(auth.supabase, auth.user.id);
    if (!bundle.profile) {
      const admin = getSupabaseAdmin();
      const { data: existingProfile, error: ownerError } = await admin
        .from("profiles")
        .select("id")
        .eq("wallet_address", walletAddress)
        .maybeSingle();
      if (ownerError) throw new Error("Unable to resolve wallet account owner");
      if (existingProfile && existingProfile.id !== auth.user.id) {
        return { ok: false, error: "Wallet session must be refreshed", status: 401 };
      }
    }
    if (requireProfile && (!bundle.profile || !bundle.account)) {
      return { ok: false, error: "Wallet onboarding required", status: 403 };
    }
    return { ...auth, walletAddress, bundle };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load wallet account",
      status: 500,
    };
  }
}
