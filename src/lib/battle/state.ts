import type { Battle } from "../types";

export function isAcceptableBattleTransition(
  current: Battle | null | undefined,
  next: Battle,
): boolean {
  if (!current || current.id !== next.id) return true;

  // Same-status responses can still be stale. In particular, an older ACTIVE
  // response must never replace a newer ACTIVE battle with an earlier
  // expires_at, because the client derives its countdown and settlement timer
  // from this snapshot.
  if (current.status === next.status) {
    if (current.status === "ACTIVE") {
      const currentExpiry = current.expires_at ? Date.parse(current.expires_at) : NaN;
      const nextExpiry = next.expires_at ? Date.parse(next.expires_at) : NaN;
      if (Number.isFinite(currentExpiry) && Number.isFinite(nextExpiry)) {
        return nextExpiry >= currentExpiry;
      }
      const currentStarted = current.started_at ? Date.parse(current.started_at) : NaN;
      const nextStarted = next.started_at ? Date.parse(next.started_at) : NaN;
      if (Number.isFinite(currentStarted) && Number.isFinite(nextStarted)) {
        return nextStarted >= currentStarted;
      }
    }
    return true;
  }

  switch (current.status) {
    case "WAITING":
      return true;
    case "STARTING":
      return next.status !== "WAITING";
    case "ACTIVE":
      return next.status === "FINISHED" || next.status === "SETTLING" || next.status === "VERIFIED";
    case "FINISHED":
      return next.status === "SETTLING" || next.status === "VERIFIED";
    case "SETTLING":
      return next.status === "FINISHED" || next.status === "VERIFIED";
    case "VERIFIED":
      return false;
    default:
      return true;
  }
}

export function chooseFreshBattle(current: Battle | null | undefined, next: Battle): Battle {
  return isAcceptableBattleTransition(current, next) ? next : current as Battle;
}
