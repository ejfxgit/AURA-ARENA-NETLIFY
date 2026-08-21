// Temporary end-to-end check for custom agent creation against a running dev
// server. Completes the real wallet (SIWE) auth flow with a throwaway key,
// exercises POST/GET /api/custom-agents, verifies the row in Supabase, then
// deletes everything it created (agent, profile, demo account, auth user).
//
//   node tmp-diagnostics/e2e-custom-agents.mjs [baseUrl]
import { readFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const BASE = process.argv[2] || "http://localhost:3000";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
const adminHeaders = { apikey: SECRET, Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" };

function step(title) {
  console.log(`\n=== ${title} ===`);
}

async function show(res) {
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log("status:", res.status);
  console.log("body:", typeof parsed === "string" ? parsed.slice(0, 400) : JSON.stringify(parsed, null, 2).slice(0, 1200));
  return parsed;
}

const account = privateKeyToAccount(generatePrivateKey());
const walletAddress = account.address.toLowerCase();
let userId = null;
let agentId = null;

try {
  step("1. wallet-auth-challenge");
  const challengeRes = await fetch(`${BASE}/api/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "wallet-auth-challenge", walletAddress, chainId: 1952 }),
  });
  const setCookie = challengeRes.headers.get("set-cookie") || "";
  const challenge = await show(challengeRes);
  if (challengeRes.status !== 200) throw new Error("challenge failed");
  const cookie = setCookie.split(";")[0];

  step("2. sign + wallet-auth-verify");
  const signature = await account.signMessage({ message: challenge.message });
  const verified = await show(await fetch(`${BASE}/api/challenges`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action: "wallet-auth-verify", walletAddress, message: challenge.message, signature }),
  }).then(async (res) => { if (res.status !== 200) { await show(res); throw new Error("verify failed"); } return res; }));
  const token = verified.session.access_token;
  userId = verified.session.user.id;
  const authed = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  console.log("userId:", userId, "wallet:", walletAddress);

  step("3. onboarding: POST /api/wallet/account");
  await show(await fetch(`${BASE}/api/wallet/account`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ walletAddress, displayName: "Diagnostic Wallet" }),
  }));

  step("4. GET /api/custom-agents (empty workspace)");
  await show(await fetch(`${BASE}/api/custom-agents`, { headers: authed }));

  step("5. POST /api/custom-agents — payload the UI sends when the description is left blank");
  await show(await fetch(`${BASE}/api/custom-agents`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({
      name: "SABLE",
      personalityMood: "Calm, precise and evidence-first.",
      tradingSpecialty: "MOMENTUM",
      riskStyle: "BALANCED",
      description: "",
      avatarStyle: "ORBIT",
      tradingFocus: ["MOMENTUM", "BREAKOUT"],
      informationFocus: ["PRICE_ACTION", "MOMENTUM", "VOLUME"],
      newsPreference: "CONSIDER",
      socialSentiment: true,
      onchainActivity: false,
      whaleMovements: false,
      decisionBehaviors: ["TRADE_SELECTIVELY", "WAIT_CONFIRMATION"],
      customInstructions: "focus news",
    }),
  }));

  step("6. POST /api/custom-agents — fully filled builder payload");
  const created = await show(await fetch(`${BASE}/api/custom-agents`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({
      name: "SABLE",
      personalityMood: "Calm, precise and evidence-first.",
      tradingSpecialty: "MOMENTUM",
      riskStyle: "BALANCED",
      description: "Patient momentum reader that waits for confirmed breakouts.",
      avatarStyle: "ORBIT",
      tradingFocus: ["MOMENTUM", "BREAKOUT"],
      informationFocus: ["PRICE_ACTION", "MOMENTUM", "VOLUME"],
      newsPreference: "CONSIDER",
      socialSentiment: true,
      onchainActivity: false,
      whaleMovements: false,
      decisionBehaviors: ["TRADE_SELECTIVELY", "WAIT_CONFIRMATION"],
      customInstructions: "focus news",
    }),
  }));
  agentId = created?.agent?.id ?? null;

  step("7. row in Supabase (service role read)");
  const row = await fetch(`${SUPA}/rest/v1/custom_agents?id=eq.${agentId}&select=*`, { headers: adminHeaders });
  await show(row);

  step("8. GET /api/custom-agents again (page reload)");
  await show(await fetch(`${BASE}/api/custom-agents`, { headers: authed }));

  step("9. PATCH /api/custom-agents/:id (edit path)");
  await show(await fetch(`${BASE}/api/custom-agents/${agentId}`, {
    method: "PATCH",
    headers: authed,
    body: JSON.stringify({ customInstructions: "focus news and confirmed volume expansion" }),
  }));

  step("10. POST /api/custom-agents/analyze");
  await show(await fetch(`${BASE}/api/custom-agents/analyze`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ customAgentId: agentId, symbol: "BTC" }),
  }));
} catch (error) {
  console.error("\nFAILED:", error?.message || error);
  process.exitCode = 1;
} finally {
  step("cleanup");
  if (agentId) {
    const res = await fetch(`${SUPA}/rest/v1/custom_agents?id=eq.${agentId}`, { method: "DELETE", headers: adminHeaders });
    console.log("delete agent:", res.status);
  }
  if (userId) {
    for (const path of [`demo_accounts?user_id=eq.${userId}`, `user_battles?owner_id=eq.${userId}`, `profiles?id=eq.${userId}`]) {
      const res = await fetch(`${SUPA}/rest/v1/${path}`, { method: "DELETE", headers: adminHeaders });
      console.log(`delete ${path.split("?")[0]}:`, res.status);
    }
    const res = await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
    console.log("delete auth user:", res.status);
  }
}
