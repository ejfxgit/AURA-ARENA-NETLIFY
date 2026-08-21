import type { Battle, Challenge, DemoAccount } from "./types";

// In-memory store. This keeps the full MVP flow working with zero external
// dependencies (reliable demo mode). Swap for Supabase by implementing the
// same interface; API routes only touch these functions.

interface DB {
  battles: Map<string, Battle>;
  accounts: Map<string, DemoAccount>;
  agentStats: Map<Battle["agentId"], AgentArenaStats>;
}

export interface AgentArenaStats {
  wins: number;
  losses: number;
  realized_pnl: number;
  valid_challenges: number;
  defended_challenges: number;
}

const g = globalThis as unknown as { __auraDB?: DB };
const db: DB =
  g.__auraDB ??
  (g.__auraDB = {
    battles: new Map(),
    accounts: new Map(),
    agentStats: new Map(),
  });
db.agentStats ??= new Map();

const STARTING_BALANCE = 800;

export function getOrCreateAccount(userId: string): DemoAccount {
  let acc = db.accounts.get(userId);
  if (!acc) {
    acc = {
      userId,
      starting_balance: STARTING_BALANCE,
      current_balance: STARTING_BALANCE,
      realized_pnl: 0,
      unrealized_pnl: 0,
      total_battles: 0,
      wins: 0,
      losses: 0,
      valid_challenges: 0,
      invalid_challenges: 0,
      aura_withdrawn_total: 0,
    };
    db.accounts.set(userId, acc);
  }
  acc.valid_challenges ??= 0;
  acc.invalid_challenges ??= 0;
  return acc;
}

export function saveAccount(acc: DemoAccount) {
  db.accounts.set(acc.userId, acc);
}

export function listAccounts(): DemoAccount[] {
  return Array.from(db.accounts.values());
}

export function saveBattle(b: Battle) {
  db.battles.set(b.id, b);
}

export function getBattle(id: string): Battle | undefined {
  return db.battles.get(id);
}

export function listBattles(filter?: { userId?: string; status?: string }): Battle[] {
  let all = Array.from(db.battles.values());
  if (filter?.userId) all = all.filter((b) => b.userId === filter.userId);
  if (filter?.status) all = all.filter((b) => b.status === filter.status);
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function addChallenge(battleId: string, challenge: Challenge) {
  const b = db.battles.get(battleId);
  if (b) {
    b.challenges.push(challenge);
    db.battles.set(battleId, b);
  }
}

export function getAgentStats(agentId: Battle["agentId"]): AgentArenaStats {
  let stats = db.agentStats.get(agentId);
  if (!stats) {
    stats = { wins: 0, losses: 0, realized_pnl: 0, valid_challenges: 0, defended_challenges: 0 };
    db.agentStats.set(agentId, stats);
  }
  return stats;
}

export function saveAgentStats(agentId: Battle["agentId"], stats: AgentArenaStats) {
  db.agentStats.set(agentId, stats);
}
