"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const placeholder = /your-project\.supabase\.co/i.test(url) || /<supabase-project-ref>/i.test(url);
  browserClient = url && key && !placeholder ? createClient(url, key) : null;
  return browserClient;
}
