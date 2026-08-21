import { NextResponse } from "next/server";
import {
  accountIssueSummary,
  userSettingsFromRow,
  userSettingsToRow,
  userSettingsUpdateSchema,
  type UserSettingsRow,
} from "@/lib/account";
import { ensureUserSettings, getWalletAuth } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

/**
 * Workspace settings for the authenticated wallet account.
 *
 * Every query is scoped to auth.user.id taken from the verified session; the
 * request never supplies a user id. The user_settings RLS policies enforce the
 * same ownership rule inside Postgres, so a leaked id cannot read or write
 * another user's row.
 */

function describeDbError(error: { code?: string }): { message: string; status: number } {
  if (error.code === "42P01") {
    return {
      message: "The user_settings table does not exist. Apply supabase/migrations/202608180002_profile_settings.sql.",
      status: 500,
    };
  }
  if (error.code === "42703") {
    return {
      message: "The user_settings table is missing a column. Apply supabase/migrations/202608180002_profile_settings.sql.",
      status: 500,
    };
  }
  if (error.code === "23514") {
    return { message: "The database rejected one of these values. Review and try again.", status: 400 };
  }
  return { message: "Unable to load workspace settings", status: 500 };
}

function logDbError(scope: string, error: unknown): void {
  const detail = error as { code?: string; message?: string; details?: string | null; hint?: string | null };
  console.error(`[settings] ${scope} database error`, {
    code: detail?.code,
    message: detail?.message,
    details: detail?.details,
    hint: detail?.hint,
  });
}

export async function GET(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const settings = await ensureUserSettings(auth.supabase, auth.user.id);
    return NextResponse.json({ settings });
  } catch (error) {
    logDbError("GET", error);
    const described = describeDbError(error as { code?: string });
    return NextResponse.json({ error: described.message }, { status: described.status });
  }
}

export async function PATCH(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = userSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    // Real trading has no execution layer yet, so the API refuses it outright
    // rather than storing a mode the product cannot honour.
    const attemptedRealMode = Boolean(body && typeof body === "object" && (body as { tradingMode?: string }).tradingMode === "REAL");
    return NextResponse.json(
      { error: attemptedRealMode ? "Real trading is not available yet" : accountIssueSummary(parsed.error) },
      { status: 400 },
    );
  }

  try {
    // Guarantees the row exists before the update, so first-time saves work.
    await ensureUserSettings(auth.supabase, auth.user.id);
  } catch (error) {
    logDbError("PATCH ensure", error);
    const described = describeDbError(error as { code?: string });
    return NextResponse.json({ error: described.message }, { status: described.status });
  }

  const { data, error } = await auth.supabase
    .from("user_settings")
    .update(userSettingsToRow(parsed.data))
    .eq("user_id", auth.user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    logDbError("PATCH", error);
    const described = describeDbError(error);
    return NextResponse.json({ error: described.message }, { status: described.status });
  }
  if (!data) return NextResponse.json({ error: "Workspace settings not found" }, { status: 404 });

  return NextResponse.json({ settings: userSettingsFromRow(data as UserSettingsRow) });
}
