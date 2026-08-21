-- First settlement wins.
--
-- 202608150002_wallet_accounts.sql made settle_wallet_battle idempotent for the
-- MONEY (the row lock plus the settlement_applied check meant an account could
-- never be credited twice), but its already-settled branch still ran
--   update public.user_battles set battle = p_battle
-- so a second request rewrote the stored exit price, P&L, direction and winner
-- while the balance, win/loss counters and reputation stayed with the FIRST
-- settlement. Two browser tabs auto-settling the same battle was enough to
-- publish a result the account had never been credited against.
--
-- This migration makes the stored result canonical from the first settlement on:
--   * the already-settled branch returns the stored battle untouched
--   * settlement_applied is stamped by this function, inside the same
--     transaction that credits the account, so the flag cannot be true without
--     the credit having happened
--   * the function returns { applied, battle } so the caller publishes the
--     canonical stored battle rather than its own draft
--
-- The return type changes from void to jsonb, so the old signature is dropped
-- first. The argument list is unchanged.

drop function if exists public.settle_wallet_battle(jsonb, numeric, text, integer, integer);

create function public.settle_wallet_battle(
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
  v_user_id uuid := auth.uid();
  v_battle_id text := p_battle->>'id';
  v_existing jsonb;
  v_settled jsonb;
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

  -- Already settled: the first settlement is canonical. The stored exit price,
  -- P&L, winner, direction and settlement flag are returned untouched so a
  -- concurrent or retried request cannot rewrite a credited result.
  if coalesce((v_existing->>'settlement_applied')::boolean, false) then
    return jsonb_build_object('applied', false, 'battle', v_existing);
  end if;

  -- The flag is stamped here, not by the caller, so it is written by the same
  -- transaction that credits the account.
  v_settled := jsonb_set(p_battle, '{settlement_applied}', 'true'::jsonb, true);

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
  set battle = v_settled
  where id = v_battle_id and owner_id = v_user_id;

  return jsonb_build_object('applied', true, 'battle', v_settled);
end;
$$;

revoke all on function public.settle_wallet_battle(jsonb, numeric, text, integer, integer) from public;
grant execute on function public.settle_wallet_battle(jsonb, numeric, text, integer, integer) to authenticated;
