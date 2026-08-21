import { NextResponse } from "next/server";
import { AGENT_LIST } from "@/lib/agents";

export async function GET() {
  return NextResponse.json({ agents: AGENT_LIST });
}
