import type { Battle } from "../types";

const STATUS_RANK: Record<Battle["status"], number> = {
  WAITING: 0,
  STARTING: 1,
  ACTIVE: 2,
  FINISHED: 3,
  SETTLING: 4,
  VERIFIED: 5,
};

function rank(status: Battle["status"]): number {
  return STATUS_RANK[status] ?? -1;
}

function timestamp(value?: string | null): number {
  return value ? Date.parse(value) : NaN;
}

/**
 * Client-side guard only.
 *
 * The server/Supabase remains authoritative for settlement. This function
 * prevents stale polling responses from replacing a newer battle snapshot.
 */
export function isAcceptableBattleTransition(
  current: Battle | null | undefined,
  next: Battle,
): boolean {
  if (!current) return true;
  if (current.id !== next.id) return true;

  const currentRank = rank(current.status);
  const nextRank = rank(next.status);

  // Never allow a stale response to move a battle backwards.
  if (nextRank < currentRank) return false;

  // For ACTIVE battles, an older expiry/start timestamp is stale even when
  // the status is also ACTIVE.
  if (current.status === "ACTIVE" && next.status === "ACTIVE") {
    const currentExpiry = timestamp(current.expires_at);
    const nextExpiry = timestamp(next.expires_at);

    if (Number.isFinite(currentExpiry) && Number.isFinite(nextExpiry)) {
      return nextExpiry >= currentExpiry;
    }

    const currentStarted = timestamp(current.started_at);
    const nextStarted = timestamp(next.started_at);

    if (Number.isFinite(currentStarted) && Number.isFinite(nextStarted)) {
      return nextStarted >= currentStarted;
    }
  }

  return true;
}

export function chooseFreshBattle(
  current: Battle | null | undefined,
  next: Battle,
): Battle {
  return isAcceptableBattleTransition(current, next)
    ? next
    : (current as Battle);
}
