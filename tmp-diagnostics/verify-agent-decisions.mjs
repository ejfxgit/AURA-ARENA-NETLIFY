// Post-migration verification for the agent_decisions store.
//
//   node tmp-diagnostics/verify-agent-decisions.mjs
//
// STRICTLY READ-ONLY. It never writes a decision: a fabricated row is exactly
// what this subsystem exists to prevent, so the write path is left to the real
// POST /api/agents/decisions refresh, which only stores what a model returned.
//
// Supersedes probe-agent-decisions.mjs and fix-agent-decisions-store.mjs.
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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = env.SUPABASE_SECRET_KEY;

// Must stay identical to SELECTED_COLUMNS in src/lib/supabase/agent-decisions.ts.
const COLUMNS =
  "agent_id,symbol,decision,confidence,horizon_minutes,market_price,reasoning,thesis,model,updated_at";
// CANONICAL_DECISION_SYMBOL and DEFAULT_BATTLE_DURATION_SECONDS / 60.
const SYMBOL = "BTC-USDT";
const HORIZON = 5;
const AGENTS = ["volt", "mira", "quanta", "nova", "atlas", "rift"];

async function rest(key, query) {
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return { status: res.status, text: await res.text() };
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed });
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log(`project: ${new URL(url).hostname.split(".")[0]}\n`);

// 1. The table exists and every column the repository selects is present.
//    A partial apply shows up here as a 400 naming the missing column.
console.log("1. table + columns (service_role)");
const admin = await rest(secret, `agent_decisions?select=${COLUMNS}&limit=1`);
const adminOk = admin.status === 200;
check("public.agent_decisions exists with all 10 selected columns", adminOk,
  adminOk ? undefined : `HTTP ${admin.status} ${admin.text.slice(0, 200)}`);

// 2. RLS lets the anon/publishable key read it — the route reads through the
//    caller's own client, not the service role.
console.log("\n2. RLS read policy (anon key)");
const anonRead = await rest(anon, `agent_decisions?select=${COLUMNS}&limit=1`);
check("anon can SELECT (agent_decisions_select_all)", anonRead.status === 200,
  anonRead.status === 200 ? undefined : `HTTP ${anonRead.status} ${anonRead.text.slice(0, 200)}`);

// 3. The exact roster query behind GET /api/agents/decisions.
console.log(`\n3. roster read — readAgentDecisionsForSymbol(${SYMBOL}, ${HORIZON})`);
const roster = await rest(anon, `agent_decisions?select=${COLUMNS}&symbol=eq.${SYMBOL}&horizon_minutes=eq.${HORIZON}`);
const rosterOk = roster.status === 200;
check("roster query succeeds (so the route's catch cannot fire)", rosterOk,
  rosterOk ? undefined : `HTTP ${roster.status} ${roster.text.slice(0, 200)}`);

// 4. The exact per-agent query behind ensureAgentDecision, used by POST /api/battles.
console.log(`\n4. per-agent read — readAgentDecision(agent, ${SYMBOL}, ${HORIZON})`);
let perAgentOk = true;
for (const agent of AGENTS) {
  const one = await rest(anon, `agent_decisions?select=${COLUMNS}&agent_id=eq.${agent}&symbol=eq.${SYMBOL}&horizon_minutes=eq.${HORIZON}`);
  if (one.status !== 200) {
    perAgentOk = false;
    console.log(`     ${agent}: HTTP ${one.status} ${one.text.slice(0, 120)}`);
  }
}
check("all 6 built-in agents queryable (POST /api/battles path)", perAgentOk);

// 5. Current contents. Zero rows is CORRECT immediately after the migration —
//    every agent reports `missing` until the first real refresh.
console.log("\n5. current contents");
if (rosterOk) {
  const rows = JSON.parse(roster.text);
  console.log(`   rows for ${SYMBOL}/${HORIZON}min: ${rows.length}`);
  for (const row of rows) {
    const age = Math.round((Date.now() - new Date(row.updated_at).getTime()) / 1000);
    console.log(`     ${row.agent_id.padEnd(7)} ${row.decision.padEnd(5)} ${String(row.confidence).padStart(3)}%  @${row.market_price}  ${age}s ago  ${row.model}`);
  }
  if (!rows.length) {
    console.log("     (empty — expected before the first refresh; cards show NO/missing decision,");
    console.log("      never a fabricated WAIT. POST /api/agents/decisions populates them.)");
  }
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${"=".repeat(64)}`);
if (!failed.length) {
  console.log("VERDICT: agent_decisions is live and readable.");
  console.log("  GET /api/agents/decisions      -> 200 for any authenticated caller");
  console.log("  POST /api/battles              -> no longer 503 from agent_decisions");
} else {
  console.log(`VERDICT: ${failed.length} check(s) FAILED — see above.`);
}
process.exitCode = failed.length ? 1 : 0;
