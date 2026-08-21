import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type AuthenticatedSupabase =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; error: string; status: number };

export async function getAuthenticatedSupabase(req: Request): Promise<AuthenticatedSupabase> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  if (!url || !key) {
    return { ok: false, error: "Supabase accounts are not configured", status: 503 };
  }

  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { ok: false, error: "Authentication required", status: 401 };

  const supabase = createClient(url, key, {
    // Explicitly include `apikey` alongside the user JWT. With supabase-js
    // 2.112+ and the sb_publishable_ key format the client does NOT
    // auto-inject the apikey header when Authorization is overridden via
    // global.headers, so PostgREST returns HTTP 401 "No API key found in
    // request" — the runtime 503 "Unable to read agent decisions" symptom.
    global: { headers: { apikey: key, Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { ok: false, error: "Invalid or expired session", status: 401 };

  return { ok: true, supabase, user: data.user };
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Supabase account administration is not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
