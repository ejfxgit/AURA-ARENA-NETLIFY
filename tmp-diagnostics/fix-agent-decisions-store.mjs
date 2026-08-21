// Diagnose (and, if this environment has a DDL path, repair) the agent_decisions
// store that /api/agents/decisions reads.
//
//   node tmp-diagnostics/fix-agent-decisions-store.mjs
//
// Read-only unless the table is genuinely absent. Applying the migration is
// idempotent by design (see its header), so a second run is harmless.
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
const ref = new URL(url).hostname.split(".")[0];

const COLUMNS =
  "agent_id,symbol,decision,confidence,horizon_minutes,market_price,reasoning,thesis,model,updated_at";

// Exactly the query src/lib/supabase/agent-decisions.ts issues for the roster.
const ROSTER_QUERY = `agent_decisions?select=${COLUMNS}&symbol=eq.BTC-USDT&horizon_minutes=eq.5`;

async function rest(key, query, extraHeaders = {}) {
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...extraHeaders },
  });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

console.log(`project: ${ref}\n`);
console.log("=== 1. the exact read the route performs ===");

const anonRead = await rest(anon, ROSTER_QUERY);
console.log(`  anon         HTTP ${anonRead.status}  ${anonRead.text.slice(0, 220)}`);
const adminRead = await rest(secret, ROSTER_QUERY);
console.log(`  service_role HTTP ${adminRead.status}  ${adminRead.text.slice(0, 220)}`);

const control = await rest(secret, "profiles?select=id&limit=1");
console.log(`  control (profiles) HTTP ${control.status}  ${control.text.slice(0, 120)}`);

let missing = false;
try {
  const body = JSON.parse(adminRead.text);
  // PGRST205 = relation not in the PostgREST schema cache, 42P01 = undefined_table.
  if (body?.code === "PGRST205" || body?.code === "42P01") missing = true;
} catch {
  /* an array body means the table exists */
}

console.log(`\n=== 2. verdict ===`);
if (control.status !== 200) {
  console.log("  Supabase credentials or URL are not usable — fix those first.");
  process.exitCode = 1;
} else if (missing) {
  console.log("  public.agent_decisions DOES NOT EXIST. This is the cause of the 503.");
} else if (adminRead.status === 200) {
  const rows = JSON.parse(adminRead.text);
  console.log(`  Table exists and is readable. Rows for BTC-USDT/5min: ${rows.length}`);
  for (const row of rows) {
    console.log(`    ${row.agent_id.padEnd(8)} ${row.decision.padEnd(5)} ${row.confidence}%  ${row.updated_at}`);
  }
  const all = await rest(secret, "agent_decisions?select=agent_id,symbol,horizon_minutes,decision,updated_at");
  console.log(`  All rows in table: ${all.status === 200 ? JSON.parse(all.text).length : all.text.slice(0, 160)}`);
  if (all.status === 200) {
    for (const row of JSON.parse(all.text)) {
      console.log(`    ${row.agent_id.padEnd(8)} ${row.symbol.padEnd(10)} h=${row.horizon_minutes} ${row.decision}`);
    }
  }
} else {
  console.log(`  Table read failed for another reason: ${adminRead.text.slice(0, 300)}`);
}

if (!missing) process.exit(process.exitCode ?? 0);

// --- repair -----------------------------------------------------------------
const sql = readFileSync(
  new URL("../supabase/migrations/202608230001_agent_decisions.sql", import.meta.url),
  "utf8",
);

console.log(`\n=== 3. attempting to apply the migration (${sql.length} bytes) ===`);
console.log("  DDL credentials present:");
for (const name of [
  "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL",
  "DATABASE_URL", "POSTGRES_URL", "PGPASSWORD", "PGURI",
]) {
  const value = process.env[name] ?? env[name];
  console.log(`    ${name.padEnd(22)} ${value ? "SET" : "absent"}`);
}

let applied = false;
const pat = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;

console.log("\n  path 1: Management API /database/query");
for (const [label, token] of [["SUPABASE_ACCESS_TOKEN", pat], ["service_role key", secret]]) {
  if (!token) continue;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    console.log(`    ${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
    if (res.ok) { applied = true; break; }
  } catch (error) {
    console.log(`    ${label}: request failed - ${error.message}`);
  }
}

if (!applied) {
  console.log("\n  path 2: SQL-executing RPC via PostgREST");
  for (const fn of ["exec_sql", "execute_sql", "exec", "run_sql", "sql"]) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, sql }),
    });
    console.log(`    ${fn.padEnd(12)} HTTP ${res.status} ${(await res.text()).slice(0, 110)}`);
    if (res.ok) { applied = true; break; }
  }
}

if (applied) {
  const after = await rest(secret, ROSTER_QUERY);
  console.log(`\nRESULT: migration APPLIED. Re-read HTTP ${after.status} ${after.text.slice(0, 160)}`);
  process.exitCode = after.status === 200 ? 0 : 1;
} else {
  console.log(
    "\nRESULT: no DDL path available from this environment — the migration must be run" +
    "\n        in the Supabase SQL editor:" +
    "\n        supabase/migrations/202608230001_agent_decisions.sql",
  );
  process.exitCode = 1;
}
