import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  keccak256,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig, hasXLayerSigner } from "../config";
import { explorerBase, xLayerChain } from "./xlayer";
import type { Battle, XLayerStatus } from "../types";

// Hashes are the proof for the off-chain thesis/challenge record. The full
// record stays in the application store; only this digest and headline values
// are anchored on-chain.
export function hashData(obj: unknown): `0x${string}` {
  return keccak256(toHex(JSON.stringify(obj)));
}

export function buildBattleHashes(battle: Battle) {
  const thesis_hash = hashData({
    thesis: battle.thesis,
    asset: battle.asset,
    agent: battle.agentId,
  });
  const challenge_hash = hashData({
    challenges: battle.challenges.map((c) => ({
      id: c.id,
      message: c.message,
      recalculation: c.recalculation,
    })),
  });
  const data_hash = hashData({
    battleId: battle.id,
    asset: battle.asset,
    agentId: battle.agentId,
    humanDirection: battle.human_direction,
    aiDirection: battle.ai_direction,
    humanStake: battle.human_amount,
    aiStake: battle.ai_amount,
    leverage: battle.leverage,
    stakeReserved: battle.stake_reserved,
    durationSeconds: battle.duration_seconds,
    startedAt: battle.started_at,
    expiresAt: battle.expires_at,
    entryPrice: battle.entry_price,
    exitPrice: battle.exit_price,
    aiPnl: battle.ai_pnl,
    humanPnl: battle.human_pnl,
    winner: battle.winner,
    confidenceBefore: battle.ai_confidence_before,
    confidenceAfter: battle.ai_confidence_after,
    thesis_hash,
    challenge_hash,
  });
  return { thesis_hash, challenge_hash, data_hash };
}

const AURA_ABI = [
  {
    type: "function",
    name: "finalizeBattle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "battleId", type: "uint256" },
      { name: "agentId", type: "uint8" },
      { name: "human", type: "address" },
      { name: "aiPnl", type: "int256" },
      { name: "humanPnl", type: "int256" },
      { name: "winner", type: "uint8" },
      { name: "confidenceBefore", type: "uint16" },
      { name: "confidenceAfter", type: "uint16" },
      { name: "dataHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const AGENT_INDEX: Record<string, number> = { volt: 1, mira: 2, quanta: 3, nova: 4, atlas: 5, rift: 6 };

export interface FinalizeResult {
  txHash: string;
  status: XLayerStatus;
  explorerUrl: string;
  dataHash: string;
  error?: string;
}

function battleNumber(id: string): bigint {
  return BigInt(keccak256(toHex(id)));
}

function winnerCode(winner: Battle["winner"]): number {
  return winner === "HUMAN" ? 1 : winner === "AI" ? 2 : 0;
}

// Finalization is deliberately server-authoritative. Missing configuration is
// a visible state, never a fabricated transaction or verification checkmark.
export async function finalizeOnChain(
  battle: Battle,
  humanAddress?: string,
): Promise<FinalizeResult> {
  const { data_hash } = buildBattleHashes(battle);
  const base = explorerBase();

  if (battle.agentId === "custom") {
    return {
      txHash: "",
      status: "UNCONFIGURED",
      explorerUrl: base,
      dataHash: data_hash,
      error: "The current proof contract accepts built-in roster IDs only. This custom battle remains server-settled off-chain.",
    };
  }

  if (!hasXLayerSigner()) {
    return {
      txHash: "",
      status: "UNCONFIGURED",
      explorerUrl: base,
      dataHash: data_hash,
      error: "X Layer contract or deployer is not configured.",
    };
  }

  try {
    const chain = xLayerChain();
    const account = privateKeyToAccount(serverConfig.xLayerDeployerKey as `0x${string}`);
    const wallet = createWalletClient({ account, chain, transport: http() });
    const pub = createPublicClient({ chain, transport: http() });
    const toScaled = (n: number) => BigInt(Math.round(n * 1e6));
    const human = (humanAddress && isAddress(humanAddress) ? humanAddress : zeroAddress) as `0x${string}`;

    const txHash = await wallet.writeContract({
      address: serverConfig.xLayerContract as `0x${string}`,
      abi: AURA_ABI,
      functionName: "finalizeBattle",
      args: [
        battleNumber(battle.id),
        AGENT_INDEX[battle.agentId] ?? 0,
        human,
        toScaled(battle.ai_pnl),
        toScaled(battle.human_pnl),
        winnerCode(battle.winner),
        battle.ai_confidence_before,
        battle.ai_confidence_after,
        data_hash,
      ],
    });

    try {
      const receipt = await pub.waitForTransactionReceipt({ hash: txHash, timeout: 45_000 });
      if (receipt.status !== "success") {
        return {
          txHash,
          status: "FAILED",
          explorerUrl: `${base}/tx/${txHash}`,
          dataHash: data_hash,
          error: "X Layer transaction reverted.",
        };
      }
      return {
        txHash,
        status: "VERIFIED",
        explorerUrl: `${base}/tx/${txHash}`,
        dataHash: data_hash,
      };
    } catch {
      return {
        txHash,
        status: "PENDING",
        explorerUrl: `${base}/tx/${txHash}`,
        dataHash: data_hash,
        error: "Transaction submitted; confirmation is still pending.",
      };
    }
  } catch (error) {
    return {
      txHash: "",
      status: "FAILED",
      explorerUrl: base,
      dataHash: data_hash,
      error: error instanceof Error ? error.message : "X Layer finalization failed.",
    };
  }
}

export async function getFinalizationStatus(
  txHash: string,
): Promise<"PENDING" | "FAILED" | "VERIFIED"> {
  if (!txHash || !serverConfig.xLayerRpc) return "FAILED";
  const chain = xLayerChain();
  const pub = createPublicClient({ chain, transport: http() });
  try {
    const receipt = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` });
    return receipt.status === "success" ? "VERIFIED" : "FAILED";
  } catch {
    return "PENDING";
  }
}
