import { NextResponse } from "next/server";
import { getWalletAuth, loadWalletAccount } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

/**
 * Resets the caller's own demo capital back to its starting balance.
 *
 * Delegates to the public.reset_demo_balance() RPC, which derives the target row
 * from auth.uid() internally. The user id is never accepted from the request, so
 * one account cannot reset another account's balance. Battle history and the
 * competitive record are intentionally preserved.
 */
export async function POST(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.supabase.rpc("reset_demo_balance");
  if (error) {
    console.error("[demo-account] reset failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    const missingFunction = error.code === "42883" || /function .*reset_demo_balance/i.test(error.message ?? "");
    return NextResponse.json(
      {
        error: missingFunction
          ? "The reset_demo_balance function does not exist. Apply supabase/migrations/202608180002_profile_settings.sql."
          : "Unable to reset demo balance",
      },
      { status: 500 },
    );
  }

  const bundle = await loadWalletAccount(auth.supabase, auth.user.id);
  return NextResponse.json({ walletAddress: auth.walletAddress, ...bundle });
}
