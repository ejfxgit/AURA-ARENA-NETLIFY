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
  v_authenticated_wallet text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(coalesce(
    identity_data -> 'custom_claims' ->> 'address',
    identity_data ->> 'address',
    identity_data ->> 'wallet_address'
  ))
  into v_authenticated_wallet
  from auth.identities
  where user_id = v_user_id and provider in ('web3', 'ethereum')
  order by created_at asc
  limit 1;

  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'Invalid wallet address';
  end if;
  if coalesce(v_authenticated_wallet, '') <> v_wallet then
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
