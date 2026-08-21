import { NextResponse } from "next/server";
import { getOrCreateAccount } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || "guest";
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(userId)) {
    return NextResponse.json({ error: "Wallet accounts require authentication" }, { status: 401 });
  }
  const account = getOrCreateAccount(userId);
  return NextResponse.json({ account });
}
