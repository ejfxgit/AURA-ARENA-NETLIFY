import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { createClient, type Session } from "@supabase/supabase-js";
import { isAddress, recoverMessageAddress, type Hex } from "viem";
import { supabaseConfigError } from "@/lib/config";
import { PRODUCTION_SITE_URL } from "@/lib/public-config";
import { getSupabaseAdmin } from "./server";
import { walletAddressClaimFromUser, walletAddressFromUser } from "./wallet-identity";

export const WALLET_CHALLENGE_COOKIE = "aura_wallet_challenge";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const STATEMENT = "Sign in to AURA Arena on X Layer Testnet.";
const CHAIN_ID = 1952;

interface ChallengePayload {
  walletAddress: string;
  message: string;
  expiresAt: string;
}

export class WalletAuthError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "WalletAuthError";
  }
}

function challengeSecret(): string {
  const configError = supabaseConfigError("admin");
  if (configError) throw new WalletAuthError(configError, 503);
  const secret = process.env.SUPABASE_SECRET_KEY || "";
  return secret;
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", challengeSecret()).update(encodedPayload).digest("base64url");
}

function encodeChallenge(payload: ChallengePayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signPayload(encoded)}`;
}

function decodeChallenge(token: string): ChallengePayload {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) throw new WalletAuthError("Wallet challenge is missing or invalid", 401);
  const expectedSignature = signPayload(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new WalletAuthError("Wallet challenge is missing or invalid", 401);
  }
  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ChallengePayload;
  } catch {
    throw new WalletAuthError("Wallet challenge is missing or invalid", 401);
  }
}

async function preferredSiweAddress(walletAddress: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  if (profileError) throw new WalletAuthError("Unable to prepare wallet challenge", 503);
  if (!profile) return walletAddress;

  const { data, error } = await admin.auth.admin.getUserById(profile.id);
  if (error || !data.user) throw new WalletAuthError("Unable to restore wallet identity", 503);
  const existingClaim = walletAddressClaimFromUser(data.user);
  return existingClaim?.toLowerCase() === walletAddress ? existingClaim : walletAddress;
}

function resolveSiweOrigin(requestUrl: string): URL {
  const request = new URL(requestUrl);
  const configured = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || PRODUCTION_SITE_URL);
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

  // Local development signs for the actual dev-server origin. All deployed
  // environments sign for the canonical configured site, preventing Vercel
  // deployment-host / browser-host drift from producing Supabase SIWE URI
  // mismatches. This is not an arbitrary-origin allow-list: only local loopback
  // can use the request host.
  if (localHosts.has(request.hostname)) return new URL(request.origin);
  return new URL(configured.origin);
}

function buildSiweMessage(
  address: string,
  origin: URL,
  nonce: string,
  issuedAt: Date,
  expirationTime: Date,
): string {
  return `${origin.host} wants you to sign in with your Ethereum account:\n${address}\n\n${STATEMENT}\n\nURI: ${origin.origin}\nVersion: 1\nChain ID: ${CHAIN_ID}\nNonce: ${nonce}\nIssued At: ${issuedAt.toISOString()}\nExpiration Time: ${expirationTime.toISOString()}`;
}

export async function createWalletAuthChallenge(walletAddress: string, requestUrl: string) {
  if (!isAddress(walletAddress)) throw new WalletAuthError("Invalid wallet address");
  const normalizedAddress = walletAddress.toLowerCase();
  const siweAddress = await preferredSiweAddress(normalizedAddress);
  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const message = buildSiweMessage(
    siweAddress,
    resolveSiweOrigin(requestUrl),
    randomBytes(16).toString("hex"),
    issuedAt,
    expirationTime,
  );
  const payload: ChallengePayload = {
    walletAddress: normalizedAddress,
    message,
    expiresAt: expirationTime.toISOString(),
  };
  return {
    walletAddress: normalizedAddress,
    message,
    expiresAt: payload.expiresAt,
    cookieValue: encodeChallenge(payload),
  };
}

export async function verifyWalletAuthChallenge(params: {
  cookieValue: string;
  walletAddress: string;
  message: string;
  signature: Hex;
}): Promise<{ session: Session; walletAddress: string }> {
  if (!isAddress(params.walletAddress)) throw new WalletAuthError("Invalid wallet address");
  const payload = decodeChallenge(params.cookieValue);
  const normalizedAddress = params.walletAddress.toLowerCase();
  if (payload.walletAddress !== normalizedAddress || payload.message !== params.message) {
    throw new WalletAuthError("Wallet challenge does not match the connected wallet", 401);
  }
  if (Date.parse(payload.expiresAt) <= Date.now()) throw new WalletAuthError("Wallet challenge expired", 401);

  let recoveredAddress: string;
  try {
    recoveredAddress = await recoverMessageAddress({ message: params.message, signature: params.signature });
  } catch {
    throw new WalletAuthError("Wallet signature is invalid", 401);
  }
  if (recoveredAddress.toLowerCase() !== normalizedAddress) {
    throw new WalletAuthError("Wallet signature does not match the connected wallet", 403);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  const configError = supabaseConfigError("public");
  if (configError) throw new WalletAuthError(configError, 503);
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: "ethereum",
    message: params.message,
    signature: params.signature,
  });
  if (error || !data.session) throw new WalletAuthError(error?.message || "Wallet authentication failed", 401);
  if (walletAddressFromUser(data.session.user) !== normalizedAddress) {
    throw new WalletAuthError("Supabase session does not match the connected wallet", 403);
  }
  return { session: data.session, walletAddress: normalizedAddress };
}
