-- Leveraged battles: atomic stake reservation and first-settlement-wins release.

-- Make older JSONB battle records compatible with the new canonical fields.
update public.user_battles
set battle = battle
  || jsonb_build_object(
    'leverage', coalesce((battle->>'leverage')::numeric, 1),
    'stake_reserved', coalesce((battle->>'stake_reserved')::boolean, false),
    'duration_seconds', coalesce(
      (battle->>'duration_seconds')::integer,
      ((battle->>'duration_minutes')::integer * 60),
      300
    ),
    'expires_at', coalesce(
      battle->>'expires_at',
      case
        when battle->>'started_at' is not null then
          to_char(
            ((battle->>'started_at')::timestamptz
              + make_interval(secs => coalesce(
                (battle->>'duration_seconds')::integer,
                ((battle->>'duration_minutes')::integer * 60),
                300
              ))),
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        else null
      end
    )
  );

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

  if v_existing->>'status' <> 'WAITING' then
    return jsonb_build_object('applied', false, 'battle', v_existing, 'account', to_jsonb(v_account));
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

  v_stake := (v_existing->>'human_amount')::numeric;
  if v_stake < 0 or v_account.current_balance < v_stake then
    raise exception 'Insufficient AURA balance';
  end if;

  v_started := jsonb_set(p_battle, '{stake_reserved}', 'true'::jsonb, true);

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

revoke all on function public.start_wallet_battle(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_wallet_battle(uuid, jsonb) to service_role;

drop function if exists public.settle_wallet_battle(jsonb, numeric, text, integer, integer);

create function public.settle_wallet_battle(
  p_user_id uuid,
  p_battle jsonb,
  p_human_pnl numeric,
  p_winner text,
  p_valid_challenges integer,
  p_invalid_challenges integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_battle_id text := p_battle->>'id';
  v_existing jsonb;
  v_settled jsonb;
  v_stake numeric;
  v_release numeric;
begin
  select battle into v_existing
  from public.user_battles
  where id = v_battle_id and owner_id = p_user_id
  for update;

  if v_existing is null then raise exception 'Battle not found'; end if;
  if coalesce((v_existing->>'settlement_applied')::boolean, false) then
    return jsonb_build_object('applied', false, 'battle', v_existing);
  end if;

  if p_battle->>'human_direction' <> v_existing->>'human_direction'
    or p_battle->>'ai_direction' <> v_existing->>'ai_direction'
    or p_battle->>'human_amount' <> v_existing->>'human_amount'
    or p_battle->>'ai_amount' <> v_existing->>'ai_amount'
    or p_battle->>'leverage' <> v_existing->>'leverage'
    or p_battle->>'entry_price' <> v_existing->>'entry_price'
    or p_battle->>'started_at' <> v_existing->>'started_at'
    or p_battle->>'expires_at' <> v_existing->>'expires_at'
  then
    raise exception 'Canonical battle parameters do not match';
  end if;

  v_stake := (v_existing->>'human_amount')::numeric;
  if p_human_pnl <> (p_battle->>'human_pnl')::numeric or p_human_pnl < -v_stake then
    raise exception 'Invalid battle P&L';
  end if;

  v_release := case when coalesce((v_existing->>'stake_reserved')::boolean, false) then v_stake else 0 end;
  v_settled := jsonb_set(p_battle, '{settlement_applied}', 'true'::jsonb, true);

  update public.demo_accounts
  set
    realized_pnl = realized_pnl + p_human_pnl,
    current_balance = greatest(current_balance + v_release + p_human_pnl, 0),
    total_battles = total_battles + 1,
    wins = wins + case when p_winner = 'HUMAN' then 1 else 0 end,
    losses = losses + case when p_winner = 'AI' then 1 else 0 end,
    valid_challenges = valid_challenges + p_valid_challenges,
    invalid_challenges = invalid_challenges + p_invalid_challenges
  where user_id = p_user_id;

  update public.profiles
  set reputation_score = round(
    1000
    + (select realized_pnl * 4 from public.demo_accounts where user_id = p_user_id)
    + (select wins * 25 from public.demo_accounts where user_id = p_user_id)
    + (select valid_challenges * 15 from public.demo_accounts where user_id = p_user_id)
  )
  where id = p_user_id;

  update public.user_battles set battle = v_settled
  where id = v_battle_id and owner_id = p_user_id;

  return jsonb_build_object('applied', true, 'battle', v_settled);
end;
$$;

revoke all on function public.settle_wallet_battle(uuid, jsonb, numeric, text, integer, integer) from public, anon, authenticated;
grant execute on function public.settle_wallet_battle(uuid, jsonb, numeric, text, integer, integer) to service_role;

notify pgrst, 'reload schema';

-- Do not reset an account while a reserved stake is active.
create or replace function public.reset_demo_balance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.user_battles
    where owner_id = v_user_id
      and coalesce((battle->>'stake_reserved')::boolean, false)
      and coalesce(battle->>'settlement_applied', 'false') <> 'true'
  ) then
    raise exception 'Cannot reset AURA while a battle stake is reserved';
  end if;
  update public.demo_accounts
  set current_balance = starting_balance,
      realized_pnl = 0,
      unrealized_pnl = 0
  where user_id = v_user_id;
  if not found then raise exception 'Demo account not found'; end if;
end;
$$;

revoke all on function public.reset_demo_balance() from public;
grant execute on function public.reset_demo_balance() to authenticated;
notify pgrst, 'reload schema';
