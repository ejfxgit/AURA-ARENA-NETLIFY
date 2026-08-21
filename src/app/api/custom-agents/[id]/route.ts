import { NextResponse } from "next/server";
import {
  customAgentFromRow,
  customAgentIssueSummary,
  customAgentIssues,
  customAgentToRow,
  customAgentUpdateSchema,
  type CustomAgentRow,
} from "@/lib/custom-agents";
import { getWalletAuth } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("custom_agents")
    .select("*")
    .eq("id", params.id)
    .eq("owner_id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load custom agent" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Custom agent not found" }, { status: 404 });
  return NextResponse.json({ agent: customAgentFromRow(data as CustomAgentRow) });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = customAgentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const issues = customAgentIssues(parsed.error);
    console.warn("[custom-agents] PATCH validation failed", {
      ownerId: auth.user.id,
      agentId: params.id,
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
    .update(customAgentToRow(parsed.data))
    .eq("id", params.id)
    .eq("owner_id", auth.user.id)
    .select("*")
    .maybeSingle();
  if (error?.code === "23505") {
    return NextResponse.json({ error: "You already have an agent with this name" }, { status: 409 });
  }
  if (error) {
    console.error("[custom-agents] PATCH database error", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error: error.code === "42703"
          ? "The custom_agents table is missing a column. Apply the pending migrations in supabase/migrations."
          : "Unable to update custom agent",
      },
      { status: 500 },
    );
  }
  if (!data) return NextResponse.json({ error: "Custom agent not found" }, { status: 404 });
  return NextResponse.json({ agent: customAgentFromRow(data as CustomAgentRow) });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from("custom_agents")
    .delete()
    .eq("id", params.id)
    .eq("owner_id", auth.user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to delete custom agent" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Custom agent not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
