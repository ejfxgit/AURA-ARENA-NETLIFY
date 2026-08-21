import { NextResponse } from "next/server";
import {
  customAgentFromRow,
  customAgentIssueSummary,
  customAgentIssues,
  customAgentSchema,
  customAgentToRow,
  type CustomAgentRow,
} from "@/lib/custom-agents";
import { getWalletAuth } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

/**
 * Turns a PostgREST/Postgres failure into a message the operator can act on.
 * A missing column (42703) means a migration under supabase/migrations has not
 * been applied to the live project, which is otherwise invisible from the UI.
 */
function describeDbError(error: { code?: string; message?: string; details?: string | null; hint?: string | null }): string {
  if (error.code === "42703") {
    return "The custom_agents table is missing a column. Apply the pending migrations in supabase/migrations.";
  }
  if (error.code === "42P01") {
    return "The custom_agents table does not exist. Apply supabase/migrations/202608150001_create_custom_agents.sql.";
  }
  if (error.code === "23514") {
    return "The database rejected this agent (check constraint). Review the values and try again.";
  }
  return "Unable to create custom agent";
}

function logDbError(scope: string, error: unknown): void {
  const detail = error as { code?: string; message?: string; details?: string | null; hint?: string | null };
  console.error(`[custom-agents] ${scope} database error`, {
    code: detail?.code,
    message: detail?.message,
    details: detail?.details,
    hint: detail?.hint,
  });
}

export async function GET(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) {
    console.warn("[custom-agents] GET rejected", { status: auth.status, error: auth.error });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await auth.supabase
    .from("custom_agents")
    .select("*")
    .eq("owner_id", auth.user.id)
    .order("created_at", { ascending: true });
  if (error) {
    logDbError("GET", error);
    return NextResponse.json(
      { error: error.code === "42703" || error.code === "42P01" ? describeDbError(error) : "Unable to load custom agents" },
      { status: 500 },
    );
  }

  return NextResponse.json({ agents: (data as CustomAgentRow[]).map(customAgentFromRow) });
}

export async function POST(req: Request) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) {
    console.warn("[custom-agents] POST rejected", { status: auth.status, error: auth.error });
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => null);
  const parsed = customAgentSchema.safeParse(body);
  if (!parsed.success) {
    const issues = customAgentIssues(parsed.error);
    // Server-side diagnostics: the exact fields that failed, plus the shape of
    // the payload that produced them (values are user-authored, not secrets).
    console.warn("[custom-agents] POST validation failed", {
      ownerId: auth.user.id,
      issues,
      receivedKeys: body && typeof body === "object" ? Object.keys(body) : body,
      receivedBody: body,
    });
    return NextResponse.json(
      { error: customAgentIssueSummary(issues), fields: issues },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("custom_agents")
    .insert({ owner_id: auth.user.id, ...customAgentToRow(parsed.data) })
    .select("*")
    .single();
  if (error?.code === "23505") {
    return NextResponse.json({ error: "You already have an agent with this name" }, { status: 409 });
  }
  if (error || !data) {
    logDbError("POST", error);
    return NextResponse.json(
      { error: error ? describeDbError(error) : "Unable to create custom agent" },
      { status: 500 },
    );
  }

  return NextResponse.json({ agent: customAgentFromRow(data as CustomAgentRow) }, { status: 201 });
}
