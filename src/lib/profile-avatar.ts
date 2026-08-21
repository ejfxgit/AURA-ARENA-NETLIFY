/**
 * Profile photo rules shared by the browser upload path and the API route.
 *
 * The bucket, size limit and mime list match
 * supabase/migrations/202608180003_profile_avatar_upload.sql, so the client, the
 * API and the storage bucket all agree on what a valid avatar is.
 *
 * Nothing here touches a Supabase client, so it is safe to import from both
 * server routes and client components. The authenticated upload itself lives in
 * src/lib/supabase/avatar-storage.ts.
 */

export const PROFILE_AVATAR_BUCKET = "profile-avatars";

/** 5 MB, matching the bucket's file_size_limit. */
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** JPG, PNG, WEBP and GIF, matching the bucket's allowed_mime_types. */
export const PROFILE_AVATAR_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** accept attribute for the file input: extensions plus the mime types. */
export const PROFILE_AVATAR_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";

const PROFILE_AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const PUBLIC_OBJECT_PREFIX = `/storage/v1/object/public/${PROFILE_AVATAR_BUCKET}/`;

export function profileAvatarExtension(mimeType: string): string {
  return PROFILE_AVATAR_EXTENSIONS[mimeType] ?? "img";
}

/** Human-readable reason the file cannot be used, or null when it is valid. */
export function profileAvatarFileError(file: File): string | null {
  if (!PROFILE_AVATAR_MIME_TYPES.includes(file.type)) {
    return "Use a JPG, PNG, WEBP or GIF image";
  }
  if (!file.size) return "That image file is empty";
  if (file.size > PROFILE_AVATAR_MAX_BYTES) {
    return `Image must be 5 MB or smaller (this one is ${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
  }
  return null;
}

/** Storage object path ("<user-id>/<file>") behind a public bucket URL. */
export function profileAvatarObjectPath(publicUrl: string): string | null {
  const index = publicUrl.indexOf(PUBLIC_OBJECT_PREFIX);
  if (index < 0) return null;
  const path = publicUrl.slice(index + PUBLIC_OBJECT_PREFIX.length).split("?")[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Guards profiles.avatar_url: the stored value must be a public URL for a file
 * inside this deployment's profile-avatars bucket, in the caller's own folder.
 * Prevents a client from pointing its profile at another user's upload or at an
 * arbitrary external host. The storage policies enforce the folder rule for the
 * upload itself; this covers what gets written to the database.
 */
export function profileAvatarUrlIssue(avatarUrl: string | null, userId: string): string | null {
  if (!avatarUrl) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!base) return "Supabase storage is not configured for this deployment";
  const path = profileAvatarObjectPath(avatarUrl);
  if (!avatarUrl.startsWith(`${base}${PUBLIC_OBJECT_PREFIX}`) || !path) {
    return `Profile photo must be an uploaded file in the ${PROFILE_AVATAR_BUCKET} bucket`;
  }
  if (!path.startsWith(`${userId}/`)) {
    return "Profile photo must be a file in your own avatar folder";
  }
  return null;
}
