-- ============================================================================
-- Profile identity fields + user_settings workspace preferences
-- ============================================================================
--
-- Extends public.profiles with the editable identity fields the profile editor
-- needs, and adds public.user_settings for workspace preferences. Both are
-- owned by the authenticated auth.uid() and protected by RLS.
--
-- Reuses the existing conventions:
--   * public.set_aura_updated_at() trigger (202608150002_wallet_accounts.sql)
--   * avatar styles match CUSTOM_AGENT_AVATAR_STYLES in src/lib/custom-agents.ts
--   * strategy / behavior values match the Zod enums in src/lib/custom-agents.ts
--
-- Idempotent: safe to run more than once.
-- ============================================================================


-- 1. profiles: editable identity fields ---------------------------------------

alter table public.profiles
  add column if not exists username     text,
  add column if not exists bio          text not null default '',
  add column if not exists avatar_style text,
  add column if not exists timezone     text not null default 'UTC',
  add column if not exists language     text not null default 'en';

-- Converge columns that may already exist without the declared default/NOT NULL.
update public.profiles set bio      = ''    where bio      is null;
update public.profiles set timezone = 'UTC' where timezone is null;
update public.profiles set language = 'en'  where language is null;

alter table public.profiles
  alter column bio      set default '',
  alter column timezone set default 'UTC',
  alter column language set default 'en';

alter table public.profiles
  alter column bio      set not null,
  alter column timezone set not null,
  alter column language set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format,
  drop constraint if exists profiles_bio_length,
  drop constraint if exists profiles_avatar_style,
  drop constraint if exists profiles_timezone_length,
  drop constraint if exists profiles_language_format;

alter table public.profiles
  add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  add constraint profiles_bio_length check (char_length(bio) <= 240),
  add constraint profiles_avatar_style check (avatar_style is null or avatar_style in ('PULSE', 'ORBIT', 'PRISM', 'MONOLITH')),
  add constraint profiles_timezone_length check (char_length(timezone) between 1 and 64),
  add constraint profiles_language_format check (language ~ '^[a-z]{2}(-[A-Z]{2})?$');

-- Usernames are stored lower-cased by the API, so a plain unique index is
-- already case-insensitive. Partial: NULL usernames stay unconstrained.
create unique index if not exists profiles_username_key
on public.profiles (username) where username is not null;


-- 2. user_settings: workspace preferences -------------------------------------

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  trading_mode          text    not null default 'DEMO',
  risk_preference       text    not null default 'BALANCED',
  default_strategy      text    not null default 'MOMENTUM',
  decision_behavior     text    not null default 'TRADE_SELECTIVELY',
  notify_battle_results boolean not null default true,
  notify_battle_started boolean not null default true,
  notify_agent_events   boolean not null default true,
  notify_pnl            boolean not null default true,
  notify_system         boolean not null default true,
  timezone              text    not null default 'UTC',
  language              text    not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_trading_mode check (trading_mode in ('DEMO', 'REAL')),
  constraint user_settings_risk check (risk_preference in ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE')),
  constraint user_settings_strategy check (default_strategy in (
    'MOMENTUM', 'NEWS_SENTIMENT', 'STATISTICAL', 'ONCHAIN', 'LIQUIDITY', 'ANOMALY'
  )),
  constraint user_settings_behavior check (decision_behavior in (
    'HIGH_CONFIDENCE', 'TRADE_FREQUENTLY', 'TRADE_SELECTIVELY', 'WAIT_CONFIRMATION', 'REACT_QUICKLY'
  )),
  constraint user_settings_timezone_length check (char_length(timezone) between 1 and 64),
  constraint user_settings_language_format check (language ~ '^[a-z]{2}(-[A-Z]{2})?$')
);

create index if not exists user_settings_user_id_idx on public.user_settings(user_id);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_aura_updated_at();


-- 3. RLS: a user may only ever touch their own settings row -------------------

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own" on public.user_settings
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own" on public.user_settings
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "user_settings_delete_own" on public.user_settings;
create policy "user_settings_delete_own" on public.user_settings
for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.user_settings to authenticated;


-- 4. Demo balance reset, scoped to the caller ---------------------------------
--
-- security definer so it can write demo_accounts, but it derives the target row
-- from auth.uid() only: it is not possible to reset another user's balance.
-- Resets virtual capital and P&L; the competitive record (battles/wins/losses)
-- and battle history are intentionally preserved.

create or replace function public.reset_demo_balance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.demo_accounts
  set current_balance = starting_balance,
      realized_pnl = 0,
      unrealized_pnl = 0
  where user_id = v_user_id;

  if not found then
    raise exception 'Demo account not found';
  end if;
end;
$$;

revoke all on function public.reset_demo_balance() from public;
grant execute on function public.reset_demo_balance() to authenticated;


-- 5. Backfill a settings row for existing accounts ----------------------------

insert into public.user_settings (user_id)
select id from public.profiles
on conflict (user_id) do nothing;


notify pgrst, 'reload schema';
