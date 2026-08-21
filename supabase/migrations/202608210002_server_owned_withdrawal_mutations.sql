-- Withdrawal writes are server-owned.
--
-- The browser may SELECT its own rows through RLS, but it must never be able to
-- reserve, complete, fail or refund a payout by calling an RPC directly. The
-- Next.js route authenticates the wallet and invokes these functions with the
-- service role, passing the authenticated user id explicitly.

drop function if exists public.request_aura_withdrawal(numeric, text, integer, text);
drop function if exists public.mark_aura_withdrawal_sending(uuid, text, text);
drop function if exists public.complete_aura_withdrawal(uuid, text, text);
drop function if exists public.fail_aura_withdrawal(uuid, text, text);

create function public.request_aura_withdrawal(
  p_user_id uuid,
  p_aura_amount numeric,
  p_destination text,
  p_chain_id integer,
  p_token_address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_destination text := lower(trim(p_destination));
  v_token text := lower(trim(p_token_address));
  v_wallet text;
  v_balance numeric;
  v_usdt numeric;
  v_in_flight uuid;
  v_row public.withdrawals;
begin
  if p_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_aura_amount is null or p_aura_amount <> trunc(p_aura_amount) then raise exception 'AMOUNT_NOT_WHOLE'; end if;
  if p_aura_amount < 1000 then raise exception 'AMOUNT_BELOW_MINIMUM'; end if;
  if v_destination !~ '^0x[0-9a-f]{40}$' then raise exception 'DESTINATION_INVALID'; end if;
  if v_token !~ '^0x[0-9a-f]{40}$' then raise exception 'TOKEN_INVALID'; end if;
  if p_chain_id is null or p_chain_id <= 0 then raise exception 'CHAIN_INVALID'; end if;

  select wallet_address into v_wallet from public.profiles where id = p_user_id;
  if v_wallet is null then raise exception 'PROFILE_REQUIRED'; end if;
  if v_destination <> lower(v_wallet) then raise exception 'DESTINATION_MISMATCH'; end if;

  select current_balance into v_balance
  from public.demo_accounts
  where user_id = p_user_id
  for update;
  if v_balance is null then raise exception 'ACCOUNT_REQUIRED'; end if;

  select id into v_in_flight
  from public.withdrawals
  where user_id = p_user_id and status in ('PENDING', 'SENDING')
  limit 1;
  if v_in_flight is not null then raise exception 'WITHDRAWAL_IN_FLIGHT'; end if;
  if v_balance < p_aura_amount then raise exception 'INSUFFICIENT_AURA'; end if;

  v_usdt := trunc(p_aura_amount / 1000.0, 6);
  update public.demo_accounts
  set current_balance = current_balance - p_aura_amount,
      aura_withdrawn_total = aura_withdrawn_total + p_aura_amount
  where user_id = p_user_id;

  insert into public.withdrawals (
    user_id, aura_amount, usdt_amount, destination_address, chain_id, token_address, status
  ) values (
    p_user_id, p_aura_amount, v_usdt, v_destination, p_chain_id, v_token, 'PENDING'
  ) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create function public.mark_aura_withdrawal_sending(
  p_user_id uuid,
  p_id uuid,
  p_tx_hash text default null,
  p_explorer_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_status text; v_row public.withdrawals;
begin
  select status into v_status from public.withdrawals
  where id = p_id and user_id = p_user_id for update;
  if v_status is null then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if v_status not in ('PENDING', 'SENDING') then raise exception 'WITHDRAWAL_NOT_IN_FLIGHT'; end if;
  if p_tx_hash is not null and p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'TX_HASH_INVALID'; end if;
  update public.withdrawals set status = 'SENDING',
    tx_hash = coalesce(p_tx_hash, tx_hash), explorer_url = coalesce(p_explorer_url, explorer_url),
    sent_at = coalesce(sent_at, now())
  where id = p_id and user_id = p_user_id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create function public.complete_aura_withdrawal(
  p_user_id uuid,
  p_id uuid,
  p_tx_hash text,
  p_explorer_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_existing public.withdrawals; v_row public.withdrawals;
begin
  if p_tx_hash is null or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then raise exception 'TX_HASH_INVALID'; end if;
  select * into v_existing from public.withdrawals
  where id = p_id and user_id = p_user_id for update;
  if v_existing.id is null then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if v_existing.status = 'COMPLETED' then
    if lower(v_existing.tx_hash) <> lower(p_tx_hash) then raise exception 'WITHDRAWAL_ALREADY_COMPLETED'; end if;
    return to_jsonb(v_existing);
  end if;
  if v_existing.status = 'FAILED' then raise exception 'WITHDRAWAL_ALREADY_FAILED'; end if;
  update public.withdrawals set status = 'COMPLETED', tx_hash = p_tx_hash,
    explorer_url = coalesce(p_explorer_url, explorer_url), error = null,
    sent_at = coalesce(sent_at, now()), completed_at = now()
  where id = p_id and user_id = p_user_id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create function public.fail_aura_withdrawal(
  p_user_id uuid,
  p_id uuid,
  p_error text,
  p_tx_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_existing public.withdrawals; v_row public.withdrawals;
begin
  select * into v_existing from public.withdrawals
  where id = p_id and user_id = p_user_id for update;
  if v_existing.id is null then raise exception 'WITHDRAWAL_NOT_FOUND'; end if;
  if v_existing.status = 'COMPLETED' then raise exception 'WITHDRAWAL_ALREADY_COMPLETED'; end if;
  if v_existing.status = 'FAILED' then return to_jsonb(v_existing); end if;
  update public.demo_accounts set
    current_balance = current_balance + v_existing.aura_amount,
    aura_withdrawn_total = greatest(aura_withdrawn_total - v_existing.aura_amount, 0)
  where user_id = p_user_id;
  update public.withdrawals set status = 'FAILED',
    error = left(coalesce(p_error, 'The USDT transfer failed.'), 400),
    tx_hash = coalesce(p_tx_hash, tx_hash), failed_at = now()
  where id = p_id and user_id = p_user_id returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.request_aura_withdrawal(uuid, numeric, text, integer, text) from public, authenticated;
revoke all on function public.mark_aura_withdrawal_sending(uuid, uuid, text, text) from public, authenticated;
revoke all on function public.complete_aura_withdrawal(uuid, uuid, text, text) from public, authenticated;
revoke all on function public.fail_aura_withdrawal(uuid, uuid, text, text) from public, authenticated;
grant execute on function public.request_aura_withdrawal(uuid, numeric, text, integer, text) to service_role;
grant execute on function public.mark_aura_withdrawal_sending(uuid, uuid, text, text) to service_role;
grant execute on function public.complete_aura_withdrawal(uuid, uuid, text, text) to service_role;
grant execute on function public.fail_aura_withdrawal(uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
