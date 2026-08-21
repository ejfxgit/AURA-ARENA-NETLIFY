// Read-only probe: does public.agent_decisions exist in the live project, and
// what does PostgREST return for the exact query the repository layer issues?
//
//   node tmp-diagnostics/probe-agent-decisions.mjs
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

const COLUMNS =
  "agent_id,symbol,decision,confidence,horizon_minutes,market_price,reasoning,thesis,model,updated_at";

async function probe(label, key, query) {
  const res = await fetch(`${url}/rest/v1/${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  console.log(`\n[${label}] HTTP ${res.status}`);
  console.log(`  ${text.slice(0, 400)}`);
  return { status: res.status, text };
}

console.log("project:", new URL(url).hostname.split(".")[0]);

// 1. Exactly the roster read the route performs.
await probe("anon  roster read", anon, `agent_decisions?select=${COLUMNS}&symbol=eq.BTC-USDT&horizon_minutes=eq.5`);

// 2. Same via service role, to separate "table missing" from "RLS blocking".
await probe("admin roster read", secret, `agent_decisions?select=${COLUMNS}&symbol=eq.BTC-USDT&horizon_minutes=eq.5`);

// 3. Unfiltered count, to see whether ANY rows exist at all.
const all = await fetch(`${url}/rest/v1/agent_decisions?select=agent_id,symbol,horizon_minutes,decision,updated_at`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}`, Prefer: "count=exact" },
});
console.log(`\n[admin all rows] HTTP ${all.status} count=${all.headers.get("content-range")}`);
console.log(`  ${(await all.text()).slice(0, 600)}`);

// 4. A table known to exist, proving the credentials and URL are good.
await probe("control: profiles", secret, "profiles?select=id&limit=1");
