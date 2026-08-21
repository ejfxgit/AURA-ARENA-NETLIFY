// Temporary diagnostic: verify the live custom_agents schema and the exact
// validation result for a builder payload. Run with: node tmp-diagnostics/probe-custom-agents.mjs
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
const secret = env.SUPABASE_SECRET_KEY;
const headers = { apikey: secret, Authorization: `Bearer ${secret}` };

const columns = [
  "id", "owner_id", "name", "personality_mood", "trading_specialty", "risk_style",
  "description", "avatar_style", "trading_focus", "information_focus",
  "news_preference", "social_sentiment", "onchain_activity", "whale_movements",
  "decision_behaviors", "custom_instructions", "created_at", "updated_at",
];

console.log("project:", url);
console.log("\n--- custom_agents column probe (PostgREST) ---");
const missing = [];
for (const column of columns) {
  const res = await fetch(`${url}/rest/v1/custom_agents?select=${column}&limit=1`, { headers });
  const text = await res.text();
  if (res.status !== 200) missing.push(column);
  console.log(String(res.status).padEnd(4), column.padEnd(20), res.status === 200 ? "OK" : text.slice(0, 160));
}
console.log("\nmissing/erroring columns:", missing.length ? missing.join(", ") : "none");

console.log("\n--- supporting tables ---");
for (const table of ["profiles", "demo_accounts", "user_battles", "custom_agents"]) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers });
  const text = await res.text();
  console.log(String(res.status).padEnd(4), table.padEnd(16), res.status === 200 ? `OK rows=${JSON.parse(text).length}` : text.slice(0, 160));
}

console.log("\n--- existing custom agents (service role, RLS bypassed) ---");
const rows = await fetch(`${url}/rest/v1/custom_agents?select=*`, { headers });
console.log(rows.status, (await rows.text()).slice(0, 2000));
