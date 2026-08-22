// Browser-safe configuration. Keep serverConfig in config.ts server-only.
export const PRODUCTION_SITE_URL = "https://auraarenaokx.vercel.app";

function normalizeOrigin(value: string): string {
  return new URL(value).origin.replace(/\/+$/, "");
}

function normalizedSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return normalizeOrigin(explicit);

  // Production must be stable even if Vercel exposes a deployment-specific host.
  // Preview/local deployments can still opt in to their own origin by setting
  // NEXT_PUBLIC_SITE_URL explicitly.
  return PRODUCTION_SITE_URL;
}

export function canonicalSiteOrigin(): string {
  return normalizedSiteUrl();
}

export const publicConfig = {
  siteUrl: normalizedSiteUrl(),
  explorer:
    process.env.NEXT_PUBLIC_X_LAYER_EXPLORER || "https://www.okx.com/web3/explorer/xlayer-test",
  contract: process.env.NEXT_PUBLIC_X_LAYER_CONTRACT_ADDRESS || "",
  chainId: Number(process.env.NEXT_PUBLIC_X_LAYER_CHAIN_ID || 1952),
};
