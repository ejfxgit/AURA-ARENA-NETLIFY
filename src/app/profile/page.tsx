"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, RefreshCw, TrendingUp, Award } from "lucide-react";
import { api } from "@/lib/client";
import { useWallet } from "@/lib/use-wallet";
import { fmtAura } from "@/lib/aura-economy";
import { cn, formatPair, pnlColor, shortHash } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DemoAccount, Battle } from "@/lib/types";

export default function ProfilePage() {
  const [account, setAccount] = useState<DemoAccount | null>(null);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const wallet = useWallet();

  useEffect(() => {
    if (wallet.initializing) return;
    if (!wallet.ready) {
      setLoading(false);
      wallet.openConnect();
      return;
    }
    setAccount(wallet.account);
    api<{ battles: Battle[] }>("/api/battles?scope=mine")
      .then((data) => setBattles(data.battles))
      .finally(() => setLoading(false));
  }, [wallet, wallet.account, wallet.initializing, wallet.ready]);

  const totalPnl = account?.realized_pnl ?? 0;
  const total = (account?.wins ?? 0) + (account?.losses ?? 0);
  const winRate = total > 0 ? ((account!.wins / total) * 100).toFixed(1) : "0";
  const challengeTotal = (account?.valid_challenges ?? 0) + (account?.invalid_challenges ?? 0);
  const challengeRate = challengeTotal > 0
    ? (((account?.valid_challenges ?? 0) / challengeTotal) * 100).toFixed(1)
    : "0";
  const reputation = Math.round(
    1000 + totalPnl * 4 + (account?.wins ?? 0) * 25 + (account?.valid_challenges ?? 0) * 15,
  );

  if (wallet.initializing) {
    return <div className="mx-auto flex min-h-[55vh] max-w-4xl items-center justify-center px-4 text-sm text-white/40"><RefreshCw size={14} className="mr-2 animate-spin" /> Restoring wallet account...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{wallet.profile?.displayName || "Profile"}</h1>
          <p className="mt-1 text-sm text-white/50">
            Your demo account, reputation and wallet.
          </p>
        </div>
        {wallet.address ? (
          <div className="chip text-aura-long">
            <Wallet size={13} /> {shortHash(wallet.address)}
          </div>
        ) : (
          <Button variant="secondary" onClick={wallet.connect} disabled={wallet.connecting}>
            <Wallet size={15} /> {wallet.connecting ? "Connecting…" : "Connect wallet"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-white/40">
          <RefreshCw size={14} className="animate-spin" /> Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="AURA balance" value={fmtAura(account?.current_balance ?? 0)} />
            <MetricCard
              label="Realized P&L"
              value={fmtAura(totalPnl, { sign: true })}
              tone={pnlColor(totalPnl)}
            />
            <MetricCard label="Win rate" value={`${winRate}%`} />
            <MetricCard label="Record" value={`${account?.wins ?? 0}-${account?.losses ?? 0}`} />
            <MetricCard label="Challenge success" value={`${challengeRate}%`} />
            <MetricCard label="Reputation" value={String(reputation)} />
          </div>

          <div className="glass mt-5 flex items-center gap-4 p-5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-aura-accent/15 text-aura-accent">
              <Award size={22} />
            </div>
            <div>
              <div className="text-sm text-white/50">Starting balance</div>
              <div className="mono text-lg font-bold">
                {fmtAura(account?.starting_balance ?? 1000)}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-sm text-white/50">
              <TrendingUp size={15} /> {battles.length} battles played
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Recent battles</h2>
              <Link href="/history" className="text-sm text-aura-accent hover:underline">
                Full history →
              </Link>
            </div>
            {battles.length === 0 ? (
              <div className="glass p-8 text-center text-sm text-white/40">
                No battles yet.{" "}
                <Link href="/arena" className="text-aura-accent hover:underline">
                  Start one
                </Link>
                .
              </div>
            ) : (
              <div className="space-y-2">
                {battles.slice(0, 5).map((b) => (
                  <Link
                    key={b.id}
                    href={`/arena/${b.id}`}
                    className="glass flex items-center justify-between p-3 text-sm transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="font-medium">{formatPair(b.asset)}</span>
                    <span className="text-xs text-white/40">{b.status}</span>
                    <span className={cn("mono font-semibold", pnlColor(b.human_pnl))}>
                      {fmtAura(b.human_pnl, { sign: true })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="glass-soft p-4">
      <div className="text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className={cn("mono mt-1 text-lg font-bold", tone)}>{value}</div>
    </div>
  );
}
