import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { z } from "zod";
import {
  createWalletAccount,
  getWalletAuth,
  loadWalletAccount,
} from "@/lib/supabase/aura";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { accountIssueSummary, normalizeUsername, profileToRow, profileUpdateSchema, USERNAME_TAKEN_MESSAGE } from "@/lib/account";
import { profileAvatarUrlIssue } from "@/lib/profile-avatar";

export const dynamic = "force-dynamic";

const schema = z.object({
  walletAddress: z.string().refine(isAddress, "Invalid wallet address"),
  displayName: z.string().trim().min(2).max(40),
});

export async function GET(req: Request) {
  const auth = await getWalletAuth(req, false);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    walletAddress: auth.walletAddress,
    profile: auth.bundle.profile,
    account: auth.bundle.account,
  });
}

export async function POST(req: Request) {
  const auth = await getWalletAuth(req, false);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid onboarding details" }, { status: 400 });
  if (parsed.data.walletAddress.toLowerCase() !== auth.walletAddress) {
    return NextResponse.json({ error: "Wallet address does not match the authenticated wallet" }, { status: 403 });
  }
  if (auth.bundle.profile && auth.bundle.profile.walletAddress.toLowerCase() !== auth.walletAddress) {
    return NextResponse.json({ error: "Wallet account is linked to a different wallet" }, { status: 409 });
  }
  if (auth.bundle.profile && auth.bundle.account) {
    return NextResponse.json({
      walletAddress: auth.walletAddress,
      profile: auth.bundle.profile,
      account: auth.bundle.account,
    });
  }

  try {
    await createWalletAccount(auth.user.id, auth.walletAddress, parsed.data.displayName);
    const bundle = await loadWalletAccount(auth.supabase, auth.user.id);
    const status = auth.bundle.profile || auth.bundle.account ? 200 : 201;
    return NextResponse.json({ walletAddress: auth.walletAddress, ...bundle }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create wallet account";
    return NextResponse.json(
      { error: message },
      { status: message === "Wallet session must be refreshed" ? 401 : 500 },
    );
  }
}

/**
 * Updates the editable identity fields of the caller's own profile.
 *
 * Ownership is taken from the authenticated session (auth.user.id) and never
 * from the request body, so a client cannot target another user's profile. The
 * profiles_update_own RLS policy enforces the same rule at the database level.
 *
 * avatarUrl is additionally required to point at a file inside the caller's own
 * folder in the profile-avatars bucket, so the column cannot be pointed at
 * another user's upload or at an arbitrary external host.
 *
 * A username already held by someone else is refused with 409 rather than
 * reassigned, so a profile edit cannot take over another user's handle.
 */
export async function PATCH(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: accountIssueSummary(parsed.error) }, { status: 400 });
  }

  const avatarIssue = profileAvatarUrlIssue(parsed.data.avatarUrl, auth.user.id);
  if (avatarIssue) return NextResponse.json({ error: avatarIssue }, { status: 400 });

  // Usernames are globally unique, case-insensitively. The authority for that is
  // the profiles_username_lower_key index; this lookup only exists to turn the
  // ordinary "someone already has it" case into a clear 409 instead of a raw
  // constraint violation. Skipped when the username is not changing, so saving
  // an unchanged profile -- including the photo-only PATCH, which resends the
  // stored values -- never reports the caller's own handle as taken.
  const nextUsername = parsed.data.username;
  if (nextUsername && nextUsername !== normalizeUsername(auth.bundle.profile?.username)) {
    const { data: available, error: availabilityError } = await auth.supabase
      .rpc("is_username_available", { p_username: nextUsername });
    if (availabilityError) {
      if (availabilityError.code === "PGRST202") {
        return NextResponse.json(
          { error: "Username checks are unavailable. Apply supabase/migrations/202608190001_username_unique_case_insensitive.sql." },
          { status: 500 },
        );
      }
      console.error("[wallet/account] username availability lookup failed", {
        code: availabilityError.code,
        message: availabilityError.message,
      });
      return NextResponse.json({ error: "Unable to verify that username" }, { status: 500 });
    }
    if (available !== true) {
      return NextResponse.json({ error: USERNAME_TAKEN_MESSAGE }, { status: 409 });
    }
  }

  const { error } = await auth.supabase
    .from("profiles")
    .update(profileToRow(parsed.data))
    .eq("id", auth.user.id);

  // Two requests can still claim the same name between the check above and this
  // write. The unique index rejects the loser, and it gets the same answer it
  // would have got a moment earlier rather than a 500.
  if (error?.code === "23505") {
    const clashedOnUsername = `${error.message} ${error.details ?? ""}`.includes("username");
    return NextResponse.json(
      { error: clashedOnUsername ? USERNAME_TAKEN_MESSAGE : "Those details are already in use" },
      { status: 409 },
    );
  }
  if (error?.code === "42703") {
    return NextResponse.json(
      { error: "The profiles table is missing a column. Apply supabase/migrations/202608180002_profile_settings.sql and supabase/migrations/202608180003_profile_avatar_upload.sql." },
      { status: 500 },
    );
  }
  if (error?.code === "23514") {
    return NextResponse.json({ error: "The database rejected one of these values. Review and try again." }, { status: 400 });
  }
  if (error) {
    console.error("[wallet/account] PATCH database error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: "Unable to save profile" }, { status: 500 });
  }

  const bundle = await loadWalletAccount(auth.supabase, auth.user.id);
  return NextResponse.json({ walletAddress: auth.walletAddress, ...bundle });
}

/**
 * Permanently deletes the caller's own account.
 *
 * Removing the auth user cascades through every owned table via the existing
 * foreign keys (profiles -> auth.users, demo_accounts/user_battles/user_settings
 * -> profiles, custom_agents -> auth.users), so no relationship is left dangling
 * and no table needs bespoke cleanup.
 */
export async function DELETE(req: Request) {
  const auth = await getWalletAuth(req, false);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.auth.admin.deleteUser(auth.user.id);
    if (error) throw new Error(error.message);
  } catch (error) {
    console.error("[wallet/account] DELETE failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete account" },
      { status: 500 },
    );
  }

  return NextResponse.json({ deleted: true });
}
