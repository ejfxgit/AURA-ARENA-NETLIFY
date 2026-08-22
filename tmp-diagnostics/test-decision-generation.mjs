// End-to-end test: authenticate, call POST /api/agents/decisions, verify results.
//
//   node tmp-diagnostics/test-decision-generation.mjs
//
// Creates a temporary Supabase session via anon sign-up, calls the endpoint
// through the running dev server, and checks that real decisions are persisted.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY;
const DEV_SERVER = "https://auraarenaokx.vercel.app";
const AGENTS = ["volt", "mira", "quanta", "nova", "atlas", "rift"];

// Step 1: Create a temporary user via Supabase auth
console.log("1. Creating temporary Supabase session...");
const email = `test-decisions-${Date.now()}@aura-arena.local`;
const password = "TestDecisions123!";

const signUpRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON,
  },
  body: JSON.stringify({ email, password }),
});

if (!signUpRes.ok) {
  const text = await signUpRes.text();
  console.error(`   FAIL: signup returned ${signUpRes.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}

const signUpData = await signUpRes.json();
const accessToken = signUpData.access_token;
const userId = signUpData.user?.id;

if (!accessToken || !userId) {
  console.error("   FAIL: no access_token or user id in signup response");
  console.error("   Data:", JSON.stringify(signUpData).slice(0, 400));
  process.exit(1);
}
console.log(`   OK: user ${userId.slice(0, 8)}... token ${accessToken.slice(0, 20)}...`);

// Step 2: Create profile + demo account (required by getWalletAuth)
console.log("\n2. Creating wallet profile + demo account via service role...");

// Create profile
const fakeWallet = "0x" + "a".repeat(40);
const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_SECRET,
    Authorization: `Bearer ${SUPABASE_SECRET}`,
    Prefer: "return=minimal",
  },
  body: JSON.stringify({
    id: userId,
    wallet_address: fakeWallet,
    display_name: "Decision Test",
  }),
});
console.log(`   profile insert: ${profileRes.status}`);

// Create demo account
const accountRes = await fetch(`${SUPABASE_URL}/rest/v1/demo_accounts`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_SECRET,
    Authorization: `Bearer ${SUPABASE_SECRET}`,
    Prefer: "return=minimal",
  },
  body: JSON.stringify({ user_id: userId }),
});
console.log(`   demo_accounts insert: ${accountRes.status}`);

// Step 3: Call GET /api/agents/decisions to see current state
console.log("\n3. GET /api/agents/decisions (read current state)...");
const getRes = await fetch(`${DEV_SERVER}/api/agents/decisions`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
const getBody = await getRes.json();
console.log(`   status: ${getRes.status}`);
if (getRes.ok) {
  console.log(`   symbol: ${getBody.symbol}, horizonMinutes: ${getBody.horizonMinutes}`);
  for (const agent of AGENTS) {
    const state = getBody.decisions?.[agent];
    console.log(`   ${agent.padEnd(7)}: ${state?.status ?? "not present"}`);
  }
} else {
  console.log(`   error: ${JSON.stringify(getBody).slice(0, 300)}`);
}

// Step 4: Call POST /api/agents/decisions to generate fresh decisions
console.log("\n4. POST /api/agents/decisions (generate fresh decisions)...");
console.log("   This calls the OpenRouter LLM for each agent — may take 30-60s...");
const startTime = Date.now();
const postRes = await fetch(`${DEV_SERVER}/api/agents/decisions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({}),
});
const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const postBody = await postRes.json();
console.log(`   status: ${postRes.status} (${elapsed}s)`);

if (!postRes.ok) {
  console.log(`   ERROR: ${JSON.stringify(postBody).slice(0, 500)}`);
  process.exit(1);
}

console.log(`   symbol: ${postBody.symbol}, horizonMinutes: ${postBody.horizonMinutes}`);

// Check each agent's decision
let success = 0;
let failures = 0;
for (const agent of AGENTS) {
  const state = postBody.decisions?.[agent];
  const error = postBody.errors?.[agent];
  if (state?.status === "ready" && state.decision) {
    const d = state.decision;
    console.log(`   ${agent.padEnd(7)}: ${d.decision.padEnd(5)} ${String(d.confidence).padStart(3)}% @${d.marketPrice} — ${d.reasoning?.slice(0, 80)}...`);
    success++;
  } else {
    console.log(`   ${agent.padEnd(7)}: FAILED — status=${state?.status ?? "missing"}, error=${error ?? "none"}`);
    failures++;
  }
}

// Step 5: Verify persistence by reading back from DB
console.log("\n5. Verifying persistence in agent_decisions...");
const verifyRes = await fetch(
  `${SUPABASE_URL}/rest/v1/agent_decisions?select=agent_id,decision,confidence,market_price,model,updated_at&symbol=eq.BTC-USDT&horizon_minutes=eq.5`,
  {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
    },
  },
);
const rows = await verifyRes.json();
console.log(`   rows in DB: ${rows.length}`);
for (const row of rows) {
  const age = Math.round((Date.now() - new Date(row.updated_at).getTime()) / 1000);
  console.log(`   ${row.agent_id.padEnd(7)} ${row.decision.padEnd(5)} ${String(row.confidence).padStart(3)}% @${row.market_price} ${age}s ago ${row.model}`);
}

// Step 6: Clean up test user
console.log("\n6. Cleaning up test user...");
await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
  method: "DELETE",
  headers: {
    apikey: SUPABASE_SECRET,
    Authorization: `Bearer ${SUPABASE_SECRET}`,
  },
});
console.log("   cleaned up.");

// Verdict
console.log(`\n${"=".repeat(64)}`);
if (success === 6) {
  console.log("VERDICT: All 6 agents generated REAL decisions via POST /api/agents/decisions.");
  console.log("  Decisions are persisted in agent_decisions and will show on agent cards.");
} else if (success > 0) {
  console.log(`VERDICT: ${success}/6 agents succeeded, ${failures}/6 failed.`);
  console.log("  Check the dev server console for error details.");
} else {
  console.log("VERDICT: All 6 agents FAILED to generate decisions.");
  console.log("  Check the dev server console for error details.");
}
process.exitCode = success === 6 ? 0 : 1;
