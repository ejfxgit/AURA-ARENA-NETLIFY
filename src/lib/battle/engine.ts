import type { Battle, Direction } from "../types";
import { battleExpiresAt, isBattleExpired } from "./timing";
import { battlePositionPnl, leveragedPositionPnl } from "./leverage";

// P&L for a demo position. Never trust client values — always computed here.
export function positionPnl(
  direction: Direction,
  amount: number,
  entry: number,
  current: number,
  leverage: number,
): number {
  return leveragedPositionPnl(direction, amount, entry, current, leverage);
}

export function computeWinner(humanPnl: number, aiPnl: number): "HUMAN" | "AI" | "DRAW" {
  const diff = humanPnl - aiPnl;
  if (Math.abs(diff) < 0.0001) return "DRAW";
  return diff > 0 ? "HUMAN" : "AI";
}

export function updateLivePnl(battle: Battle, currentPrice: number): Battle {
  return { ...battle, current_price: currentPrice, ...battlePositionPnl(battle, currentPrice) };
}

// Server-authoritative fraction of the battle window elapsed (0..1).
export function battleProgress(battle: Battle): number {
  if (!battle.started_at) return 0;
  const start = new Date(battle.started_at).getTime();
  const expires = battleExpiresAt(battle);
  if (expires === null) return 0;
  const total = expires - start;
  if (total <= 0) return 0;
  const elapsed = Date.now() - start;
  return Math.max(0, Math.min(1, elapsed / total));
}

export function isExpired(battle: Battle): boolean {
  return isBattleExpired(battle);
}
