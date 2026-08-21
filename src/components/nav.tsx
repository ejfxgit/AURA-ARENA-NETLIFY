"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Menu, Wallet, X, Zap } from "lucide-react";
import { cn, shortHash } from "@/lib/utils";
import { useWallet } from "@/lib/use-wallet";

/**
 * Landing-page anchor links.
 * When on "/" these scroll in-page; when on another route they navigate to "/#<hash>".
 */
const LANDING_LINKS = [
  { hash: "how-it-works", label: "How It Works" },
  { hash: "agents", label: "Agents" },
  { hash: "arena", label: "Arena" },
  { hash: "proof", label: "Proof" },
  { hash: "markets", label: "Markets" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address, connecting, isXLayerTestnet, ready, openConnect, enterArena } = useWallet();

  const isLanding = pathname === "/";

  // Close mobile menu on route change
  useEffect(() => setMobileOpen(false), [pathname]);

  /**
   * Smooth-scroll to a section by ID.
   * Accounts for the sticky navbar height via the `scroll-margin-top` on sections.
   */
  const scrollToSection = useCallback((hash: string) => {
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  /**
   * Handle a landing-section link click.
   * - On "/" → scroll in-page.
   * - On another route → navigate to "/#<hash>", browser will jump to anchor.
   */
  const handleLandingLink = useCallback(
    (e: React.MouseEvent, hash: string) => {
      if (isLanding) {
        e.preventDefault();
        setMobileOpen(false);
        scrollToSection(hash);
      } else {
        // Let the <Link href="/#hash"> do a full navigation
        setMobileOpen(false);
      }
    },
    [isLanding, scrollToSection],
  );

  /**
   * Handle AURA logo click: always go to top of landing.
   */
  const handleLogoClick = useCallback(
    (e: React.MouseEvent) => {
      if (isLanding) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [isLanding],
  );

  return (
    <header className="fixed inset-x-0 top-0 z-[100] border-b border-white/[0.07] bg-[#05070d]/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-5 px-4 sm:px-6">
        {/* Logo → scroll to top on landing, navigate to "/" elsewhere */}
        <Link
          href="/"
          onClick={handleLogoClick}
          className="focus-ring flex shrink-0 items-center gap-2 rounded-md"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-aura-accent/25 bg-aura-accent/10 text-aura-accent">
            <Zap size={18} className="fill-aura-accent" />
          </span>
          <span className="font-display text-base font-bold tracking-[0.08em]">
            AURA<span className="text-aura-accent">.</span>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="AURA navigation">
          {LANDING_LINKS.map(({ hash, label }) => (
            <Link
              key={hash}
              href={`/#${hash}`}
              onClick={(e) => handleLandingLink(e, hash)}
              className="focus-ring relative rounded-md px-2.5 py-1.5 text-[13px] font-medium text-white/50 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">

          {/* Enter Arena — always routes to the real arena application */}
          <button
            type="button"
            onClick={() => enterArena()}
            className="focus-ring hidden items-center gap-2 rounded-lg bg-aura-accent px-3 py-2 text-sm font-bold text-white shadow-[0_8px_24px_-10px_rgba(124,92,255,0.7)] transition hover:bg-[#8b70ff] sm:inline-flex"
          >
            {ready ? "Dashboard" : "Enter Arena"}
          </button>

          {address && (
            <span className={cn("hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] md:inline-flex", isXLayerTestnet ? "text-aura-long" : "text-aura-wait")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", isXLayerTestnet ? "bg-aura-long" : "bg-aura-wait")} />
              {isXLayerTestnet ? "X Layer Testnet" : "Wrong network"}
            </span>
          )}

          <button
            onClick={openConnect}
            disabled={connecting}
            aria-label={address ? `Wallet ${shortHash(address, 4)}` : "Connect wallet"}
            title={ready ? "Connected to X Layer Testnet" : address ? "Wallet connection needs attention" : "Connect wallet"}
            className={cn("focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60", ready ? "border-aura-long/35 bg-aura-long/10 hover:bg-aura-long/15" : "border-aura-accent/35 bg-aura-accent/10 hover:bg-aura-accent/20")}
          >
            <Wallet size={15} />
            <span className="mobile-wallet-label">
              {address ? shortHash(address, 4) : connecting ? "Connecting\u2026" : "Connect Wallet"}
            </span>
          </button>

          <button
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-white/[0.1] bg-white/[0.04] text-white/70 lg:hidden"
          >
            {mobileOpen ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav
          className="border-t border-white/[0.06] bg-[#070914] px-4 py-3 lg:hidden"
          aria-label="AURA mobile navigation"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            {/* Enter Arena — prominent at top of mobile menu */}
            <button
              type="button"
              onClick={() => { setMobileOpen(false); enterArena(); }}
              className="focus-ring rounded-md bg-aura-accent/10 px-3 py-2.5 text-left text-sm font-bold text-aura-accent"
            >
              {ready ? "Dashboard" : "Enter Arena"}
            </button>

            {/* Landing section anchors */}
            {LANDING_LINKS.map(({ hash, label }) => (
              <Link
                key={hash}
                href={`/#${hash}`}
                onClick={(e) => handleLandingLink(e, hash)}
                className="focus-ring rounded-md px-3 py-2.5 text-sm font-medium text-white/55 hover:bg-white/[0.04] hover:text-white"
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
