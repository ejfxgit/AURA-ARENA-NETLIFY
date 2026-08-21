-- ============================================================================
-- Profile photo upload: profiles.avatar_url + profile-avatars storage policies
-- ============================================================================
--
-- Adds the column the profile editor writes after uploading an image to the
-- profile-avatars storage bucket, and scopes that bucket so an authenticated
-- user can only manage files inside their own <auth.uid()>/ folder.
--
-- avatar_url stays nullable on purpose: a null value keeps the existing AURA
-- avatar_style fallback (CUSTOM_AGENT_AVATAR_STYLES in src/lib/custom-agents.ts).
--
-- Reuses the existing conventions from 202608150002_wallet_accounts.sql and
-- 202608180002_profile_settings.sql: named "<table>_<action>_own" policies that
-- compare (select auth.uid()) against the owning column.
--
-- Idempotent: safe to run more than once.
-- ============================================================================


-- 1. profiles.avatar_url -------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_avatar_url_length;

alter table public.profiles
  add constraint profiles_avatar_url_length
  check (avatar_url is null or char_length(avatar_url) between 1 and 512);


-- 2. profile-avatars bucket ----------------------------------------------------
--
-- Public read so every avatar surface can render the stored public URL directly.
-- The size limit and mime list mirror src/lib/profile-avatar.ts, so the database
-- rejects exactly what the client-side validation rejects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public             = true,
    file_size_limit    = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];


-- 3. Storage RLS: a user may only manage their own <auth.uid()>/ folder --------
--
-- The first path segment must equal the authenticated user id, so an upload,
-- overwrite or delete aimed at another user's folder is refused by Postgres
-- regardless of what the client sends.

drop policy if exists "profile_avatars_read_public" on storage.objects;
create policy "profile_avatars_read_public" on storage.objects
for select using (bucket_id = 'profile-avatars');

drop policy if exists "profile_avatars_insert_own" on storage.objects;
create policy "profile_avatars_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile_avatars_update_own" on storage.objects;
create policy "profile_avatars_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "profile_avatars_delete_own" on storage.objects;
create policy "profile_avatars_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);


notify pgrst, 'reload schema';
