-- AURA rewards -> X Layer Testnet USDT redemption.
--
-- The demo economy is denominated in AURA. `demo_accounts.current_balance` IS
-- the persisted AURA balance: it starts at the 1,000 AURA grant and is credited
-- or debited by public.settle_wallet_battle on every battle settlement, so
-- battle rewards already feed it and no second balance is introduced here.
--
-- This migration adds the redemption side of that economy:
--   * public.withdrawals  — the durable record of every redemption attempt
--   * request_aura_withdrawal  — reserves (debits) AURA and opens a PENDING row
--   * mark_aura_withdrawal_sending / record tx hash
--   * complete_aura_withdrawal  — COMPLETED with the real transaction hash
--   * fail_aura_withdrawal      — FAILED and restores the reserved AURA
--
-- Money rules enforced HERE rather than in the route, so they hold even if a
-- caller misbehaves:
--   1. ownership comes from auth.uid(); the user id is never an argument
--   2. the destination must equal the profile's verified wallet address
--   3. the AURA is debited inside the same transaction that opens the row, under
--      a row lock, so a balance can never be spent twice
--   4. at most one PENDING/SENDING withdrawal per account (partial unique index
--      plus an explicit check), so a double-submit cannot pay out twice
--   5. a refund is only ever applied to a row that is still PENDING/SENDING, so
--      a retried failure cannot credit the same AURA twice
--
-- The USDT transfer itself is signed server-side outside the database. The
-- treasury key is never stored in, or reachable from, Postgres or the browser.

-- 1. Lifetime redemption counter -------------------------------------------

alter table public.demo_accounts
  add column if not exists aura_withdrawn_total numeric(18, 4) not null default 0;

comment on column public.demo_accounts.aura_withdrawn_total is
  'Lifetime AURA redeemed for X Layer Testnet USDT. Only decreases when a failed payout is refunded.';


-- 2. Withdrawal records ----------------------------------------------------

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- AURA debited from demo_accounts.current_balance for this redemption.
  aura_amount numeric(18, 4) not null,
  -- USDT (testnet) the treasury was asked to send: aura_amount / 1000.
  usdt_amount numeric(18, 6) not null,
  destination_address text not null,
  chain_id integer not null,
  token_address text not null,
  status text not null default 'PENDING',
  tx_hash text,
  explorer_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  constraint withdrawals_aura_minimum check (aura_amount >= 1000),
  constraint withdrawals_usdt_positive check (usdt_amount > 0),
  constraint withdrawals_destination_format check (destination_address ~ '^0x[0-9a-f]{40}$'),
  constraint withdrawals_token_format check (token_address ~ '^0x[0-9a-f]{40}$'),
  constraint withdrawals_status_values check (status in ('PENDING', 'SENDING', 'COMPLETED', 'FAILED')),
  -- A completed redemption must carry the real transaction hash. There is no
  -- state in which this table can claim success without one.
  constraint withdrawals_completed_needs_tx check (status <> 'COMPLETED' or tx_hash is not null)
);

create index if not exists withdrawals_user_created_idx
on public.withdrawals(user_id, created_at desc);

-- One in-flight redemption per account. This is the database-level guarantee
-- behind "prevent duplicate/concurrent withdrawals".
create unique index if not exists withdrawals_one_in_flight_per_user
on public.withdrawals(user_id)
where status in ('PENDING', 'SENDING');

-- A broadcast transaction can only ever be recorded against one withdrawal, so
-- the same payout cannot be replayed into a second completed record.
create unique index if not exists withdrawals_tx_hash_key
on public.withdrawals(tx_hash)
where tx_hash is not null;

drop trigger if exists withdrawals_set_updated_at on public.withdrawals;
create trigger withdrawals_set_updated_at
before update on public.withdrawals
for each row execute function public.set_aura_updated_at();

alter table public.withdrawals enable row level security;

-- Read-only for the owner. Every write goes through the security-definer
-- functions below, so a browser token cannot invent, edit or delete a record.
drop policy if exists "withdrawals_select_own" on public.withdrawals;
create policy "withdrawals_select_own" on public.withdrawals
for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.withdrawals to authenticated;


-- 3. Reserve AURA and open the record -------------------------------------

create or replace function public.request_aura_withdrawal(
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
  v_user_id uuid := auth.uid();
  v_destination text := lower(trim(p_destination));
  v_token text := lower(trim(p_token_address));
  v_wallet text;
  v_balance numeric;
  v_usdt numeric;
  v_in_flight uuid;
  v_row public.withdrawals;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_aura_amount is null or p_aura_amount <> trunc(p_aura_amount) then
    raise exception 'AMOUNT_NOT_WHOLE';
  end if;
  if p_aura_amount < 1000 then
    raise exception 'AMOUNT_BELOW_MINIMUM';
  end if;
  if v_destination !~ '^0x[0-9a-f]{40}$' then
    raise exception 'DESTINATION_INVALID';
  end if;
  if v_token !~ '^0x[0-9a-f]{40}$' then
    raise exception 'TOKEN_INVALID';
  end if;
  if p_chain_id is null or p_chain_id <= 0 then
    raise exception 'CHAIN_INVALID';
  end if;

  -- The destination is the wallet this account was created from and verified
  -- against, read from the server side. A request can never redirect a payout.
  select wallet_address into v_wallet from public.profiles where id = v_user_id;
  if v_wallet is null then
    raise exception 'PROFILE_REQUIRED';
  end if;
  if v_destination <> lower(v_wallet) then
    raise exception 'DESTINATION_MISMATCH';
  end if;

  -- Row lock first: balance check and debit have to be one indivisible step or
  -- two concurrent requests could both pass the check.
  select current_balance into v_balance
  from public.demo_accounts
  where user_id = v_user_id
  for update;
  if v_balance is null then
    raise exception 'ACCOUNT_REQUIRED';
  end if;

  select id into v_in_flight
  from public.withdrawals
  where user_id = v_user_id and status in ('PENDING', 'SENDING')
  limit 1;
  if v_in_flight is not null then
    raise exception 'WITHDRAWAL_IN_FLIGHT';
  end if;

  if v_balance < p_aura_amount then
    raise exception 'INSUFFICIENT_AURA';
  end if;

  -- Truncated, never rounded up: the payout can never exceed the AURA debited.
  v_usdt := trunc(p_aura_amount / 1000.0, 6);
  if v_usdt <= 0 then
    raise exception 'AMOUNT_BELOW_MINIMUM';
  end if;

  update public.demo_accounts
  set current_balance = current_balance - p_aura_amount,
      aura_withdrawn_total = aura_withdrawn_total + p_aura_amount
  where user_id = v_user_id;

  insert into public.withdrawals (
    user_id, aura_amount, usdt_amount, destination_address, chain_id, token_address, status
  )
  values (
    v_user_id, p_aura_amount, v_usdt, v_destination, p_chain_id, v_token, 'PENDING'
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.request_aura_withdrawal(numeric, text, integer, text) from public;
grant execute on function public.request_aura_withdrawal(numeric, text, integer, text) to authenticated;


-- 4. Mark as sending / record the broadcast hash ---------------------------

create or replace function public.mark_aura_withdrawal_sending(
  p_id uuid,
  p_tx_hash text default null,
  p_explorer_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
  v_row public.withdrawals;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select status into v_status
  from public.withdrawals
  where id = p_id and user_id = v_user_id
  for update;
  if v_status is null then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;
  if v_status not in ('PENDING', 'SENDING') then
    raise exception 'WITHDRAWAL_NOT_IN_FLIGHT';
  end if;
  if p_tx_hash is not null and p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'TX_HASH_INVALID';
  end if;

  update public.withdrawals
  set status = 'SENDING',
      tx_hash = coalesce(p_tx_hash, tx_hash),
      explorer_url = coalesce(p_explorer_url, explorer_url),
      sent_at = coalesce(sent_at, now())
  where id = p_id and user_id = v_user_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.mark_aura_withdrawal_sending(uuid, text, text) from public;
grant execute on function public.mark_aura_withdrawal_sending(uuid, text, text) to authenticated;


-- 5. Complete with the real transaction hash ------------------------------

create or replace function public.complete_aura_withdrawal(
  p_id uuid,
  p_tx_hash text,
  p_explorer_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.withdrawals;
  v_row public.withdrawals;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_tx_hash is null or p_tx_hash !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'TX_HASH_INVALID';
  end if;

  select * into v_existing
  from public.withdrawals
  where id = p_id and user_id = v_user_id
  for update;
  if v_existing.id is null then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;

  -- Idempotent for the same transaction: a retried confirmation returns the
  -- stored record instead of writing a second completion.
  if v_existing.status = 'COMPLETED' then
    if lower(v_existing.tx_hash) <> lower(p_tx_hash) then
      raise exception 'WITHDRAWAL_ALREADY_COMPLETED';
    end if;
    return to_jsonb(v_existing);
  end if;
  if v_existing.status = 'FAILED' then
    raise exception 'WITHDRAWAL_ALREADY_FAILED';
  end if;

  update public.withdrawals
  set status = 'COMPLETED',
      tx_hash = p_tx_hash,
      explorer_url = coalesce(p_explorer_url, explorer_url),
      error = null,
      sent_at = coalesce(sent_at, now()),
      completed_at = now()
  where id = p_id and user_id = v_user_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.complete_aura_withdrawal(uuid, text, text) from public;
grant execute on function public.complete_aura_withdrawal(uuid, text, text) to authenticated;


-- 6. Fail and restore the reserved AURA -----------------------------------

create or replace function public.fail_aura_withdrawal(
  p_id uuid,
  p_error text,
  p_tx_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.withdrawals;
  v_row public.withdrawals;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_existing
  from public.withdrawals
  where id = p_id and user_id = v_user_id
  for update;
  if v_existing.id is null then
    raise exception 'WITHDRAWAL_NOT_FOUND';
  end if;
  if v_existing.status = 'COMPLETED' then
    raise exception 'WITHDRAWAL_ALREADY_COMPLETED';
  end if;

  -- Already refunded once. Returning the stored row keeps a retry harmless
  -- rather than crediting the same AURA a second time.
  if v_existing.status = 'FAILED' then
    return to_jsonb(v_existing);
  end if;

  update public.demo_accounts
  set current_balance = current_balance + v_existing.aura_amount,
      aura_withdrawn_total = greatest(aura_withdrawn_total - v_existing.aura_amount, 0)
  where user_id = v_user_id;

  update public.withdrawals
  set status = 'FAILED',
      error = left(coalesce(p_error, 'The USDT transfer failed.'), 400),
      tx_hash = coalesce(p_tx_hash, tx_hash),
      failed_at = now()
  where id = p_id and user_id = v_user_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.fail_aura_withdrawal(uuid, text, text) from public;
grant execute on function public.fail_aura_withdrawal(uuid, text, text) to authenticated;


-- 7. Reset must not re-grant redeemed AURA --------------------------------
--
-- reset_demo_balance (202608180002) restored the full starting grant. Once AURA
-- can be redeemed for testnet USDT, that made the reset button an unlimited
-- faucet: redeem 1,000 AURA, reset, redeem again. The restored grant is now
-- reduced by whatever has already been redeemed, so a reset can return trading
-- capital but can never re-create value that was already paid out.

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
  set current_balance = greatest(starting_balance - aura_withdrawn_total, 0),
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

notify pgrst, 'reload schema';
