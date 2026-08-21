import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shows the uploaded profile photo when one exists, and otherwise renders the
 * caller's existing AURA avatar-style markup untouched.
 *
 * Each avatar surface keeps its own sizing, border and accent treatment: pass
 * the current markup as `fallback` and the same geometry classes as `className`
 * so the photo lands in exactly the same box.
 */
export function ProfileAvatar({
  avatarUrl,
  displayName,
  className,
  fallback,
}: {
  avatarUrl?: string | null;
  displayName?: string | null;
  className?: string;
  fallback: React.ReactNode;
}) {
  if (!avatarUrl) return <>{fallback}</>;
  return (
    <span className={cn("block shrink-0 overflow-hidden bg-black/25", className)}>
      {/* Supabase public storage URL rendered directly: the file name carries the
          upload timestamp, so a new photo never resolves to a cached image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={avatarUrl}
        alt={displayName ? `${displayName} profile photo` : "Profile photo"}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
