import type { Battle } from "../types";

export function isAcceptableBattleTransition(
  current: Battle | null | undefined,
  next: Battle,
): boolean {
  if (!current || current.id !== next.id) return true;
  if (current.status === next.status) return true;

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
