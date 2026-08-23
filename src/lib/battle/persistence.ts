import type { SupabaseClient } from "@supabase/supabase-js";
import type { Battle } from "../types";
import { saveBattle } from "../store";
import { loadBattle } from "../supabase/aura";
import { normalizeBattleLeverage } from "./leverage";

// Supabase is the source of truth for every mutating battle route.
//
// The in-memory store (lib/store.ts) is a module-global Map, so with more than
// one server instance it holds per-worker copies that drift apart. Reading it
// first meant a worker could settle from a pre-challenge object and then write
// that stale object back over newer persisted state, dropping the challenge log
// and the post-challenge decision.
//
// Every mutating route therefore loads the persisted row first and treats the
// store purely as a cache: it is refreshed FROM the database and never preferred
// OVER it. A read failure surfaces as an error rather than silently falling back
// to a cached object, because a stale copy is exactly what must not become
// authoritative.

/**
 * Loads the persisted battle for `userId` and refreshes the in-memory cache.
 *
 * Ownership is enforced by the query (`owner_id = userId`), so a battle owned by
 * another account resolves to null rather than to a cached object.
 *
 * @throws when Supabase cannot be read. Callers must not fall back to the cache.
 */
export async function loadAuthoritativeBattle(
  supabase: SupabaseClient,
  userId: string,
  battleId: string,
): Promise<Battle | null> {
  const persisted = await loadBattle(supabase, userId, battleId);
  if (!persisted) return null;

  // Never let a mismatched response populate the process-local cache. This
  // helper is used by mutating routes where the database row is authoritative.
  if (persisted.id !== battleId) return null;

  // Cache refresh only. Nothing downstream reads this back as state.
  const normalized = normalizeBattleLeverage(persisted);
  saveBattle(normalized);
  return normalized;
}
