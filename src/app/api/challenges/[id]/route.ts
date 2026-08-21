import { NextResponse } from "next/server";
import { getWalletAuth, listBattlesForUser } from "@/lib/supabase/aura";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const auth = await getWalletAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const battles = await listBattlesForUser(auth.supabase, auth.user.id);
  for (const b of battles) {
    const c = b.challenges.find((x) => x.id === params.id);
    if (c) return NextResponse.json({ challenge: c });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
