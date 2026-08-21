import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  isAddress,
  keccak256,
  parseUnits,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverConfig, treasuryConfigError } from "../config";
import { explorerTxUrl, xLayerChain } from "./xlayer";

// Server-side USDT payouts for AURA redemptions.
//
// This module is the ONLY place a treasury key is used, it runs exclusively in
// route handlers, and nothing it returns contains the key, the treasury address
// or any other secret. There is no client-side signing path: the browser asks
// for a redemption, the server decides and signs.
//
// It never reports success it has not verified. A payout is SUCCESS only when a
// confirmed receipt carries a real Transfer event from the configured token:
//   SUCCESS — confirmed on chain, tokens moved, tx hash is real
//   FAILED  — nothing moved (config, balance, estimation, revert). Safe to refund.
//   PENDING — broadcast but not yet confirmed. Tokens MAY move, so the caller
//             must keep the record in flight and reconcile it later — refunding
//             here could pay a user twice.

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/** topic0 of ERC-20 Transfer(address,address,uint256). */
const TRANSFER_TOPIC = keccak256(toHex("Transfer(address,address,uint256)"));

const CONFIRMATION_TIMEOUT_MS = 45_000;

/** Raised when the treasury is not configured. Never carries a secret. */
export class TreasuryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TreasuryConfigurationError";
  }
}

export type PayoutStatus = "SUCCESS" | "FAILED" | "PENDING";

export interface PayoutResult {
  status: PayoutStatus;
  txHash: string | null;
  explorerUrl: string | null;
  /** User-facing reason. Set for FAILED and PENDING. */
  error?: string;
}

/** The configured token contract, lowercased. Throws when unconfigured. */
export function usdtTokenAddress(): string {
  const configError = treasuryConfigError();
  if (configError) throw new TreasuryConfigurationError(configError);
  return serverConfig.xLayerUsdtAddress.toLowerCase();
}

/** The configured chain id for redemption payouts. */
export function payoutChainId(): number {
  return serverConfig.xLayerChainId;
}

function failed(error: string, txHash?: string): PayoutResult {
  return {
    status: "FAILED",
    txHash: txHash ?? null,
    explorerUrl: txHash ? explorerTxUrl(txHash) : null,
    error,
  };
}

/**
 * Sends `usdtAmount` testnet USDT from the treasury to `to`.
 *
 * @throws TreasuryConfigurationError when the treasury is not configured. The
 * caller must check this BEFORE debiting any AURA.
 */
export async function sendUsdtPayout({
  to,
  usdtAmount,
}: {
  to: string;
  usdtAmount: number;
}): Promise<PayoutResult> {
  const configError = treasuryConfigError();
  if (configError) throw new TreasuryConfigurationError(configError);
  if (!isAddress(to)) return failed("The destination wallet address is not valid.");
  if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) {
    return failed("The redemption amount is not valid.");
  }

  const token = serverConfig.xLayerUsdtAddress as `0x${string}`;
  const chain = xLayerChain();
  const account = privateKeyToAccount(serverConfig.xLayerTreasuryKey as `0x${string}`);
  const pub = createPublicClient({ chain, transport: http(serverConfig.xLayerRpc) });
  const wallet = createWalletClient({ account, chain, transport: http(serverConfig.xLayerRpc) });

  // Decimals are read from the contract, never assumed, so the transferred
  // amount matches the token that is actually deployed at this address.
  let decimals: number;
  try {
    decimals = await pub.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" });
  } catch (error) {
    console.error("[usdt-payout] unable to read token decimals", {
      chainId: chain.id,
      message: error instanceof Error ? error.message : String(error),
    });
    return failed(
      "The configured USDT contract could not be read on X Layer Testnet. Check X_LAYER_USDT_CONTRACT_ADDRESS and X_LAYER_RPC_URL.",
    );
  }

  const amountText = usdtAmount.toFixed(6);
  const units = parseUnits(amountText, decimals);
  if (units <= 0n || Number(formatUnits(units, decimals)) !== Number(amountText)) {
    return failed(
      `The configured token uses ${decimals} decimals and cannot represent ${amountText} USDT exactly.`,
    );
  }

  // Refusing up front is better than broadcasting a transfer that reverts: the
  // AURA can be restored without any gas spent or ambiguity about what moved.
  try {
    const balance = await pub.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (balance < units) {
      console.error("[usdt-payout] treasury balance too low", {
        required: units.toString(),
        available: balance.toString(),
        decimals,
      });
      return failed(
        "The redemption treasury does not currently hold enough testnet USDT to cover this withdrawal. Try again once it is topped up.",
      );
    }
  } catch (error) {
    console.error("[usdt-payout] unable to read treasury balance", {
      message: error instanceof Error ? error.message : String(error),
    });
    return failed("The treasury balance could not be verified on X Layer Testnet.");
  }

  let txHash: `0x${string}`;
  try {
    txHash = await wallet.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [to as `0x${string}`, units],
    });
  } catch (error) {
    // Simulation, gas estimation, nonce or RPC failure: nothing was broadcast.
    console.error("[usdt-payout] transfer submission failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return failed(
      error instanceof Error
        ? `The USDT transfer could not be submitted: ${error.message.split("\n")[0]}`
        : "The USDT transfer could not be submitted.",
    );
  }

  try {
    const receipt = await pub.waitForTransactionReceipt({
      hash: txHash,
      timeout: CONFIRMATION_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      return failed("The USDT transfer reverted on X Layer Testnet. No tokens were moved.", txHash);
    }
    // Some ERC-20s return false instead of reverting. A confirmed receipt is
    // therefore not proof on its own: the Transfer event is.
    const transferred = receipt.logs.some(
      (log) =>
        log.address.toLowerCase() === token.toLowerCase() &&
        log.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase(),
    );
    if (!transferred) {
      return failed(
        "The transaction confirmed without an ERC-20 transfer event, so no USDT was moved.",
        txHash,
      );
    }
    return { status: "SUCCESS", txHash, explorerUrl: explorerTxUrl(txHash) };
  } catch (error) {
    // Broadcast, not yet confirmed. The tokens may still move, so this is NOT a
    // failure and the reserved AURA must stay reserved.
    console.error("[usdt-payout] confirmation pending", {
      txHash,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "PENDING",
      txHash,
      explorerUrl: explorerTxUrl(txHash),
      error: "The USDT transfer was submitted and is waiting for confirmation on X Layer Testnet.",
    };
  }
}

/**
 * Confirmation state of an already-broadcast payout, used to reconcile records
 * left in SENDING. "PENDING" means the receipt is not available yet — never a
 * reason to refund.
 */
export async function payoutStatus(txHash: string): Promise<{
  status: PayoutStatus;
  error?: string;
}> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { status: "PENDING" };
  const chain = xLayerChain();
  const pub = createPublicClient({ chain, transport: http(serverConfig.xLayerRpc) });
  const token = serverConfig.xLayerUsdtAddress.toLowerCase();
  try {
    const receipt = await pub.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== "success") {
      return { status: "FAILED", error: "The USDT transfer reverted on X Layer Testnet." };
    }
    const transferred = receipt.logs.some(
      (log) =>
        log.address.toLowerCase() === token &&
        log.topics[0]?.toLowerCase() === TRANSFER_TOPIC.toLowerCase(),
    );
    if (!transferred) {
      return {
        status: "FAILED",
        error: "The transaction confirmed without an ERC-20 transfer event.",
      };
    }
    return { status: "SUCCESS" };
  } catch {
    return { status: "PENDING" };
  }
}
