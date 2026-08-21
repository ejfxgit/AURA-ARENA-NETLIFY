import type { User } from "@supabase/supabase-js";
import { isAddress } from "viem";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? value as JsonRecord : null;
}

function addressFromIdentityId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.split(":").at(-1);
  return candidate && isAddress(candidate) ? candidate : null;
}

export function walletAddressClaimFromUser(user: User): string | null {
  const web3Identity = user.identities?.find(
    (identity) => identity.provider === "web3" || identity.provider === "ethereum",
  );
  const identityData = asRecord(web3Identity?.identity_data);
  const customClaims = asRecord(identityData?.custom_claims);
  const userMetadata = asRecord(user.user_metadata);
  const userCustomClaims = asRecord(userMetadata?.custom_claims);
  const isWeb3User = user.app_metadata?.provider === "web3"
    || user.app_metadata?.provider === "ethereum"
    || Boolean(web3Identity);
  if (!isWeb3User) return null;

  const candidates = [
    customClaims?.address,
    identityData?.address,
    identityData?.wallet_address,
    addressFromIdentityId(web3Identity?.id),
    userCustomClaims?.address,
    userMetadata?.address,
    userMetadata?.wallet_address,
    addressFromIdentityId(userMetadata?.sub),
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && isAddress(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function walletAddressFromUser(user: User): string | null {
  return walletAddressClaimFromUser(user)?.toLowerCase() ?? null;
}
