"use client";

import {
  PROFILE_AVATAR_BUCKET,
  profileAvatarExtension,
  profileAvatarFileError,
  profileAvatarObjectPath,
} from "../profile-avatar";
import { getSupabaseBrowserClient } from "./browser";

/**
 * Profile photo storage, driven by the existing authenticated browser client.
 *
 * Files are written to <authenticated-user-id>/<filename> in the profile-avatars
 * bucket, which is exactly the prefix the profile_avatars_*_own storage policies
 * allow. Only the publishable key and the user's own session travel with the
 * request: no service-role key is ever present in client code, and the database
 * refuses any path outside the caller's own folder.
 */

function uploadFailureMessage(message: string): string {
  const detail = message.toLowerCase();
  if (detail.includes("bucket not found")) {
    return `The ${PROFILE_AVATAR_BUCKET} storage bucket does not exist. Apply supabase/migrations/202608180003_profile_avatar_upload.sql.`;
  }
  if (detail.includes("maximum allowed size") || detail.includes("payload too large") || detail.includes("entity too large")) {
    return "Image must be 5 MB or smaller";
  }
  if (detail.includes("mime type") || detail.includes("content type")) {
    return "Use a JPG, PNG, WEBP or GIF image";
  }
  if (detail.includes("row-level security") || detail.includes("unauthorized") || detail.includes("violates")) {
    return "Storage rejected the upload. Apply supabase/migrations/202608180003_profile_avatar_upload.sql, then sign in again.";
  }
  return message || "Unable to upload the image";
}

/**
 * Uploads the file and returns its public URL.
 *
 * The name carries a timestamp so each upload gets a fresh URL, which keeps the
 * new photo from being served out of a stale CDN or browser cache.
 */
export async function uploadProfileAvatar(userId: string, file: File): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase storage is not configured for this deployment");

  const invalid = profileAvatarFileError(file);
  if (invalid) throw new Error(invalid);

  const path = `${userId}/avatar-${Date.now()}.${profileAvatarExtension(file.type)}`;
  const { error } = await supabase.storage.from(PROFILE_AVATAR_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(uploadFailureMessage(error.message));

  const { data } = supabase.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("The image was uploaded but no public URL was returned");
  return data.publicUrl;
}

/**
 * Best-effort removal of an avatar the caller previously uploaded.
 *
 * Paths outside the caller's own folder are skipped locally and would be refused
 * by the storage policy anyway. A failure here is deliberately not surfaced: the
 * profile already points at the new photo, so a leftover object is cosmetic.
 */
export async function removeProfileAvatar(userId: string, publicUrl: string | null): Promise<void> {
  if (!publicUrl) return;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return;
  const path = profileAvatarObjectPath(publicUrl);
  if (!path || !path.startsWith(`${userId}/`)) return;
  await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([path]).catch(() => undefined);
}
