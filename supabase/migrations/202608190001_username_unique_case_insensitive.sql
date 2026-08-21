-- ============================================================================
-- Usernames: one canonical form, globally unique, enforced by the database
-- ============================================================================
--
-- 202608180002_profile_settings.sql made usernames unique with a plain index on
-- (username) and relied on the API lower-casing every value first. That holds
-- only for as long as every writer remembers to normalize, so this migration
-- moves both halves of the guarantee into the database. The rules below apply
-- uniformly to every row in public.profiles; no name is treated specially.
--
--   * normalize_username() defines the canonical form -- trim, drop a leading
--     @, lower-case, blank becomes NULL -- and a BEFORE trigger applies it to
--     every insert and update, so the API, the SQL console and any service-role
--     script all store the same thing.
--   * profiles_username_lower_key is unique on lower(username), so no two
--     profiles can hold names that differ only by case, even if a writer skips
--     the normalization. This is what makes the guarantee authoritative rather
--     than advisory, and what turns a lost race into a plain 23505 for the API
--     instead of a duplicate.
--   * is_username_available() lets the profile editor probe any name. The
--     profiles_select_own policy hides other users' rows, so a normal query can
--     never see that a name is taken; this function checks every profile but
--     returns only a boolean, and ignores the caller's own row so a user editing
--     their profile keeps the username they already own.
--
-- Existing usernames are left exactly as they are: profiles_username_format has
-- restricted the column to ^[a-z0-9_]{3,20}$ since it was added, so every stored
-- value is already canonical and lower(username) = username for every row. No
-- row is rewritten by this migration.
--
-- Idempotent: safe to run more than once.
-- ============================================================================


-- 1. The canonical form, defined once -----------------------------------------

create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(ltrim(btrim(coalesce(p_username, '')), '@'))), '');
$$;

comment on function public.normalize_username(text) is
  'Canonical username form: trim, strip leading @, lower-case, blank -> NULL. '
  'Mirrored by normalizeUsername() in src/lib/account.ts.';

create or replace function public.apply_username_normalization()
returns trigger
language plpgsql
as $$
begin
  new.username := public.normalize_username(new.username);
  return new;
end;
$$;

drop trigger if exists profiles_normalize_username on public.profiles;
create trigger profiles_normalize_username
before insert or update on public.profiles
for each row execute function public.apply_username_normalization();


-- 2. Case-insensitive uniqueness, for every username --------------------------

-- Report any pre-existing collision by name instead of failing with a bare
-- index error. Cannot trigger on a database that already has
-- profiles_username_format, but a partially migrated one could hold two rows
-- that differ only by case.
do $$
declare
  v_conflicts text;
begin
  select string_agg(handle, ', ' order by handle)
  into v_conflicts
  from (
    select public.normalize_username(username) as handle
    from public.profiles
    where username is not null
    group by public.normalize_username(username)
    having count(*) > 1
  ) collisions;

  if v_conflicts is not null then
    raise exception
      'Cannot enforce case-insensitive usernames: held by more than one profile: %. Resolve these rows, then re-run this migration.',
      v_conflicts;
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_key
on public.profiles (lower(username)) where username is not null;

-- Redundant now: identical usernames necessarily share a lower(username), so
-- the index above rejects everything this one did.
drop index if exists public.profiles_username_key;


-- 3. Availability probe, readable without exposing other profiles -------------
--
-- security definer so it can see rows that profiles_select_own hides, but it
-- returns a single boolean and takes the excluded row from auth.uid() only, so
-- it cannot be used to read another user's profile or to hide a taken name.

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from public.profiles
    where username is not null
      and lower(username) = public.normalize_username(p_username)
      -- The caller already owns their own username: keeping it while editing the
      -- rest of the profile, or reclaiming it after clearing the field, is not a
      -- collision.
      and id is distinct from auth.uid()
  );
$$;

comment on function public.is_username_available(text) is
  'True when the normalized username is free for the calling user. Advisory: '
  'profiles_username_lower_key is the authority.';

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to authenticated;


notify pgrst, 'reload schema';
