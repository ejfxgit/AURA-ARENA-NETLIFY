import type { Battle, Direction } from "../types";

export const SUPPORTED_LEVERAGES = [30, 50, 100, 120] as const;
export type BattleLeverage = (typeof SUPPORTED_LEVERAGES)[number];
export const DEFAULT_LEVERAGE: BattleLeverage = 50;

export function isSupportedLeverage(value: unknown): value is BattleLeverage {
  return SUPPORTED_LEVERAGES.some((leverage) => leverage === value);
}

/** Keep pre-leverage records readable without changing their historical P&L. */
export function normalizeBattleLeverage<T extends { leverage?: number; stake_reserved?: boolean }>(battle: T): T & { leverage: number; stake_reserved: boolean } {
  return {
    ...battle,
    leverage: typeof battle.leverage === "number" && Number.isFinite(battle.leverage) && battle.leverage > 0
      ? battle.leverage
      : 1,
    stake_reserved: battle.stake_reserved === true,
  };
}

/** One authoritative leveraged P&L calculation for live and settled positions. */
export function leveragedPositionPnl(
  direction: Direction,
  stake: number,
  entryPrice: number,
  price: number,
  leverage: number,
): number {
  if (direction === "WAIT" || stake <= 0 || entryPrice <= 0 || !Number.isFinite(price) || leverage <= 0) return 0;
  const priceMove = (price - entryPrice) / entryPrice;
  const signedMove = direction === "LONG" ? priceMove : -priceMove;
  const grossPnl = stake * signedMove * leverage;
  return Number(Math.max(grossPnl, -stake).toFixed(4));
}

export function battlePositionPnl(
  battle: Pick<Battle, "human_direction" | "ai_direction" | "human_amount" | "ai_amount" | "entry_price" | "leverage">,
  price: number,
): { human_pnl: number; ai_pnl: number } {
  return {
    human_pnl: leveragedPositionPnl(battle.human_direction, battle.human_amount, battle.entry_price, price, battle.leverage),
    ai_pnl: leveragedPositionPnl(battle.ai_direction, battle.ai_amount, battle.entry_price, price, battle.leverage),
  };
}
