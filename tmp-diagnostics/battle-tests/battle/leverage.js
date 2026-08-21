"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LEVERAGE = exports.SUPPORTED_LEVERAGES = void 0;
exports.isSupportedLeverage = isSupportedLeverage;
exports.normalizeBattleLeverage = normalizeBattleLeverage;
exports.leveragedPositionPnl = leveragedPositionPnl;
exports.battlePositionPnl = battlePositionPnl;
exports.SUPPORTED_LEVERAGES = [30, 50, 100, 120];
exports.DEFAULT_LEVERAGE = 50;
function isSupportedLeverage(value) {
    return exports.SUPPORTED_LEVERAGES.some((leverage) => leverage === value);
}
/** Keep pre-leverage records readable without changing their historical P&L. */
function normalizeBattleLeverage(battle) {
    return {
        ...battle,
        leverage: typeof battle.leverage === "number" && Number.isFinite(battle.leverage) && battle.leverage > 0
            ? battle.leverage
            : 1,
        stake_reserved: battle.stake_reserved === true,
    };
}
/** One authoritative leveraged P&L calculation for live and settled positions. */
function leveragedPositionPnl(direction, stake, entryPrice, price, leverage) {
    if (direction === "WAIT" || stake <= 0 || entryPrice <= 0 || !Number.isFinite(price) || leverage <= 0)
        return 0;
    const priceMove = (price - entryPrice) / entryPrice;
    const signedMove = direction === "LONG" ? priceMove : -priceMove;
    const grossPnl = stake * signedMove * leverage;
    return Number(Math.max(grossPnl, -stake).toFixed(4));
}
function battlePositionPnl(battle, price) {
    return {
        human_pnl: leveragedPositionPnl(battle.human_direction, battle.human_amount, battle.entry_price, price, battle.leverage),
        ai_pnl: leveragedPositionPnl(battle.ai_direction, battle.ai_amount, battle.entry_price, price, battle.leverage),
    };
}
