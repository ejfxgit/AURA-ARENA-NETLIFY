-- ============================================================================
-- agent_decisions — the canonical current decision for each built-in AURA agent
-- ============================================================================
--
-- ONE source of truth for "what does NOVA think right now". The agent cards read
-- it, and battle creation snapshots it into the battle record, so the decision a
-- user sees on the card is provably the decision their battle is settled against.
-- Before this table each surface asked the model again and got a different
-- answer.
--
-- Exactly one row per (agent_id, symbol, horizon_minutes): the unique constraint
-- makes the write an upsert, so "the current decision" is a row rather than a
-- query over history. The horizon is part of the key because a 5-minute call and
-- a 1-minute call are different judgements about different questions — collapsing
-- them would let a battle be settled against a decision made for another horizon.
--   * created_at — when this agent/market/horizon combination was first tracked
--   * updated_at — when the CURRENT decision was produced. This is the value the
--     UI ages ("UPDATED 12s AGO") and the value a TTL is measured against, so it
--     must always be the model's decision time, never a bookkeeping touch.
--
-- Only LONG / SHORT / WAIT can ever be stored. The CHECK makes that a database
-- guarantee rather than a code convention: the normalization in
-- src/lib/ai/decision.ts maps the model's vocabulary onto these three, and a
-- failed or unusable model response must write NOTHING here. There is
-- deliberately no 'UNAVAILABLE' decision value — an absent or stale row is how
-- "no decision" is represented, because a fabricated WAIT would be
-- indistinguishable to the user from an agent that genuinely chose to wait.
--
-- Built-in agents only. Custom agents are private to their owner, so publishing
-- their stance in a world-readable table would leak a user's private strategy;
-- their decisions live in the per-user battle record instead.
--
-- Reuses the existing conventions:
--   * public.set_aura_updated_at() trigger (202608150002_wallet_accounts.sql)
--   * RLS enabled with an explicit read audience and no client write path
--
-- Idempotent: safe to run more than once.
-- ============================================================================


create table if not exists public.agent_decisions (
  id uuid primary key default gen_random_uuid(),
  -- Built-in roster id, e.g. 'nova'. Never 'custom'.
  agent_id text not null,
  -- OKX SPOT instrument id, e.g. 'BTC-USDT'. Uppercase, base-quote.
  symbol text not null,
  decision text not null,
  confidence integer not null,
  horizon_minutes integer not null,
  -- The live price the decision was made from, so a stored decision is always
  -- attributable to a market state rather than floating free of one.
  market_price numeric(24, 8) not null,
  -- The agent's own words. Shown as the agent's reasoning, never invented.
  reasoning text not null,
  -- The full analysis this decision came from: factors, evidence and the news
  -- context the model actually received. Stored so a battle snapshots exactly
  -- what the agent decided from, instead of rebuilding an approximation of it —
  -- that is what makes the card and the battle provably the same decision.
  thesis jsonb not null,
  -- Which model produced it. Internal provenance for debugging; the product
  -- never presents the provider as the decision-maker.
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agent_decisions_agent_id_format
    check (agent_id ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- This table is for the public built-in roster only.
  constraint agent_decisions_not_custom
    check (agent_id <> 'custom'),
  constraint agent_decisions_symbol_format
    check (symbol ~ '^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$'),
  -- The three decisions AURA persists, and nothing else.
  constraint agent_decisions_decision_values
    check (decision in ('LONG', 'SHORT', 'WAIT')),
  constraint agent_decisions_confidence_range
    check (confidence >= 0 and confidence <= 100),
  constraint agent_decisions_horizon_positive
    check (horizon_minutes > 0),
  constraint agent_decisions_market_price_positive
    check (market_price > 0),
  constraint agent_decisions_reasoning_present
    check (length(btrim(reasoning)) > 0),

  constraint agent_decisions_unique_agent_symbol_horizon
    unique (agent_id, symbol, horizon_minutes)
);

comment on table public.agent_decisions is
  'Canonical current decision per built-in agent, market and horizon. One row '
  'per (agent_id, symbol, horizon_minutes), upserted on refresh. updated_at is '
  'the decision time. An absent row means no decision — never a fabricated WAIT.';

comment on column public.agent_decisions.updated_at is
  'When the current decision was produced by the model. The UI ages this value '
  'and the TTL is measured against it.';

create index if not exists agent_decisions_symbol_updated_at_idx
  on public.agent_decisions(symbol, updated_at desc);

-- updated_at is maintained by the database, never supplied by a caller, so the
-- decision time is real server time and cannot be backdated to make a stale
-- decision look fresh. Writes only happen when a model has just produced a
-- valid decision, so the write time IS the decision time.
drop trigger if exists agent_decisions_set_updated_at on public.agent_decisions;
create trigger agent_decisions_set_updated_at
before update on public.agent_decisions
for each row execute function public.set_aura_updated_at();


-- RLS: world-readable, server-written ----------------------------------------
--
-- An agent's published stance is product data, not user data, so both anon and
-- authenticated may read it. There is NO client write policy: decisions are
-- generated server-side after authentication and rate limiting, using the
-- service role, so a client can never insert a decision an agent did not make.

alter table public.agent_decisions enable row level security;

drop policy if exists "agent_decisions_select_all" on public.agent_decisions;
create policy "agent_decisions_select_all" on public.agent_decisions
for select to anon, authenticated using (true);

grant select on public.agent_decisions to anon, authenticated;
-- Writes are service_role only, which bypasses RLS by design.
revoke insert, update, delete on public.agent_decisions from anon, authenticated;


notify pgrst, 'reload schema';
