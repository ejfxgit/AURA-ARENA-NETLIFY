-- ============================================================================
-- market_watchlist — per-user saved OKX SPOT instruments
-- ============================================================================
--
-- Stores ONLY the instrument id a user chose to follow. It deliberately stores
-- no price, no 24h change and no volume: live quotes always come from the OKX
-- Exchange API at read time, so this table can never become a source of stale
-- or fabricated market data.
--
-- Reuses the existing conventions:
--   * ownership via auth.uid() against public.profiles(id)
--   * RLS policies shaped like user_settings (202608180002_profile_settings.sql)
--
-- Idempotent: safe to run more than once.
-- ============================================================================


create table if not exists public.market_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- OKX SPOT instrument id, e.g. 'BTC-USDT'. Uppercase, base-quote.
  inst_id text not null,
  created_at timestamptz not null default now(),
  constraint market_watchlist_inst_id_format
    check (inst_id ~ '^[A-Z0-9]{1,20}-[A-Z0-9]{1,20}$'),
  constraint market_watchlist_unique_per_user unique (user_id, inst_id)
);

comment on table public.market_watchlist is
  'User-selected OKX SPOT instruments. Ids only — live prices are never stored here.';

create index if not exists market_watchlist_user_id_idx
  on public.market_watchlist(user_id);


-- RLS: a user may only ever see or change their own rows ----------------------

alter table public.market_watchlist enable row level security;

drop policy if exists "market_watchlist_select_own" on public.market_watchlist;
create policy "market_watchlist_select_own" on public.market_watchlist
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "market_watchlist_insert_own" on public.market_watchlist;
create policy "market_watchlist_insert_own" on public.market_watchlist
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "market_watchlist_delete_own" on public.market_watchlist;
create policy "market_watchlist_delete_own" on public.market_watchlist
for delete to authenticated using ((select auth.uid()) = user_id);

-- No update policy: a watchlist entry is added or removed, never edited.

grant select, insert, delete on public.market_watchlist to authenticated;


notify pgrst, 'reload schema';
