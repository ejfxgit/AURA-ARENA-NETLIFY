import { getAgent } from "./agents";
import { customAgentSpecialtyLabel, customAgentTradingFocusLabel } from "./custom-agents";
import type { AgentId, Battle, CustomAgentBattleSnapshot } from "./types";

export interface BattleAgentView {
  id: string;
  name: string;
  avatar: string;
  /**
   * Roster art for a built-in specialist. Null for user-built agents, which
   * have no commissioned identity and keep their initial.
   */
  avatarImage: string | null;
  accent: string;
  role: string;
  specialty: string;
  strategy: string;
  description: string;
  personality: string;
  voice: string;
  isCustom: boolean;
}

function customBattleAgent(snapshot: CustomAgentBattleSnapshot): BattleAgentView {
  return {
    id: snapshot.id,
    name: snapshot.name,
    avatar: snapshot.name.slice(0, 1).toUpperCase(),
    avatarImage: null,
    accent: snapshot.accent,
    role: "Custom private agent",
    specialty: customAgentSpecialtyLabel(snapshot.tradingSpecialty),
    strategy: snapshot.customInstructions || snapshot.tradingFocus.map(customAgentTradingFocusLabel).join(", "),
    description: snapshot.description,
    personality: snapshot.personalityMood,
    voice: snapshot.personalityMood,
    isCustom: true,
  };
}

export function isBuiltInAgentId(agentId: string): agentId is AgentId {
  return ["volt", "mira", "quanta", "nova", "atlas", "rift"].includes(agentId);
}

export function getBattleAgent(battle: Pick<Battle, "agentId" | "customAgent">): BattleAgentView {
  if (battle.agentId === "custom" && battle.customAgent) return customBattleAgent(battle.customAgent);
  if (isBuiltInAgentId(battle.agentId)) {
    const agent = getAgent(battle.agentId);
    return { ...agent, isCustom: false };
  }
  return {
    id: "custom",
    name: "Private custom agent",
    avatar: "A",
    avatarImage: null,
    accent: "#7c5cff",
    role: "Custom private agent",
    specialty: "Historical configuration unavailable",
    strategy: "Historical configuration unavailable",
    description: "This private agent is no longer available for new battles.",
    personality: "Private custom agent",
    voice: "Private custom agent",
    isCustom: true,
  };
}
