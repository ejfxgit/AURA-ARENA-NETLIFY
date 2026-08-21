import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/agents";
import type { AgentId } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const agent = AGENTS[params.id as AgentId];
  if (!agent) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });
  return NextResponse.json({ agent });
}
