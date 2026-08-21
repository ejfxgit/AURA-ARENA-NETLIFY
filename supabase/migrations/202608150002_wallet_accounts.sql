create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique,
  display_name text not null,
  settings jsonb not null default '{}'::jsonb,
  reputation_score integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_wallet_address check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint profiles_display_name check (char_length(display_name) between 2 and 40)
);

create table if not exists public.demo_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  starting_balance numeric(18, 4) not null default 1000,
  current_balance numeric(18, 4) not null default 1000,
  realized_pnl numeric(18, 4) not null default 0,
  unrealized_pnl numeric(18, 4) not null default 0,
  total_battles integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  valid_challenges integer not null default 0,
  invalid_challenges integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_battles (
  id text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  battle jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_battles_owner_created_idx
on public.user_battles(owner_id, created_at desc);

create or replace function public.set_aura_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_aura_updated_at();

drop trigger if exists demo_accounts_set_updated_at on public.demo_accounts;
create trigger demo_accounts_set_updated_at
before update on public.demo_accounts
for each row execute function public.set_aura_updated_at();

drop trigger if exists user_battles_set_updated_at on public.user_battles;
create trigger user_battles_set_updated_at
before update on public.user_battles
for each row execute function public.set_aura_updated_at();

alter table public.profiles enable row level security;
alter table public.demo_accounts enable row level security;
alter table public.user_battles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "demo_accounts_select_own" on public.demo_accounts;
create policy "demo_accounts_select_own" on public.demo_accounts
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "demo_accounts_update_own" on public.demo_accounts;
create policy "demo_accounts_update_own" on public.demo_accounts
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "user_battles_select_own" on public.user_battles;
create policy "user_battles_select_own" on public.user_battles
for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "user_battles_insert_own" on public.user_battles;
create policy "user_battles_insert_own" on public.user_battles
for insert to authenticated with check ((select auth.uid()) = owner_id);

drop policy if exists "user_battles_update_own" on public.user_battles;
create policy "user_battles_update_own" on public.user_battles
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "user_battles_delete_own" on public.user_battles;
create policy "user_battles_delete_own" on public.user_battles
for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.create_wallet_account(
  p_wallet_address text,
  p_display_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet text := lower(trim(p_wallet_address));
  v_name text := trim(p_display_name);
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'Invalid wallet address';
  end if;
  if lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'address', auth.jwt() -> 'user_metadata' ->> 'wallet_address', '')) <> v_wallet then
    raise exception 'Wallet address does not match the authenticated wallet';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 40 then
    raise exception 'Invalid display name';
  end if;

  insert into public.profiles (id, wallet_address, display_name)
  values (v_user_id, v_wallet, v_name)
  on conflict (id) do nothing;

  insert into public.demo_accounts (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.create_wallet_account(text, text) from public;
grant execute on function public.create_wallet_account(text, text) to authenticated;

create or replace function public.settle_wallet_battle(
  p_battle jsonb,
  p_human_pnl numeric,
  p_winner text,
  p_valid_challenges integer,
  p_invalid_challenges integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_battle_id text := p_battle->>'id';
  v_existing jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select battle into v_existing
  from public.user_battles
  where id = v_battle_id and owner_id = v_user_id
  for update;

  if v_existing is null then
    raise exception 'Battle not found';
  end if;

  if coalesce((v_existing->>'settlement_applied')::boolean, false) then
    update public.user_battles set battle = p_battle where id = v_battle_id and owner_id = v_user_id;
    return;
  end if;

  update public.demo_accounts
  set
    realized_pnl = realized_pnl + p_human_pnl,
    current_balance = current_balance + p_human_pnl,
    total_battles = total_battles + 1,
    wins = wins + case when p_winner = 'HUMAN' then 1 else 0 end,
    losses = losses + case when p_winner = 'AI' then 1 else 0 end,
    valid_challenges = valid_challenges + p_valid_challenges,
    invalid_challenges = invalid_challenges + p_invalid_challenges
  where user_id = v_user_id;

  update public.profiles
  set reputation_score = round(
    1000
    + (select realized_pnl * 4 from public.demo_accounts where user_id = v_user_id)
    + (select wins * 25 from public.demo_accounts where user_id = v_user_id)
    + (select valid_challenges * 15 from public.demo_accounts where user_id = v_user_id)
  )
  where id = v_user_id;

  update public.user_battles
  set battle = p_battle
  where id = v_battle_id and owner_id = v_user_id;
end;
$$;

revoke all on function public.settle_wallet_battle(jsonb, numeric, text, integer, integer) from public;
grant execute on function public.settle_wallet_battle(jsonb, numeric, text, integer, integer) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.demo_accounts to authenticated;
grant select, insert, update, delete on public.user_battles to authenticated;
