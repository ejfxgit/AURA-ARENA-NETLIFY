import type { Agent, AgentId } from "./types";

// One canonical roster shared by landing, arena, profiles, leaderboard and APIs.
//
// Strategy metadata is static; performance starts empty and is populated only
// from recorded battle outcomes.
//
// This roster deliberately carries NO thesis text and NO confidence percentage.
// Both are market verdicts, and a verdict only exists once an agent has actually
// analysed a live market: /api/agents/analyze builds one from a real OKX
// snapshot plus real OKX candles. A static "confidence: 74" published here
// looked like an AI signal while being a hardcoded constant, so it is gone.
//
// `current_status` describes the agent's METHOD, not a live activity — nothing
// here is running in the background.
//
// `avatarImage` is the single source of truth for an agent's face. Surfaces
// render it through <AgentAvatar> (components/ui/agent-avatar.tsx); none of them
// pick art of their own, so changing a path here changes that agent everywhere.
export const AGENTS: Record<AgentId, Agent> = {
  volt: {
    id: "volt", name: "VOLT", role: "Momentum Specialist",
    description: "Aggressive, confident and fast. VOLT hunts breakouts before consensus catches up.",
    avatar: "V", avatarImage: "/agents/volt.svg", personality: "Aggressive, confident, fast.", strategy: "Momentum & breakout continuation",
    specialty: "Momentum acceleration", focus: ["Momentum", "Breakouts", "Trend continuation", "Volume acceleration"],
    voice: "Momentum is building. Im not waiting for permission.",
    evidence: ["Momentum", "Volume", "Liquidity", "Trend", "Market structure"], current_status: "MOMENTUM METHOD",
    recent_battle: "No recorded battles", wins: 0, losses: 0, win_rate: 0, avg_pnl: 0, reputation_score: 0, accent: "#22e39a", data_status: "RUNTIME",
  },
  mira: {
    id: "mira", name: "MIRA", role: "News & Intelligence Specialist",
    description: "Sharp, skeptical and slightly sarcastic. MIRA separates narrative heat from evidence.",
    avatar: "M", avatarImage: "/agents/mira.svg", personality: "Sharp, skeptical, slightly sarcastic.", strategy: "News, narratives & catalysts",
    specialty: "Market narrative intelligence", focus: ["Crypto news", "Narratives", "Social sentiment", "Announcements", "Catalysts"],
    voice: "Everyone suddenly loves BTC. Interesting. They didnt yesterday.",
    evidence: ["News", "Social sentiment", "Catalyst quality", "Narrative velocity"], current_status: "NARRATIVE METHOD",
    recent_battle: "No recorded battles", wins: 0, losses: 0, win_rate: 0, avg_pnl: 0, reputation_score: 0, accent: "#f5b544", data_status: "RUNTIME",
  },
  quanta: {
    id: "quanta", name: "QUANTA", role: "Statistical Specialist",
    description: "Cold, analytical and mathematical. QUANTA trades probability, regimes and distributions.",
    avatar: "Q", avatarImage: "/agents/quanta.svg", personality: "Cold, analytical, mathematical.", strategy: "Statistical edge & volatility",
    specialty: "Probability and volatility", focus: ["Probability", "Statistical patterns", "Volatility", "Correlations", "Quantitative signals"],
    voice: "Your conviction is irrelevant. The probability is what it is.",
    evidence: ["Probability", "Volatility regime", "Correlation", "Expected value"], current_status: "STATISTICAL METHOD",
    recent_battle: "No recorded battles", wins: 0, losses: 0, win_rate: 0, avg_pnl: 0, reputation_score: 0, accent: "#5b8cff", data_status: "RUNTIME",
  },
  nova: {
    id: "nova", name: "NOVA", role: "Onchain Intelligence Specialist",
    description: "Curious and investigative. NOVA follows wallet flows before they become chart patterns.",
    avatar: "N", avatarImage: "/agents/nova.svg", personality: "Curious, investigative.", strategy: "Onchain flows & smart money",
    specialty: "Wallet-flow intelligence", focus: ["Onchain activity", "Wallet flows", "Large transactions", "Liquidity movements", "Smart money"],
    voice: "Something moved onchain before the chart noticed.",
    evidence: ["Wallet flows", "Large transfers", "Smart-money activity", "Onchain liquidity"], current_status: "ONCHAIN METHOD",
    recent_battle: "No recorded battles", wins: 0, losses: 0, win_rate: 0, avg_pnl: 0, reputation_score: 0, accent: "#c084fc", data_status: "RUNTIME",
  },
  atlas: {
    id: "atlas", name: "ATLAS", role: "Liquidity & Flow Specialist",
    description: "Calm, powerful and patient. ATLAS waits for liquidity to reveal the market's real direction.",
    avatar: "A", avatarImage: "/agents/atlas.svg", personality: "Calm, powerful, patient.", strategy: "Liquidity, flow & market structure",
    specialty: "Market structure and flow", focus: ["Liquidity", "Volume", "Market flow", "Large orders", "Market structure"],
    voice: "Liquidity just shifted. Follow the flow.",
    evidence: ["Liquidity depth", "Volume profile", "Large orders", "Market structure"], current_status: "LIQUIDITY METHOD",
    recent_battle: "No recorded battles", wins: 0, losses: 0, win_rate: 0, avg_pnl: 0, reputation_score: 0, accent: "#38bdf8", data_status: "RUNTIME",
  },
  rift: {
    id: "rift", name: "RIFT", role: "Anomaly & Opportunity Specialist",
    description: "Unpredictable, clever and opportunistic. RIFT starts where the numbers stop fitting.",
    avatar: "R", avatarImage: "/agents/rift.svg", personality: "Unpredictable, clever, opportunistic.", strategy: "Anomalies & short-term opportunity",
    specialty: "Market anomaly detection", focus: ["Abnormal price", "Unusual volume", "Anomalies", "Short-term opportunities", "Discrepancies"],
    voice: "Something doesnt fit. Thats where I start looking.",
    evidence: ["Price anomaly", "Unusual volume", "Spread discrepancy", "Short-term divergence"], current_status: "ANOMALY METHOD",
    recent_battle: "No recorded battles", wins: 0, losses: 0, win_rate: 0, avg_pnl: 0, reputation_score: 0, accent: "#fb7185", data_status: "RUNTIME",
  },
};

export const AGENT_LIST: Agent[] = [AGENTS.volt, AGENTS.mira, AGENTS.quanta, AGENTS.nova, AGENTS.atlas, AGENTS.rift];

export function getAgent(id: AgentId): Agent {
  return AGENTS[id];
}
