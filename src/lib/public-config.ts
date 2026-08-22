// Browser-safe configuration. Keep serverConfig in config.ts server-only.
export const PRODUCTION_SITE_URL = "https://auraarenaokx.vercel.app";

function normalizedSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return PRODUCTION_SITE_URL;
}

export const publicConfig = {
  siteUrl: normalizedSiteUrl(),
  explorer:
    process.env.NEXT_PUBLIC_X_LAYER_EXPLORER || "https://www.okx.com/web3/explorer/xlayer-test",
  contract: process.env.NEXT_PUBLIC_X_LAYER_CONTRACT_ADDRESS || "",
  chainId: Number(process.env.NEXT_PUBLIC_X_LAYER_CHAIN_ID || 1952),
};
