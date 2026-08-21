"use client";

import { Download, Share2 } from "lucide-react";
import { getBattleAgent } from "@/lib/battle-agents";
import { fmtAura } from "@/lib/aura-economy";
import { cn, formatPair, fmtPrice } from "@/lib/utils";
import type { Battle } from "@/lib/types";
import { Button } from "@/components/ui/button";

/** The only URL that ever appears in any share output. No paths, no battle IDs. */
const SITE_URL = "https://auraarena.netlify.app";

export function ShareCard({ battle }: { battle: Battle }) {
  const humanWon = battle.winner === "HUMAN";
  const result = humanWon ? "HUMAN WON" : battle.winner === "AI" ? "AI WON" : "DRAW";
  const agent = getBattleAgent(battle);

  /**
   * Renders the P&L result card onto a canvas and returns it.
   * No URL appears anywhere on the image.
   */
  function buildCanvas(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Purple radial glow (top-right)
    const glow = ctx.createRadialGradient(1000, 0, 20, 1000, 0, 620);
    glow.addColorStop(0, "rgba(124,92,255,0.38)");
    glow.addColorStop(1, "rgba(5,7,13,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle bottom-left accent
    const glow2 = ctx.createRadialGradient(0, 675, 0, 0, 675, 400);
    glow2.addColorStop(0, "rgba(34,227,154,0.10)");
    glow2.addColorStop(1, "rgba(5,7,13,0)");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ── Header ───────────────────────────────────────────────────────────────
    ctx.fillStyle = "#7c5cff";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText("AURA ARENA", 72, 86);

    ctx.fillStyle = "#7f8798";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText("HUMAN vs AI · LIVE TRADING BATTLE", 72, 120);

    // Thin divider line
    ctx.strokeStyle = "rgba(124,92,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, 140);
    ctx.lineTo(1128, 140);
    ctx.stroke();

    // ── Result headline ───────────────────────────────────────────────────────
    ctx.fillStyle = humanWon ? "#22e39a" : battle.winner === "AI" ? "#ff4d5e" : "#f5b544";
    ctx.font = "800 72px system-ui, sans-serif";
    ctx.fillText(result, 72, 230);

    ctx.fillStyle = "#e7ecf5";
    ctx.font = "700 36px system-ui, sans-serif";
    ctx.fillText(formatPair(battle.asset), 72, 282);

    ctx.fillStyle = "#7f8798";
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText(`AI AGENT: ${agent.name}`, 72, 318);

    // ── Stats divider ─────────────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, 344);
    ctx.lineTo(1128, 344);
    ctx.stroke();

    // ── P&L / Confidence row labels ───────────────────────────────────────────
    const col1 = 72;
    const col2 = 400;
    const col3 = 728;

    ctx.fillStyle = "#7f8798";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillText("AI P&L", col1, 378);
    ctx.fillText("HUMAN P&L", col2, 378);
    ctx.fillText("AI CONFIDENCE", col3, 378);

    // Values
    ctx.fillStyle = battle.ai_pnl >= 0 ? "#22e39a" : "#ff4d5e";
    ctx.font = "800 36px ui-monospace, monospace";
    ctx.fillText(fmtAura(battle.ai_pnl, { sign: true }), col1, 424);

    ctx.fillStyle = battle.human_pnl >= 0 ? "#22e39a" : "#ff4d5e";
    ctx.fillText(fmtAura(battle.human_pnl, { sign: true }), col2, 424);

    ctx.fillStyle = "#e7ecf5";
    ctx.font = "700 28px ui-monospace, monospace";
    ctx.fillText(`${battle.ai_confidence_before}% → ${battle.ai_confidence_after}%`, col3, 424);

    // ── Positions + stake row ─────────────────────────────────────────────────
    ctx.fillStyle = "#7f8798";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillText("AI POSITION", col1, 464);
    ctx.fillText("HUMAN POSITION", col2, 464);
    ctx.fillText("STAKE · LEVERAGE", col3, 464);

    ctx.fillStyle = "#e7ecf5";
    ctx.font = "700 24px system-ui, sans-serif";
    ctx.fillText(`${battle.ai_direction}`, col1, 496);
    ctx.fillText(`${battle.human_direction}`, col2, 496);
    ctx.fillText(`${fmtAura(battle.human_amount)} · ${battle.leverage}x`, col3, 496);

    // ── Thesis row ────────────────────────────────────────────────────────────
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, 522);
    ctx.lineTo(1128, 522);
    ctx.stroke();

    ctx.fillStyle = "#7f8798";
    ctx.font = "600 15px system-ui, sans-serif";
    ctx.fillText("AI THESIS", col1, 552);

    ctx.fillStyle = "#e7ecf5";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText(`${battle.thesis.direction} → ${battle.ai_direction}`, col1, 584);

    // ── CTA (no URL) ──────────────────────────────────────────────────────────
    ctx.fillStyle = "#7f8798";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText("The machine has made its move. Can you beat the AI?", 72, 640);

    return canvas;
  }

  /**
   * Builds the premium X caption from real battle values.
   * No battle ID. No localhost. Only SITE_URL at the end.
   */
  function buildCaption(): string {
    const aiPnl = fmtAura(battle.ai_pnl, { sign: true });
    const humanPnl = fmtAura(battle.human_pnl, { sign: true });
    const market = formatPair(battle.asset);
    const stake = fmtAura(battle.human_amount);

    return [
      `⚔️ AURA ARENA — HUMAN vs AI`,
      ``,
      `🤖 ${agent.name} · ${result}`,
      `📊 ${market}`,
      ``,
      `AI: ${battle.ai_direction} · ${aiPnl}`,
      `Human: ${battle.human_direction} · ${humanPnl}`,
      ``,
      `⚡ AI Confidence: ${battle.ai_confidence_before}% → ${battle.ai_confidence_after}%`,
      `💰 Stake: ${stake} AURA · ${battle.leverage}x`,
      ``,
      `The machine has made its move.`,
      `Can you beat the AI?`,
      ``,
      SITE_URL,
    ].join("\n");
  }

  /**
   * Share button handler:
   * 1. Triggers immediate PNG download of the P&L card.
   * 2. Opens X/Twitter compose directly in a new tab with the premium caption.
   * Never calls navigator.share(). Never opens the OS share panel.
   */
  function shareOnX() {
    // Step 1 — download the card so the user has the image to attach manually
    const canvas = buildCanvas();
    const link = document.createElement("a");
    link.download = `aura-arena-${battle.asset.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    // Step 2 — open X compose in new tab with the full premium caption
    const caption = buildCaption();
    // X intent: text only (X Web intent cannot programmatically attach files)
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  /** Standalone download button — same card, no share panel. */
  function downloadCard() {
    const canvas = buildCanvas();
    const link = document.createElement("a");
    link.download = `aura-arena-${battle.asset.toLowerCase().replace(/[^a-z0-9]/g, "-")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-[#070a12]">
      <div className="border-b border-white/[0.07] bg-[radial-gradient(circle_at_100%_0%,rgba(124,92,255,0.16),transparent_46%)] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-aura-accent">
            AURA ARENA · HUMAN vs AI
          </div>
          <div className="mono text-[10px] text-white/30">1200 × 675</div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div
              className={cn(
                "mt-2 font-display text-2xl font-bold",
                humanWon
                  ? "text-aura-long"
                  : battle.winner === "AI"
                    ? "text-aura-short"
                    : "text-aura-wait",
              )}
            >
              {result}
            </div>
            <div className="mt-1 text-sm text-white/60">
              {battle.asset} · {agent.name} vs HUMAN
            </div>
            <div className="mono mt-2 text-xs text-white/45">
              AI {battle.ai_direction} · Human {battle.human_direction} · Confidence{" "}
              {battle.ai_confidence_before}% → {battle.ai_confidence_after}%
            </div>
            <div className="mono mt-2 text-xs text-white/45">
              AI {fmtAura(battle.ai_amount)} · Human {fmtAura(battle.human_amount)} ·{" "}
              {battle.leverage}x · Entry {fmtPrice(battle.entry_price)} · Settlement{" "}
              {battle.exit_price == null ? "—" : fmtPrice(battle.exit_price)}
            </div>
            <div className="mono mt-2 text-sm text-white/70">
              AI {fmtAura(battle.ai_pnl, { sign: true })}{" "}
              <span className="text-white/25">·</span> Human{" "}
              {fmtAura(battle.human_pnl, { sign: true })}
            </div>
            <div className="mt-2 text-[11px] text-white/30">
              Share downloads the card image, then opens X with the caption pre-filled.
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={downloadCard}
              title="Download P&L card as PNG"
            >
              <Download size={15} /> Card
            </Button>
            <Button
              size="sm"
              onClick={shareOnX}
              title="Download card + open X/Twitter to share"
            >
              <Share2 size={15} /> Share
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
