import { defineChain, type Chain } from "viem";
import { serverConfig } from "../config";

// One definition of the X Layer network for every server-side chain call.
//
// The values come from the existing X_LAYER_* configuration — nothing about the
// network is invented here. Both the battle-proof contract (chain/onchain.ts)
// and the USDT treasury payout (chain/usdt.ts) build their clients from this,
// so they can never drift onto different RPCs or chain ids.

export function xLayerChain(): Chain {
  return defineChain({
    id: serverConfig.xLayerChainId,
    name: "X Layer Testnet",
    nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
    rpcUrls: { default: { http: [serverConfig.xLayerRpc] } },
  });
}

/** Explorer root. Browser-safe value, shared with lib/public-config.ts. */
export function explorerBase(): string {
  return process.env.NEXT_PUBLIC_X_LAYER_EXPLORER || "https://www.okx.com/web3/explorer/xlayer-test";
}

/** Explorer link for a real transaction hash. */
export function explorerTxUrl(txHash: string): string {
  return `${explorerBase()}/tx/${txHash}`;
}
