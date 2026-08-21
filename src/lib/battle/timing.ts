import type { Battle } from "../types";

/** The only battle durations accepted by the server. */
export const BATTLE_DURATIONS_SECONDS = [60, 180, 300, 600] as const;
export type BattleDurationSeconds = (typeof BATTLE_DURATIONS_SECONDS)[number];

export const DEFAULT_BATTLE_DURATION_SECONDS: BattleDurationSeconds = 300;

export function battleDurationMinutes(durationSeconds: BattleDurationSeconds): number {
  return durationSeconds / 60;
}

export function battleHorizonLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function isBattleDurationSeconds(value: unknown): value is BattleDurationSeconds {
  return BATTLE_DURATIONS_SECONDS.some((duration) => duration === value);
}

/** Normalize records created before duration_seconds was introduced. */
export function normalizeBattleTiming<T extends {
  duration_seconds?: number;
  duration_minutes?: number;
  started_at: string | null;
  expires_at?: string | null;
}>(battle: T): T & { duration_seconds: BattleDurationSeconds; expires_at: string | null } {
  const legacySeconds = typeof battle.duration_minutes === "number" ? battle.duration_minutes * 60 : null;
  const duration = isBattleDurationSeconds(battle.duration_seconds)
    ? battle.duration_seconds
    : isBattleDurationSeconds(legacySeconds)
      ? legacySeconds
      : DEFAULT_BATTLE_DURATION_SECONDS;
  return {
    ...battle,
    duration_seconds: duration,
    expires_at: battle.expires_at ?? (battle.started_at ? expiresAtFor(battle.started_at, duration) : null),
  };
}

/** Calculate the persisted expiration from the persisted start and duration. */
export function expiresAtFor(startedAt: string, durationSeconds: number): string {
  return new Date(new Date(startedAt).getTime() + durationSeconds * 1000).toISOString();
}

/** Persisted timestamps are authoritative. Legacy battles fall back safely. */
export function battleExpiresAt(battle: Pick<Battle, "expires_at" | "started_at" | "duration_seconds">): number | null {
  if (!battle.started_at || !battle.expires_at || !isBattleDurationSeconds(battle.duration_seconds)) return null;
  const persisted = new Date(battle.expires_at).getTime();
  const expected = new Date(expiresAtFor(battle.started_at, battle.duration_seconds)).getTime();
  return Number.isFinite(persisted) && persisted === expected ? persisted : null;
}

export function isBattleExpired(battle: Pick<Battle, "expires_at" | "started_at" | "duration_seconds">, now = Date.now()): boolean {
  const expires = battleExpiresAt(battle);
  return expires !== null && now >= expires;
}
