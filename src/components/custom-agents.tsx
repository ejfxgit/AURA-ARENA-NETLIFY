"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  CircleAlert,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { api } from "@/lib/client";
import {
  CUSTOM_AGENT_AVATAR_STYLES,
  CUSTOM_AGENT_DECISION_BEHAVIORS,
  CUSTOM_AGENT_INFORMATION_FOCUSES,
  CUSTOM_AGENT_NEWS_PREFERENCES,
  CUSTOM_AGENT_RISK_STYLES,
  CUSTOM_AGENT_SPECIALTIES,
  CUSTOM_AGENT_TRADING_FOCUSES,
  DEFAULT_CUSTOM_AGENT_DRAFT,
  customAgentAccent,
  customAgentRiskLabel,
  customAgentDecisionBehaviorLabel,
  customAgentSpecialtyLabel,
  customAgentTradingFocusLabel,
} from "@/lib/custom-agents";
import { useWallet } from "@/lib/use-wallet";
import { fmtUsd, shortHash } from "@/lib/utils";
import { fmtAura } from "@/lib/aura-economy";
import { MarketSelect } from "@/components/market-selector";
import { TokenIcon } from "@/components/ui/token-icon";
import { FactorBars } from "@/components/factor-bars";
import { DirectionBadge } from "@/components/ui/direction-badge";
import { Button } from "@/components/ui/button";
import type {
  CustomAgent,
  CustomAgentAnalysis,
  Battle,
  CustomAgentDraft,
  CustomAgentSpecialty,
  CustomAgentDecisionBehavior,
  CustomAgentInformationFocus,
  CustomAgentTradingFocus,
} from "@/lib/types";

type ModalMode = "builder" | "analysis" | null;

function authHeaders(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Authenticated "My Agents" workspace.
 *
 * Personal agents are private to the connected wallet: they are loaded from
 * /api/custom-agents (owner-scoped) and never appear on the public landing or
 * public /agents pages. Creation requires the full wallet authentication flow,
 * which is handled by the arena shell before this component renders.
 */
export function CustomAgents() {
  const wallet = useWallet();
  const session = wallet.session;
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [modal, setModal] = useState<ModalMode>(null);
  const [draft, setDraft] = useState<CustomAgentDraft>(DEFAULT_CUSTOM_AGENT_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [analysisAgent, setAnalysisAgent] = useState<CustomAgent | null>(null);
  const [analysis, setAnalysis] = useState<CustomAgentAnalysis | null>(null);
  // Empty until MarketSelect adopts a default from the real OKX registry. No
  // symbol is hardcoded here.
  const [analysisAsset, setAnalysisAsset] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const queryHandled = useRef(false);

  const loadAgents = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setAgents([]);
      setBattles([]);
      return;
    }
    setLoadingAgents(true);
    try {
      const results = await Promise.allSettled([
        api<{ agents: CustomAgent[] }>("/api/custom-agents", { headers: authHeaders(activeSession) }),
        api<{ battles: Battle[] }>("/api/battles?scope=mine", { headers: authHeaders(activeSession) }),
      ]);
      if (results[0].status === "fulfilled") {
        setAgents(results[0].value.agents);
        setFormError(null);
      } else {
        // A failed load must not render as an empty workspace: without this the
        // "No agents yet" state is indistinguishable from a rejected GET, which
        // hides real 4xx/5xx causes (auth, missing columns) after a reload.
        setAgents([]);
        setFormError(results[0].reason instanceof Error ? results[0].reason.message : "Unable to load your custom agents");
      }
      if (results[1].status === "fulfilled") setBattles(results[1].value.battles);
    } catch {
      setAgents([]);
      setBattles([]);
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  useEffect(() => { void loadAgents(session); }, [loadAgents, session]);

  // ?create=1 opens the builder once the wallet session is ready (the arena
  // shell gates this page behind authentication, so ready follows shortly).
  useEffect(() => {
    if (queryHandled.current || typeof window === "undefined" || !wallet.ready) return;
    if (new URLSearchParams(window.location.search).get("create") !== "1") return;
    queryHandled.current = true;
    setDraft(DEFAULT_CUSTOM_AGENT_DRAFT);
    setEditingId(null);
    setFormError(null);
    setModal("builder");
  }, [wallet.ready]);

  const openCreate = useCallback(() => {
    setDraft(DEFAULT_CUSTOM_AGENT_DRAFT);
    setEditingId(null);
    setFormError(null);
    if (wallet.ready) setModal("builder");
    else wallet.openConnect();
  }, [wallet]);

  const openEdit = useCallback((agent: CustomAgent) => {
    setDraft({
      name: agent.name,
      personalityMood: agent.personalityMood,
      tradingSpecialty: agent.tradingSpecialty,
      riskStyle: agent.riskStyle,
      description: agent.description,
      avatarStyle: agent.avatarStyle,
      tradingFocus: agent.tradingFocus,
      informationFocus: agent.informationFocus,
      newsPreference: agent.newsPreference,
      socialSentiment: agent.socialSentiment,
      onchainActivity: agent.onchainActivity,
      whaleMovements: agent.whaleMovements,
      decisionBehaviors: agent.decisionBehaviors,
      customInstructions: agent.customInstructions,
    });
    setEditingId(agent.id);
    setFormError(null);
    setModal("builder");
  }, []);

  const saveAgent = useCallback(async () => {
    if (!session || !wallet.ready) {
      wallet.openConnect();
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const result = editingId
        ? await api<{ agent: CustomAgent }>(`/api/custom-agents/${editingId}`, {
            method: "PATCH",
            headers: authHeaders(session),
            body: draft,
          })
        : await api<{ agent: CustomAgent }>("/api/custom-agents", {
            method: "POST",
            headers: authHeaders(session),
            body: draft,
          });
      setAgents((current) => editingId
        ? current.map((agent) => agent.id === editingId ? result.agent : agent)
        : [...current, result.agent]);
      setModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save custom agent");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, session, wallet]);

  const deleteAgent = useCallback(async (agent: CustomAgent) => {
    if (!session || !window.confirm(`Delete ${agent.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/custom-agents/${agent.id}`, {
        method: "DELETE",
        headers: authHeaders(session),
      });
      setAgents((current) => current.filter((item) => item.id !== agent.id));
    } catch {
      setFormError("Unable to delete custom agent");
    }
  }, [session]);

  const runAnalysis = useCallback(async () => {
    if (!session || !analysisAgent) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await api<{ analysis: CustomAgentAnalysis }>("/api/custom-agents/analyze", {
        method: "POST",
        headers: authHeaders(session),
        body: { customAgentId: analysisAgent.id, symbol: analysisAsset },
      });
      setAnalysis(result.analysis);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Unable to generate analysis");
    } finally {
      setAnalysisLoading(false);
    }
  }, [analysisAgent, analysisAsset, session]);

  const openAnalysis = useCallback((agent: CustomAgent) => {
    setAnalysisAgent(agent);
    setAnalysis(null);
    setAnalysisError(null);
    // The chosen market is intentionally kept across opens; it is resolved from
    // the live OKX registry, so there is no default symbol to reset to.
    setModal("analysis");
  }, []);

  const performanceFor = useCallback((agent: CustomAgent) => {
    const agentBattles = battles.filter((battle) => battle.customAgentId === agent.id);
    const settled = agentBattles.filter((battle) => battle.settlement_applied);
    const wins = settled.filter((battle) => battle.winner === "AI").length;
    const losses = settled.filter((battle) => battle.winner === "HUMAN").length;
    return {
      battles: agentBattles.length,
      wins,
      losses,
      winRate: wins + losses ? (wins / (wins + losses)) * 100 : 0,
      pnl: settled.reduce((total, battle) => total + battle.ai_pnl, 0),
      recent: agentBattles.slice(0, 2),
    };
  }, [battles]);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-lg border border-dashed border-aura-accent/30 bg-aura-accent/[0.03] p-5 sm:p-6">
        <span className="absolute inset-x-0 top-0 h-px bg-aura-accent/60" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-aura-accent/30 bg-aura-accent/10 text-aura-accent"><Plus size={22} /></span>
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-aura-accent">Custom / private</div>
              <h2 className="mt-1 font-display text-xl font-bold text-white">Build your own agent</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-white/45">Create an agent with your own strategy, personality and edge. It stays private to this wallet and runs on the live market pipeline.</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <Button onClick={openCreate}><Bot size={15} /> Create Agent</Button>
            <span className="text-[10px] text-white/30">{session && wallet.address ? `${wallet.profile?.displayName ?? "AURA account"} / ${shortHash(wallet.address, 4)}` : "Wallet session required"}</span>
          </div>
        </div>
      </section>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white/78">My Agents</h2>
            <p className="mt-1 text-xs text-white/35">{loadingAgents ? "Loading your private agents..." : `${agents.length} private agent${agents.length === 1 ? "" : "s"} / never shown on the public site`}</p>
          </div>
          <button type="button" onClick={openCreate} className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-white/[0.09] bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/65 hover:border-aura-accent/30 hover:text-white"><Plus size={13} /> New agent</button>
        </div>
        {loadingAgents ? (
          <div className="grid min-h-[180px] place-items-center rounded-lg border border-white/[0.08] bg-white/[0.018] text-sm text-white/35"><RefreshCw size={16} className="mr-2 inline animate-spin text-aura-accent" /> Loading your agents...</div>
        ) : agents.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => (
              <CustomAgentCard key={agent.id} agent={agent} performance={performanceFor(agent)} onAnalyze={openAnalysis} onEdit={openEdit} onDelete={deleteAgent} />
            ))}
          </div>
        ) : (
          <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-white/[0.1] bg-white/[0.015] px-5 py-12 text-center">
            <div>
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-white/30"><Bot size={18} /></span>
              <div className="mt-3 text-sm font-semibold text-white/60">No agents yet</div>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-white/32">Build your first private AI trader. It will appear here, in your workspace only.</p>
              <Button className="mt-4" onClick={openCreate}><Plus size={14} /> Create your first agent</Button>
            </div>
          </div>
        )}
      </div>

      {formError && modal !== "builder" && <Notice tone="warning">{formError}</Notice>}

      {modal === "builder" && (
        <Modal title={editingId ? "Edit custom agent" : "Build your own agent"} onClose={() => setModal(null)} wide>
          <div className="grid gap-6 lg:grid-cols-[1fr_0.82fr]">
            <AgentForm draft={draft} setDraft={setDraft} error={formError} saving={saving} editing={Boolean(editingId)} onSave={saveAgent} />
            <AgentPreview draft={draft} />
          </div>
        </Modal>
      )}

      {modal === "analysis" && analysisAgent && (
        <Modal title={`${analysisAgent.name} / live analysis`} onClose={() => setModal(null)} wide>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-5">
            <div><div className="terminal-label">Existing market pipeline</div><p className="mt-2 text-sm text-white/50">Live market data, evidence and deterministic factor scoring remain unchanged.</p></div>
            <div className="flex items-center gap-2"><MarketSelect value={analysisAsset} onChange={setAnalysisAsset} ariaLabel="Market to analyze" /><Button size="sm" onClick={runAnalysis} disabled={analysisLoading || !analysisAsset}>{analysisLoading ? <RefreshCw size={14} className="animate-spin" /> : <Eye size={14} />} {analysisLoading ? "Analyzing" : "Run analysis"}</Button></div>
          </div>
          {analysisError && <Notice tone="warning">{analysisError}</Notice>}
          {!analysis && !analysisLoading && !analysisError && <div className="grid min-h-48 place-items-center text-center text-sm text-white/35">Choose a market and run the analysis.</div>}
          {analysisLoading && <div className="grid min-h-48 place-items-center gap-2 text-sm text-white/35"><RefreshCw size={18} className="animate-spin text-aura-accent" /> Reading the market...</div>}
          {analysis && !analysisLoading && <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><section className="landing-terminal p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><TokenIcon symbol={analysis.asset.split("-")[0]} size={22} /><div className="terminal-label">{analysis.asset} / {customAgentSpecialtyLabel(analysisAgent.tradingSpecialty)}</div></div><div className="mono mt-3 text-4xl font-bold text-aura-accent">{analysis.confidence}%</div></div><DirectionBadge direction={analysis.direction} size="lg" /></div><p className="mt-5 text-sm leading-6 text-white/70">{analysis.summary}</p><div className="mt-5 flex items-center gap-2 text-xs text-white/35"><ShieldCheck size={14} className="text-aura-long" /> {analysis.generatedBy === "llm" ? "Agent intelligence layer" : "Deterministic fallback voice"} / {customAgentRiskLabel(analysisAgent.riskStyle)} risk</div><div className="mt-4 flex flex-wrap gap-1.5">{analysis.configurationSummary.map((item) => <span key={item} className="rounded-full border border-aura-accent/20 bg-aura-accent/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-aura-accent">{item}</span>)}</div>{analysis.unavailableFocus.length > 0 && <Notice tone="warning">Unavailable in the current market pipeline: {analysis.unavailableFocus.join(", ")}. No synthetic evidence was used.</Notice>}</section><section className="landing-terminal p-5"><div className="terminal-label mb-4">Configured factor weights</div><FactorBars factors={analysis.factors} accent={customAgentAccent(analysisAgent.avatarStyle)} /><div className="mt-5 border-t border-white/[0.07] pt-4"><div className="terminal-label mb-3">Evidence available</div><div className="grid gap-2">{analysis.evidence.filter((item) => item.available).slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-2 text-xs text-white/55"><Check size={13} className="text-aura-long" />{item.title}</div>)}</div></div></section></div>}
        </Modal>
      )}
    </div>
  );
}

function CustomAgentCard({ agent, performance, onAnalyze, onEdit, onDelete }: { agent: CustomAgent; performance: { battles: number; wins: number; losses: number; winRate: number; pnl: number; recent: Battle[] }; onAnalyze: (agent: CustomAgent) => void; onEdit: (agent: CustomAgent) => void; onDelete: (agent: CustomAgent) => void }) {
  const accent = customAgentAccent(agent.avatarStyle);
  return (
    <article className="relative flex min-w-0 flex-col overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.018] p-5" style={{ "--agent-accent": accent } as React.CSSProperties}>
      <span className="absolute inset-x-0 top-0 h-px bg-[var(--agent-accent)]" />
      <div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-2xl font-bold" style={{ color: accent }}>{agent.name.slice(0, 1).toUpperCase()}</span><span className="terminal-label" style={{ color: accent }}>YOUR AGENT</span></div>
      <h3 className="mt-5 font-display text-2xl font-bold" style={{ color: accent }}>{agent.name}</h3>
      <p className="mt-1 text-sm font-semibold text-white/65">{customAgentSpecialtyLabel(agent.tradingSpecialty)} / {customAgentRiskLabel(agent.riskStyle)}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">{agent.tradingFocus.slice(0, 4).map((focus) => <span key={focus} className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-white/42">{customAgentTradingFocusLabel(focus)}</span>)}</div>
      <p className="mt-3 text-sm leading-6 text-white/50">{agent.description}</p>
      <blockquote className="mt-4 flex flex-1 gap-2 border-l border-white/[0.12] pl-3 text-sm italic leading-6 text-white/65">{agent.personalityMood}</blockquote>
      <div className="mt-4 grid grid-cols-4 border-y border-white/[0.07] py-3 text-center"><Metric label="Battles" value={String(performance.battles)} /><Metric label="Win rate" value={performance.wins + performance.losses ? `${performance.winRate.toFixed(1)}%` : "-"} bordered /><Metric label="AI P&L" value={performance.battles ? fmtAura(performance.pnl, { sign: true }) : "-"} bordered /><Metric label="Access" value="PRIVATE" bordered /></div>
      {performance.recent.length > 0 && <div className="mt-3 flex items-center gap-2 text-[10px] text-white/32"><BarChart3 size={12} className="text-aura-accent" /> {performance.recent.length} recent battle{performance.recent.length === 1 ? "" : "s"} in your history</div>}
      <div className="mt-4 flex flex-wrap items-center gap-2"><Link href={`/arena/battles?agent=custom:${agent.id}`} className="focus-ring inline-flex items-center gap-1.5 rounded bg-aura-accent px-3 py-2 text-xs font-bold text-white hover:bg-[#8b70ff]"><Swords size={14} /> Battle <ArrowRight size={13} /></Link><button type="button" onClick={() => onAnalyze(agent)} title="Run market analysis" className="focus-ring inline-flex items-center gap-1.5 rounded border border-white/[0.09] px-3 py-2 text-xs font-semibold text-white/65 transition-colors hover:text-aura-accent"><Eye size={14} /> Analyze</button><IconButton label="Edit agent" onClick={() => onEdit(agent)}><Pencil size={14} /></IconButton><IconButton label="Delete agent" onClick={() => onDelete(agent)}><Trash2 size={14} /></IconButton></div>
    </article>
  );
}


function Metric({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return <div className={bordered ? "border-l border-white/[0.07]" : ""}><div className="mono text-[11px] font-bold text-white/75">{value}</div><div className="terminal-label mt-1">{label}</div></div>;
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-white/45 hover:border-white/[0.16] hover:text-white">{children}</button>;
}

function AgentForm({ draft, setDraft, error, saving, editing, onSave }: { draft: CustomAgentDraft; setDraft: React.Dispatch<React.SetStateAction<CustomAgentDraft>>; error: string | null; saving: boolean; editing: boolean; onSave: () => void }) {
  const update = <K extends keyof CustomAgentDraft>(key: K, value: CustomAgentDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleArray = <T extends string>(key: "tradingFocus" | "informationFocus" | "decisionBehaviors", value: T) => {
    setDraft((current) => {
      const values = current[key] as T[];
      if (values.includes(value) && values.length === 1) return current;
      const limit = key === "tradingFocus" ? 6 : key === "informationFocus" ? 8 : 4;
      if (!values.includes(value) && values.length >= limit) return current;
      let next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      if (key === "decisionBehaviors" && value === "TRADE_FREQUENTLY") next = next.filter((item) => item !== "TRADE_SELECTIVELY");
      if (key === "decisionBehaviors" && value === "TRADE_SELECTIVELY") next = next.filter((item) => item !== "TRADE_FREQUENTLY");
      return { ...current, [key]: next };
    });
  };

  return <div className="space-y-5">
    <FormSection title="Identity">
      <label className="grid gap-1.5 text-xs font-semibold text-white/65">Agent name<input value={draft.name} onChange={(event) => update("name", event.target.value)} maxLength={32} placeholder="e.g. SABLE" className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white" /></label>
      <label className="grid gap-1.5 text-xs font-semibold text-white/65">Personality / mood<input value={draft.personalityMood} onChange={(event) => update("personalityMood", event.target.value)} maxLength={80} placeholder="Calm, skeptical, patient" className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white" /></label>
      <label className="grid gap-1.5 text-xs font-semibold text-white/65">Short personality description<textarea value={draft.description} onChange={(event) => update("description", event.target.value)} maxLength={240} rows={3} placeholder="What makes this agent different?" className="focus-ring resize-none rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm leading-6 text-white" /></label>
      <div><div className="mb-1.5 text-xs font-semibold text-white/65">Avatar / style</div><div className="grid grid-cols-3 gap-2 sm:grid-cols-5"><button type="button" aria-pressed={draft.avatarStyle === null} onClick={() => update("avatarStyle", null)} className={`focus-ring grid place-items-center gap-1 rounded-lg border px-2 py-2 ${draft.avatarStyle === null ? "border-white/30 bg-white/[0.08]" : "border-white/[0.08] bg-white/[0.015]"}`}><span className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.1] text-xs font-bold text-aura-accent">A</span><span className="text-[9px] text-white/40">Default</span></button>{CUSTOM_AGENT_AVATAR_STYLES.map((style) => <button key={style.value} type="button" aria-pressed={draft.avatarStyle === style.value} onClick={() => update("avatarStyle", style.value)} className={`focus-ring grid place-items-center gap-1 rounded-lg border px-2 py-2 ${draft.avatarStyle === style.value ? "border-white/30 bg-white/[0.08]" : "border-white/[0.08] bg-white/[0.015]"}`}><span className="grid h-7 w-7 place-items-center rounded-md border border-white/[0.1] text-xs font-bold" style={{ color: style.accent }}>{style.label.slice(0, 1)}</span><span className="text-[9px] text-white/40">{style.label}</span></button>)}</div></div>
    </FormSection>

    <FormSection title="Strategy">
      <label className="grid gap-1.5 text-xs font-semibold text-white/65">Primary specialty<select value={draft.tradingSpecialty} onChange={(event) => update("tradingSpecialty", event.target.value as CustomAgentSpecialty)} className="focus-ring rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm text-white">{CUSTOM_AGENT_SPECIALTIES.map((item) => <option key={item.value} value={item.value}>{item.label} / {item.detail}</option>)}</select></label>
      <ChoiceGrid label="Trading approach" items={CUSTOM_AGENT_TRADING_FOCUSES} selected={draft.tradingFocus} onToggle={(value) => toggleArray<CustomAgentTradingFocus>("tradingFocus", value)} />
      <ChoiceGrid label="What should this agent focus on?" items={CUSTOM_AGENT_INFORMATION_FOCUSES} selected={draft.informationFocus} onToggle={(value) => toggleArray<CustomAgentInformationFocus>("informationFocus", value)} />
      <div><div className="mb-1.5 text-xs font-semibold text-white/65">News preference</div><div className="grid grid-cols-3 gap-2">{CUSTOM_AGENT_NEWS_PREFERENCES.map((item) => <button key={item.value} type="button" aria-pressed={draft.newsPreference === item.value} onClick={() => update("newsPreference", item.value)} className={`focus-ring rounded-lg border px-2 py-2.5 text-xs font-semibold ${draft.newsPreference === item.value ? "border-aura-accent/50 bg-aura-accent/10 text-white" : "border-white/[0.08] bg-white/[0.015] text-white/45"}`}>{item.label}</button>)}</div><p className="mt-2 text-[10px] leading-4 text-white/30">Dedicated news and macro feeds are marked unavailable when the current evidence pipeline cannot supply them.</p></div>
      <div className="grid gap-2 sm:grid-cols-3"><BooleanChoice label="Social sentiment" active={draft.socialSentiment} onClick={() => update("socialSentiment", !draft.socialSentiment)} /><BooleanChoice label="On-chain activity" active={draft.onchainActivity} onClick={() => update("onchainActivity", !draft.onchainActivity)} /><BooleanChoice label="Whale movements" active={draft.whaleMovements} onClick={() => update("whaleMovements", !draft.whaleMovements)} /></div>
    </FormSection>

    <FormSection title="Risk">
      <div className="grid grid-cols-3 gap-2">{CUSTOM_AGENT_RISK_STYLES.map((item) => <button key={item.value} type="button" aria-pressed={draft.riskStyle === item.value} onClick={() => update("riskStyle", item.value)} className={`focus-ring rounded-lg border px-2 py-2.5 text-xs font-semibold ${draft.riskStyle === item.value ? "border-aura-accent/50 bg-aura-accent/10 text-white" : "border-white/[0.08] bg-white/[0.015] text-white/45"}`}>{item.label}</button>)}</div>
    </FormSection>

    <FormSection title="Behavior">
      <ChoiceGrid label="Decision behavior" items={CUSTOM_AGENT_DECISION_BEHAVIORS} selected={draft.decisionBehaviors} onToggle={(value) => toggleArray<CustomAgentDecisionBehavior>("decisionBehaviors", value)} />
    </FormSection>

    <FormSection title="Custom instructions">
      <label className="grid gap-1.5 text-xs font-semibold text-white/65">Custom strategy instructions<textarea value={draft.customInstructions} onChange={(event) => update("customInstructions", event.target.value)} maxLength={600} rows={5} placeholder="Focus on BTC momentum and volume. Ignore weak signals. Prefer confirmed breakouts. Avoid trades during unclear market conditions." className="focus-ring resize-none rounded-lg border border-white/[0.1] bg-[#070a12] px-3 py-2.5 text-sm leading-6 text-white" /><span className="text-right text-[9px] font-normal text-white/25">{draft.customInstructions.length}/600</span></label>
    </FormSection>

    {error && <Notice tone="warning">{error}</Notice>}
    <Button className="w-full" disabled={saving} onClick={onSave}>{saving ? <><RefreshCw size={15} className="animate-spin" /> Saving...</> : <><Save size={15} /> {editing ? "Save changes" : "Create Agent"}</>}</Button>
  </div>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4 border-b border-white/[0.07] pb-5 last:border-0"><div className="text-[9px] font-bold uppercase tracking-[0.18em] text-aura-accent">{title}</div>{children}</section>;
}

function ChoiceGrid<T extends string>({ label, items, selected, onToggle }: { label: string; items: ReadonlyArray<{ value: T; label: string }>; selected: readonly T[]; onToggle: (value: T) => void }) {
  return <div><div className="mb-1.5 text-xs font-semibold text-white/65">{label}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{items.map((item) => { const active = selected.includes(item.value); return <button key={item.value} type="button" aria-pressed={active} onClick={() => onToggle(item.value)} className={`focus-ring min-h-9 rounded-lg border px-2 py-2 text-left text-[10px] font-semibold ${active ? "border-aura-accent/45 bg-aura-accent/[0.09] text-white" : "border-white/[0.08] bg-white/[0.015] text-white/42"}`}>{active && <Check size={11} className="mr-1 inline text-aura-accent" />}{item.label}</button>; })}</div></div>;
}

function BooleanChoice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" role="checkbox" aria-checked={active} onClick={onClick} className={`focus-ring flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold ${active ? "border-aura-accent/45 bg-aura-accent/[0.09] text-white" : "border-white/[0.08] bg-white/[0.015] text-white/42"}`}><span className={`grid h-4 w-4 place-items-center rounded border ${active ? "border-aura-accent bg-aura-accent text-white" : "border-white/20"}`}>{active && <Check size={11} />}</span>{label}</button>;
}

function AgentPreview({ draft }: { draft: CustomAgentDraft }) {
  const accent = customAgentAccent(draft.avatarStyle);
  return <div className="landing-terminal h-fit p-5 sm:p-6"><div className="terminal-label">Live competitor preview</div><div className="mt-5 flex items-start justify-between gap-4"><span className="grid h-14 w-14 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025] font-display text-2xl font-bold" style={{ color: accent }}>{(draft.name || "A").slice(0, 1).toUpperCase()}</span><span className="terminal-label" style={{ color: accent }}>CUSTOM / PRIVATE</span></div><h3 className="mt-6 font-display text-2xl font-bold" style={{ color: accent }}>{draft.name || "YOUR AGENT"}</h3><p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/45">{customAgentSpecialtyLabel(draft.tradingSpecialty)} / {customAgentRiskLabel(draft.riskStyle)}</p><p className="mt-4 text-sm leading-6 text-white/55">{draft.description || "Your short personality description will appear here."}</p><blockquote className="mt-5 border-l border-white/[0.12] pl-3 text-sm italic leading-6 text-white/65">{draft.personalityMood || "Your agent mood will shape its voice."}</blockquote><div className="mt-5 flex flex-wrap gap-1.5">{draft.tradingFocus.slice(0, 5).map((focus) => <span key={focus} className="rounded-full border border-white/[0.08] px-2 py-1 text-[9px] font-semibold text-white/45">{customAgentTradingFocusLabel(focus)}</span>)}</div><div className="mt-5 grid grid-cols-3 border-y border-white/[0.07] py-4 text-center"><Metric label="Owner" value="YOU" /><Metric label="Pipeline" value="LIVE" bordered /><Metric label="Battle" value="READY" bordered /></div>{draft.customInstructions && <div className="mt-5 border-t border-white/[0.07] pt-4"><div className="terminal-label">Instructions</div><p className="mt-2 text-xs leading-5 text-white/45">{draft.customInstructions}</p></div>}</div>;
}

function Notice({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" }) {
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${tone === "warning" ? "border-aura-wait/25 bg-aura-wait/10 text-aura-wait" : "border-white/[0.08] bg-white/[0.025] text-white/45"}`}><CircleAlert size={14} className="mt-0.5 shrink-0" />{children}</div>;
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="fixed inset-0 z-[200] grid items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm sm:py-14"><div className={`relative my-auto w-full rounded-lg border border-white/[0.1] bg-[#090c16] shadow-2xl ${wide ? "max-w-4xl" : "max-w-md"}`}><div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6"><div><div className="section-kicker">AURA ARENA</div><h2 className="mt-1 font-display text-lg font-bold">{title}</h2></div><button type="button" title="Close" aria-label="Close" onClick={onClose} className="focus-ring grid h-8 w-8 place-items-center rounded-lg border border-white/[0.08] text-white/45 hover:text-white"><X size={16} /></button></div><div className="p-5 sm:p-6">{children}</div></div></div>;
}
