-- Enforce one canonical, monotonic battle lifecycle at the database boundary.
-- This protects production from stale serverless workers or browser requests
-- writing an older JSONB battle (for example WAITING) over a row that has
-- already been persisted as ACTIVE.

create or replace function public.battle_lifecycle_rank(p_status text)
returns integer
language sql
immutable
strict
as $$
  select case p_status
    when 'WAITING' then 0
    when 'STARTING' then 1
    when 'ACTIVE' then 2
    when 'FINISHED' then 3
    when 'SETTLING' then 4
    when 'VERIFIED' then 5
    else -1
  end
$$;

create or replace function public.prevent_user_battle_lifecycle_regression()
returns trigger
language plpgsql
as $$
declare
  v_old_rank integer := public.battle_lifecycle_rank(old.battle->>'status');
  v_new_rank integer := public.battle_lifecycle_rank(new.battle->>'status');
begin
  if v_new_rank < v_old_rank then
    raise exception 'Battle lifecycle regression from % to % is not allowed', old.battle->>'status', new.battle->>'status'
      using errcode = '23514';
  end if;

  if old.battle->>'started_at' is not null and new.battle->>'started_at' is distinct from old.battle->>'started_at' then
    raise exception 'Battle started_at is immutable after start'
      using errcode = '23514';
  end if;

  if old.battle->>'expires_at' is not null and new.battle->>'expires_at' is distinct from old.battle->>'expires_at' then
    raise exception 'Battle expires_at is immutable after start'
      using errcode = '23514';
  end if;

  if coalesce((old.battle->>'stake_reserved')::boolean, false)
    and not coalesce((new.battle->>'stake_reserved')::boolean, false) then
    raise exception 'Battle stake_reserved cannot be cleared'
      using errcode = '23514';
  end if;

  if coalesce((old.battle->>'settlement_applied')::boolean, false)
    and not coalesce((new.battle->>'settlement_applied')::boolean, false) then
    raise exception 'Battle settlement_applied cannot be cleared'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists user_battles_prevent_lifecycle_regression on public.user_battles;
create trigger user_battles_prevent_lifecycle_regression
before update of battle on public.user_battles
for each row
execute function public.prevent_user_battle_lifecycle_regression();

-- Rebuild start_wallet_battle so the persisted row remains canonical. The
-- caller supplies only the start quote/timestamps; fields that can change while
-- start is waiting on market data (such as challenges) are preserved from the
-- locked row instead of overwritten by the caller's stale copy.
create or replace function public.start_wallet_battle(p_user_id uuid, p_battle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle_id text := p_battle->>'id';
  v_existing jsonb;
  v_started jsonb;
  v_account public.demo_accounts%rowtype;
  v_stake numeric;
begin
  select battle into v_existing
  from public.user_battles
  where id = v_battle_id and owner_id = p_user_id
  for update;

  if v_existing is null then raise exception 'Battle not found'; end if;

  select * into v_account
  from public.demo_accounts
  where user_id = p_user_id
  for update;

  if v_account.user_id is null then raise exception 'AURA account not found'; end if;

  if public.battle_lifecycle_rank(v_existing->>'status') >= public.battle_lifecycle_rank('ACTIVE') then
    return jsonb_build_object('applied', false, 'battle', v_existing, 'account', to_jsonb(v_account));
  end if;

  if v_existing->>'status' <> 'WAITING' then
    raise exception 'Battle cannot be started from %', v_existing->>'status';
  end if;

  if p_battle->>'human_direction' <> v_existing->>'human_direction'
    or p_battle->>'ai_direction' <> v_existing->>'ai_direction'
    or p_battle->>'human_amount' <> v_existing->>'human_amount'
    or p_battle->>'ai_amount' <> v_existing->>'ai_amount'
    or p_battle->>'leverage' <> v_existing->>'leverage'
    or p_battle->>'duration_seconds' <> v_existing->>'duration_seconds'
  then
    raise exception 'Battle parameters changed after creation';
  end if;

  if p_battle->>'entry_price' is null or p_battle->>'started_at' is null or p_battle->>'expires_at' is null then
    raise exception 'Battle start requires entry_price, started_at and expires_at';
  end if;

  v_stake := (v_existing->>'human_amount')::numeric;
  if v_stake < 0 or v_account.current_balance < v_stake then
    raise exception 'Insufficient AURA balance';
  end if;

  v_started := v_existing
    || jsonb_build_object(
      'status', 'ACTIVE',
      'entry_price', (p_battle->>'entry_price')::numeric,
      'current_price', (p_battle->>'entry_price')::numeric,
      'started_at', p_battle->>'started_at',
      'expires_at', p_battle->>'expires_at',
      'stake_reserved', true,
      'settlement_applied', false
    );

  update public.demo_accounts
  set current_balance = current_balance - v_stake
  where user_id = p_user_id
  returning * into v_account;

  update public.user_battles
  set battle = v_started
  where id = v_battle_id and owner_id = p_user_id;

  return jsonb_build_object('applied', true, 'battle', v_started, 'account', to_jsonb(v_account));
end;
$$;

revoke all on function public.battle_lifecycle_rank(text) from public, anon, authenticated;
revoke all on function public.prevent_user_battle_lifecycle_regression() from public, anon, authenticated;
revoke all on function public.start_wallet_battle(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_wallet_battle(uuid, jsonb) to service_role;
