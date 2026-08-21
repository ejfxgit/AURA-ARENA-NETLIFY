"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_BATTLE_DURATION_SECONDS = exports.BATTLE_DURATIONS_SECONDS = void 0;
exports.battleDurationMinutes = battleDurationMinutes;
exports.battleHorizonLabel = battleHorizonLabel;
exports.isBattleDurationSeconds = isBattleDurationSeconds;
exports.normalizeBattleTiming = normalizeBattleTiming;
exports.expiresAtFor = expiresAtFor;
exports.battleExpiresAt = battleExpiresAt;
exports.isBattleExpired = isBattleExpired;
/** The only battle durations accepted by the server. */
exports.BATTLE_DURATIONS_SECONDS = [60, 180, 300, 600];
exports.DEFAULT_BATTLE_DURATION_SECONDS = 300;
function battleDurationMinutes(durationSeconds) {
    return durationSeconds / 60;
}
function battleHorizonLabel(minutes) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
function isBattleDurationSeconds(value) {
    return exports.BATTLE_DURATIONS_SECONDS.some((duration) => duration === value);
}
/** Normalize records created before duration_seconds was introduced. */
function normalizeBattleTiming(battle) {
    const legacySeconds = typeof battle.duration_minutes === "number" ? battle.duration_minutes * 60 : null;
    const duration = isBattleDurationSeconds(battle.duration_seconds)
        ? battle.duration_seconds
        : isBattleDurationSeconds(legacySeconds)
            ? legacySeconds
            : exports.DEFAULT_BATTLE_DURATION_SECONDS;
    return {
        ...battle,
        duration_seconds: duration,
        expires_at: battle.expires_at ?? (battle.started_at ? expiresAtFor(battle.started_at, duration) : null),
    };
}
/** Calculate the persisted expiration from the persisted start and duration. */
function expiresAtFor(startedAt, durationSeconds) {
    return new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
}
/** Persisted timestamps are authoritative. Legacy battles fall back safely. */
function battleExpiresAt(battle) {
    if (!battle.started_at || !battle.expires_at || !isBattleDurationSeconds(battle.duration_seconds))
        return null;
    const persisted = new Date(battle.expires_at).getTime();
    const expected = new Date(expiresAtFor(battle.started_at, battle.duration_seconds)).getTime();
    return Number.isFinite(persisted) && persisted === expected ? persisted : null;
}
function isBattleExpired(battle, now = Date.now()) {
    const expires = battleExpiresAt(battle);
    return expires !== null && now >= expires;
}
