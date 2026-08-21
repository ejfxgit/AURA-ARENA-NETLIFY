import { NextResponse } from "next/server";
import { normalizeUsername, usernameFormatIssue } from "@/lib/account";
import { rateLimit } from "@/lib/ratelimit";
import { getWalletAuth } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

/**
 * Availability probe for the profile editor's username field.
 *
 * This route exists because the browser cannot answer the question itself: the
 * profiles_select_own policy hides every row but the caller's, so a client-side
 * query against profiles would report an already-taken name as free. It calls
 * the security-definer is_username_available() instead, which sees all profiles
 * but returns nothing beyond a boolean.
 *
 * Advisory only. PATCH /api/wallet/account re-checks before writing, and the
 * profiles_username_lower_key unique index has the final say, so an answer that
 * goes stale between typing and saving cannot let a duplicate through.
 */
export async function GET(req: Request) {
  const auth = await getWalletAuth(req, false);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // Typing-speed calls are expected; this only stops the endpoint from being
  // turned into a bulk username enumerator.
  if (!rateLimit(`username:${auth.user.id}`, 40, 10_000)) {
    return NextResponse.json({ error: "Too many username checks. Try again shortly." }, { status: 429 });
  }

  const username = normalizeUsername(new URL(req.url).searchParams.get("username"));
  const formatIssue = usernameFormatIssue(username);
  if (formatIssue) return NextResponse.json({ error: formatIssue }, { status: 400 });
  // Clearing the field is always allowed, so there is nothing to look up.
  if (!username) return NextResponse.json({ username: null, available: true });

  const { data, error } = await auth.supabase.rpc("is_username_available", { p_username: username });
  if (error) {
    // PGRST202 is "function not found in schema cache".
    if (error.code === "PGRST202") {
      return NextResponse.json(
        { error: "Username checks are unavailable. Apply supabase/migrations/202608190001_username_unique_case_insensitive.sql." },
        { status: 500 },
      );
    }
    console.error("[wallet/username] availability lookup failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json({ error: "Unable to check that username" }, { status: 500 });
  }

  return NextResponse.json({ username, available: data === true });
}
