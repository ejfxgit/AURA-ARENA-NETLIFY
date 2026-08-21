// Browser-safe configuration. Keep serverConfig in config.ts server-only.
export const publicConfig = {
  explorer:
    process.env.NEXT_PUBLIC_X_LAYER_EXPLORER || "https://www.okx.com/web3/explorer/xlayer-test",
  contract: process.env.NEXT_PUBLIC_X_LAYER_CONTRACT_ADDRESS || "",
  chainId: Number(process.env.NEXT_PUBLIC_X_LAYER_CHAIN_ID || 1952),
};
