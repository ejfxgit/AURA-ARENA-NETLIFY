create table if not exists public.custom_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  personality_mood text not null,
  trading_specialty text not null,
  risk_style text not null,
  description text not null,
  avatar_style text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_agents_name_length check (char_length(name) between 2 and 32),
  constraint custom_agents_mood_length check (char_length(personality_mood) between 3 and 80),
  constraint custom_agents_description_length check (char_length(description) between 10 and 240),
  constraint custom_agents_specialty check (trading_specialty in ('MOMENTUM', 'NEWS_SENTIMENT', 'STATISTICAL', 'ONCHAIN', 'LIQUIDITY', 'ANOMALY')),
  constraint custom_agents_risk check (risk_style in ('CONSERVATIVE', 'BALANCED', 'AGGRESSIVE')),
  constraint custom_agents_avatar check (avatar_style is null or avatar_style in ('PULSE', 'ORBIT', 'PRISM', 'MONOLITH'))
);

create index if not exists custom_agents_owner_id_idx on public.custom_agents(owner_id);
create unique index if not exists custom_agents_owner_name_idx on public.custom_agents(owner_id, lower(name));

create or replace function public.set_custom_agents_updated_at()
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

drop trigger if exists custom_agents_set_updated_at on public.custom_agents;
create trigger custom_agents_set_updated_at
before update on public.custom_agents
for each row execute function public.set_custom_agents_updated_at();

alter table public.custom_agents enable row level security;

drop policy if exists "custom_agents_select_own" on public.custom_agents;
create policy "custom_agents_select_own"
on public.custom_agents for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "custom_agents_insert_own" on public.custom_agents;
create policy "custom_agents_insert_own"
on public.custom_agents for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "custom_agents_update_own" on public.custom_agents;
create policy "custom_agents_update_own"
on public.custom_agents for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "custom_agents_delete_own" on public.custom_agents;
create policy "custom_agents_delete_own"
on public.custom_agents for delete
to authenticated
using ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.custom_agents to authenticated;
