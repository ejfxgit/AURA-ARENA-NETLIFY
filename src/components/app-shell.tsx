"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  ChartNoAxesCombined,
  CircleDollarSign,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Nav } from "@/components/nav";
import { ProfileAvatar } from "@/components/ui/profile-avatar";
import { useWallet } from "@/lib/use-wallet";
import { fmtAura } from "@/lib/aura-economy";
import { cn, shortHash } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Main",
    links: [
      { href: "/arena", label: "Overview", icon: LayoutDashboard },
      { href: "/arena/battles", label: "Arena", icon: Swords },
      { href: "/arena/my-battles", label: "My Battles", icon: History },
      { href: "/arena/markets", label: "Markets", icon: Network },
    ],
  },
  {
    label: "Intelligence",
    links: [
      { href: "/arena/agents", label: "Agents", icon: Bot },
      { href: "/arena/my-agents", label: "My Agents", icon: Sparkles },
      { href: "/arena/performance", label: "Agent Performance", icon: BarChart3 },
      { href: "/arena/leaderboard", label: "Leaderboard", icon: Trophy },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/arena/portfolio", label: "Portfolio / Balance", icon: Wallet },
      { href: "/arena/withdraw", label: "Withdraw", icon: CircleDollarSign },
      { href: "/arena/transactions", label: "Transactions", icon: ChartNoAxesCombined },
      { href: "/arena/profile", label: "Profile", icon: UserRound },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/arena/proof", label: "Proof", icon: ShieldCheck },
      { href: "/arena/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

const MOBILE_LINKS = [
  { href: "/arena", label: "Overview", icon: LayoutDashboard },
  { href: "/arena/battles", label: "Arena", icon: Swords },
  { href: "/arena/agents", label: "Agents", icon: Bot },
  { href: "/arena/portfolio", label: "Balance", icon: Wallet },
] as const;

function isActivePath(pathname: string, href: string) {
  return href === "/arena" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/arena")) {
    return (
      <>
        <Nav />
        <main className="min-h-screen pt-[57px]">{children}</main>
      </>
    );
  }
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

function AuthenticatedShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wallet = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [realModalOpen, setRealModalOpen] = useState(false);

  useEffect(() => {
    const openRealMode = () => setRealModalOpen(true);
    window.addEventListener("aura:open-real-mode", openRealMode);
    return () => window.removeEventListener("aura:open-real-mode", openRealMode);
  }, []);

  if (!wallet.initializing && !wallet.session) {
    return (
      <>
        <Nav />
        <main className="min-h-screen pt-[57px]">{children}</main>
      </>
    );
  }

  const disconnect = async () => {
    await wallet.disconnect();
  };

  return (
    <div className="min-h-screen bg-[#05070d] text-[#e7ecf5]">
      <aside className="fixed inset-y-0 left-0 z-[120] hidden w-[248px] flex-col border-r border-white/[0.07] bg-[#070911] lg:flex">
        <ShellBrand />
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Authenticated AURA navigation">
          {NAV_GROUPS.map((group, index) => (
            <div key={group.label} className={cn(index > 0 && "mt-5")}>
              <div className="px-3 pb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{group.label}</div>
              <div className="space-y-0.5">
                {group.links.map(({ href, label, icon: Icon }) => {
                  const active = isActivePath(pathname, href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "focus-ring group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors",
                        active ? "bg-aura-accent/[0.12] text-white" : "text-white/48 hover:bg-white/[0.04] hover:text-white/80",
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-aura-accent" />}
                      <Icon size={15} className={cn("shrink-0", active ? "text-aura-accent" : "text-white/28 group-hover:text-white/55")} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.07] p-3">
          <div className="mb-2 flex items-center justify-between px-2 text-[10px]">
            <span className="text-white/32">Demo balance</span>
            <span className="font-mono font-semibold text-white/75">{fmtAura(wallet.account?.current_balance ?? 0)}</span>
          </div>
          <button type="button" onClick={wallet.openConnect} className="focus-ring flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/[0.04]">
            <ProfileAvatar
              avatarUrl={wallet.profile?.avatarUrl}
              displayName={wallet.profile?.displayName}
              className="h-9 w-9 rounded-md border border-white/[0.09]"
              fallback={
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.09] bg-white/[0.035] text-sm font-bold text-white/75">
                  {(wallet.profile?.displayName || "A").slice(0, 1).toUpperCase()}
                </span>
              }
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-white/80">{wallet.profile?.displayName || "AURA account"}</span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-white/32">{wallet.address ? shortHash(wallet.address, 5) : "Wallet not connected"}</span>
              <span className={cn("mt-1 flex items-center gap-1 text-[9px] font-semibold uppercase", wallet.isXLayerTestnet ? "text-aura-long/80" : "text-aura-wait")}>
                <span className={cn("h-1 w-1 rounded-full", wallet.isXLayerTestnet ? "bg-aura-long" : "bg-aura-wait")} />
                {wallet.isXLayerTestnet ? "X Layer Testnet" : "Network required"}
              </span>
            </span>
          </button>
          {wallet.session && (
            <button type="button" onClick={() => void disconnect()} className="focus-ring mt-1 flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium text-white/35 hover:bg-aura-short/[0.07] hover:text-aura-short">
              <LogOut size={13} /> Disconnect
            </button>
          )}
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[248px]">
        <header className="sticky top-0 z-[110] border-b border-white/[0.07] bg-[#05070d]/92 backdrop-blur-xl">
          <div className="relative flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" aria-label="Open navigation" onClick={() => setMobileOpen(true)} className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.09] bg-white/[0.03] text-white/65 lg:hidden">
                <Menu size={17} />
              </button>
              <span className="hidden items-center gap-2 text-xs text-white/35 sm:flex">
                <span className="font-semibold text-white/68">AURA Arena</span>
                <span>/</span>
                <span className="truncate">{currentTitle(pathname)}</span>
              </span>
              <span className="font-display text-sm font-bold tracking-[0.08em] sm:hidden">AURA<span className="text-aura-accent">.</span></span>
            </div>
            <div className="flex items-center gap-2">
              <ModeSelector onReal={() => setRealModalOpen(true)} />
              <span className={cn("hidden h-8 items-center gap-1.5 px-1 text-[10px] font-semibold xl:inline-flex", wallet.isXLayerTestnet ? "text-white/48" : "text-aura-wait")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", wallet.isXLayerTestnet ? "bg-aura-long" : "bg-aura-wait")} />
                {wallet.isXLayerTestnet ? "X Layer Testnet" : "Network required"}
              </span>
              <button type="button" onClick={wallet.openConnect} aria-label={wallet.address ? `Connected wallet ${wallet.address}` : "Connect wallet"} className="focus-ring inline-flex h-8 items-center gap-2 rounded-md border border-white/[0.09] bg-white/[0.035] px-2 text-xs font-semibold text-white/70 hover:bg-white/[0.06] sm:px-2.5">
                <Wallet size={13} className="text-aura-long" />
                <span className="hidden min-[390px]:inline">{wallet.address ? shortHash(wallet.address, 4) : "Connect"}</span>
              </button>
              <div className="hidden h-8 items-center border-l border-white/[0.08] pl-3 xl:flex" aria-label={`${fmtAura(wallet.account?.current_balance ?? 0)} demo balance`}>
                <div className="text-right">
                  <div className="font-mono text-[11px] font-semibold text-white/78">{fmtAura(wallet.account?.current_balance ?? 0)}</div>
                  <div className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/25">Balance</div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-57px)] pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</main>
      </div>

      <div className={cn("fixed inset-0 z-[210] lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!mobileOpen}>
        <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className={cn("absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity", mobileOpen ? "opacity-100" : "opacity-0")} />
        <aside className={cn("absolute inset-y-0 left-0 flex w-[286px] max-w-[86vw] flex-col border-r border-white/[0.08] bg-[#070911] transition-transform duration-200", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
          <div className="flex items-center justify-between border-b border-white/[0.07] pr-3"><ShellBrand mobile /><button type="button" title="Close navigation" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="focus-ring grid h-8 w-8 place-items-center rounded-md text-white/45 hover:bg-white/[0.05] hover:text-white"><X size={16} /></button></div>
          <nav className="flex-1 overflow-y-auto px-3 py-4">{NAV_GROUPS.map((group, index) => <div key={group.label} className={cn(index > 0 && "mt-5")}><div className="px-3 pb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/25">{group.label}</div>{group.links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-sm", isActivePath(pathname, href) ? "bg-aura-accent/[0.12] text-white" : "text-white/50")}><Icon size={16} className={isActivePath(pathname, href) ? "text-aura-accent" : "text-white/30"} />{label}</Link>)}</div>)}</nav>
          <div className="border-t border-white/[0.07] p-3">
            {wallet.ready && <div className="mb-2 rounded-md border border-white/[0.07] bg-white/[0.02] p-3"><div className="flex items-start gap-3"><ProfileAvatar avatarUrl={wallet.profile?.avatarUrl} displayName={wallet.profile?.displayName} className="h-9 w-9 rounded-md border border-white/[0.09]" fallback={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/[0.09] bg-white/[0.035] text-sm font-bold text-white/75">{(wallet.profile?.displayName || "A").slice(0, 1).toUpperCase()}</span>} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white/80">{wallet.profile?.displayName}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-white/32">{wallet.address ? shortHash(wallet.address, 5) : ""}</span><span className="mt-2 flex items-center justify-between gap-3 text-[10px]"><span className="text-white/32">AURA balance</span><span className="font-mono font-semibold text-white/70">{fmtAura(wallet.account?.current_balance ?? 0)}</span></span></span></div></div>}
            <button type="button" onClick={() => void disconnect()} className="flex h-10 w-full items-center gap-2 rounded-md border border-white/[0.07] px-3 text-sm text-white/45"><LogOut size={15} /> Disconnect</button>
          </div>
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-[100] grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-white/[0.08] bg-[#070911]/96 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" aria-label="Primary mobile navigation">
        {MOBILE_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return <Link key={href} href={href} className={cn("flex flex-col items-center justify-center gap-1 text-[10px] font-medium", active ? "text-aura-accent" : "text-white/35")}><Icon size={17} /><span>{label}</span></Link>;
        })}
      </nav>
      {realModalOpen && <RealTradingModal onClose={() => setRealModalOpen(false)} />}
    </div>
  );
}

function ModeSelector({ onReal }: { onReal: () => void }) {
  return (
    <div role="group" aria-label="Trading mode" className="inline-flex h-8 shrink-0 items-center rounded-md border border-white/[0.1] bg-[#090c14] p-0.5 shadow-inner shadow-black/30">
      <button type="button" aria-pressed="true" className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-[4px] bg-aura-accent/[0.16] px-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-aura-accent shadow-sm shadow-black/30 sm:px-3">
        <span className="h-1.5 w-1.5 rounded-full bg-aura-accent shadow-[0_0_8px_rgba(124,92,255,0.8)]" /> DEMO
      </button>
      <button type="button" aria-pressed="false" onClick={onReal} title="Real Mode coming soon" className="focus-ring inline-flex h-7 items-center rounded-[4px] px-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/38 transition-colors hover:bg-white/[0.05] hover:text-white/75 sm:px-3">
        REAL
      </button>
    </div>
  );
}

function RealTradingModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[240] grid place-items-center px-4 py-8">
      <button type="button" aria-label="Close Real Mode announcement" onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="real-trading-title" aria-describedby="real-trading-description" className="relative w-full max-w-[520px] overflow-hidden rounded-lg border border-white/[0.11] bg-[#0a0d18] shadow-2xl shadow-black/60">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-aura-accent to-transparent" />
        <button type="button" onClick={onClose} title="Close" aria-label="Close Real Mode announcement" className="focus-ring absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-white/[0.025] text-white/38 hover:bg-white/[0.06] hover:text-white">
          <X size={15} />
        </button>
        <div className="border-b border-white/[0.07] px-6 pb-5 pt-6 sm:px-7 sm:pt-7">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-aura-accent/25 bg-aura-accent/[0.08] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-aura-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-aura-accent shadow-[0_0_10px_rgba(124,92,255,0.85)]" /> X Layer live execution
          </div>
          <h2 id="real-trading-title" className="font-display text-2xl font-bold text-white sm:text-[28px]">REAL MODE</h2>
          <p className="mt-2 text-base font-semibold text-white/62">COMING SOON</p>
        </div>
        <div id="real-trading-description" className="space-y-4 px-6 py-6 text-sm leading-6 text-white/48 sm:px-7">
          <p>Live trading is coming soon. Enjoy the AURA demo experience while we prepare real trading on X Layer.</p>
          <div className="flex items-center gap-3 border-y border-white/[0.07] py-4">
            <span className="h-2 w-2 rounded-full bg-aura-wait shadow-[0_0_12px_rgba(245,181,68,0.65)]" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-aura-wait">COMING SOON</span>
          </div>
        </div>
        <div className="border-t border-white/[0.07] bg-black/10 px-6 py-4 sm:px-7">
          <button type="button" onClick={onClose} className="focus-ring inline-flex h-10 w-full items-center justify-center rounded-md bg-aura-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-[#8b70ff]">Continue in Demo</button>
        </div>
      </div>
    </div>
  );
}

function ShellBrand({ mobile = false }: { mobile?: boolean }) {
  return (
    <Link href="/arena" className={cn("focus-ring flex h-14 min-w-0 items-center gap-2.5 px-4", mobile ? "flex-1" : "w-full shrink-0")}>
      <span className="grid h-8 w-8 place-items-center rounded-md border border-aura-accent/25 bg-aura-accent/10 text-aura-accent"><Zap size={17} className="fill-aura-accent" /></span>
      <span className="font-display text-base font-bold tracking-[0.1em]">AURA<span className="text-aura-accent">.</span></span>
    </Link>
  );
}

function currentTitle(pathname: string) {
  if (pathname === "/arena") return "Overview";
  for (const group of NAV_GROUPS) {
    for (const link of group.links) {
      if (isActivePath(pathname, link.href)) return link.label;
    }
  }
  return "Battle detail";
}
