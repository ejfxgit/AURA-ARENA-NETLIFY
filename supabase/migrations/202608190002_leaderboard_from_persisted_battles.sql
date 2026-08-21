-- ============================================================================
-- Leaderboard from persisted battles instead of process memory
-- ============================================================================
--
-- /api/leaderboard was built from lib/store.ts, a module-level in-memory Map.
-- That made every ranking disappear on restart and, on serverless, differ per
-- instance: the league a user saw depended on which process answered. Battles
-- were already persisted to public.user_battles and settlement counters to
-- public.demo_accounts, so the durable data existed -- the route just never read
-- it.
--
-- Both functions below are security definer because a league is inherently
-- cross-user and every relevant table is owner-scoped by RLS
-- (user_battles_select_own, demo_accounts_select_own, profiles_select_own). A
-- caller's own token can therefore never see anyone else's row, and aggregating
-- in the API with the caller's client would always return a league of one.
--
-- What they expose is deliberately narrow:
--   * leaderboard_humans returns an ANONYMIZED identity -- 'wallet_' plus the
--     last 8 characters of the uuid, the same shape the previous route emitted
--     (src/components/landing-live.tsx matches on it with endsWith). No wallet
--     address, no display name, no username, no raw uuid.
--   * leaderboard_agents returns only per-agent totals for the six built-in
--     specialists. Private custom agents are excluded, matching the existing
--     rule that they derive performance from their owner's own history.
--
-- Neither function invents a number. An agent or user with no settled battle
-- simply does not appear, and the API reports zeros rather than a sample record.
--
-- Idempotent: safe to run more than once.
-- ============================================================================


-- 1. Only settled battles count toward a league ---------------------------------
--
-- settlement_applied is the flag the finish route sets exactly once, under the
-- row lock taken by settle_wallet_battle, after a real OKX exit price produced a
-- real result. It is the precise marker for "this battle counted".

create index if not exists user_battles_settled_agent_idx
on public.user_battles ((battle->>'agentId'))
where (battle->>'settlement_applied') = 'true';


-- 2. Human league ---------------------------------------------------------------
--
-- Reads the counters settle_wallet_battle maintains transactionally, and the
-- reputation_score it derives, rather than recomputing them from the battle
-- JSONB. Those counters ARE the record of completed battles: nothing else
-- increments them, and they move in the same transaction as the settlement that
-- caused them.
--
-- Rates are intentionally left to the caller so the existing formulas in
-- src/app/api/leaderboard/route.ts remain the single definition.

create or replace function public.leaderboard_humans(p_limit integer default 50)
returns table (
  user_id            text,
  realized_pnl       numeric,
  wins               integer,
  losses             integer,
  valid_challenges   integer,
  invalid_challenges integer,
  reputation_score   integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    'wallet_' || right(account.user_id::text, 8),
    account.realized_pnl,
    account.wins,
    account.losses,
    account.valid_challenges,
    account.invalid_challenges,
    profile.reputation_score
  from public.demo_accounts account
  join public.profiles profile on profile.id = account.user_id
  where account.total_battles > 0 or account.wins > 0 or account.losses > 0
  order by profile.reputation_score desc, account.realized_pnl desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.leaderboard_humans(integer) is
  'Cross-user human league from persisted settlement counters. Identity is '
  'anonymized to wallet_<last 8 of uuid>; no address, name or raw id is exposed.';

revoke all on function public.leaderboard_humans(integer) from public;
grant execute on function public.leaderboard_humans(integer) to anon, authenticated;


-- 3. Built-in agent league ------------------------------------------------------
--
-- Derived by aggregating every owner's settled battles, because no counter table
-- for public agent records has ever existed. Deriving also means the totals
-- cannot drift from the battles that produced them.
--
-- Winner semantics match src/lib/battle/engine.ts computeWinner(): 'AI' is an
-- agent win, 'HUMAN' an agent loss, 'DRAW' neither. Challenge accounting matches
-- the finish route: a challenge counts as valid when its recalculation says so,
-- and every other challenge counts as successfully defended.

create or replace function public.leaderboard_agents()
returns table (
  agent_id            text,
  wins                integer,
  losses              integer,
  realized_pnl        numeric,
  valid_challenges    integer,
  defended_challenges integer
)
language sql
security definer
set search_path = public
stable
as $$
  with settled as (
    select
      record.battle->>'agentId' as agent_id,
      record.battle->>'winner'  as winner,
      coalesce((record.battle->>'ai_pnl')::numeric, 0) as ai_pnl,
      (
        select count(*)
        from jsonb_array_elements(coalesce(record.battle->'challenges', '[]'::jsonb)) as challenge
        where (challenge->'recalculation'->>'materiallyValid')::boolean is true
      ) as valid_challenges,
      (
        select count(*)
        from jsonb_array_elements(coalesce(record.battle->'challenges', '[]'::jsonb)) as challenge
        where (challenge->'recalculation'->>'materiallyValid')::boolean is not true
      ) as defended_challenges
    from public.user_battles record
    where coalesce((record.battle->>'settlement_applied')::boolean, false)
      -- Private custom agents stay out of the public league.
      and coalesce(record.battle->>'agentId', 'custom') <> 'custom'
  )
  select
    settled.agent_id,
    sum(case when settled.winner = 'AI' then 1 else 0 end)::integer,
    sum(case when settled.winner = 'HUMAN' then 1 else 0 end)::integer,
    round(sum(settled.ai_pnl), 4),
    sum(settled.valid_challenges)::integer,
    sum(settled.defended_challenges)::integer
  from settled
  group by settled.agent_id;
$$;

comment on function public.leaderboard_agents() is
  'Public per-agent totals aggregated from every owner''s settled battles. '
  'Built-in specialists only; private custom agents are excluded.';

revoke all on function public.leaderboard_agents() from public;
grant execute on function public.leaderboard_agents() to anon, authenticated;


notify pgrst, 'reload schema';
