// Temporary diagnostic: read the LIVE public.custom_agents schema (column names
// + real Postgres types) from PostgREST's OpenAPI document and diff it against
// the columns the application actually writes/reads.
//
//   node tmp-diagnostics/schema-diff-custom-agents.mjs
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

// Columns the app expects, with the type declared by supabase/migrations.
// Sourced from 202608150001_create_custom_agents.sql + 202608170001_upgrade_custom_agents.sql.
const EXPECTED = [
  ["id", "uuid"],
  ["owner_id", "uuid"],
  ["name", "text"],
  ["personality_mood", "text"],
  ["trading_specialty", "text"],
  ["risk_style", "text"],
  ["description", "text"],
  ["avatar_style", "text"],
  ["trading_focus", "text[]"],
  ["information_focus", "text[]"],
  ["news_preference", "text"],
  ["social_sentiment", "boolean"],
  ["onchain_activity", "boolean"],
  ["whale_movements", "boolean"],
  ["decision_behaviors", "text[]"],
  ["custom_instructions", "text"],
  ["created_at", "timestamp with time zone"],
  ["updated_at", "timestamp with time zone"],
];

const spec = await fetch(`${url}/rest/v1/`, {
  headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: "application/openapi+json" },
}).then((res) => res.json());

const props = spec?.definitions?.custom_agents?.properties ?? {};
const live = new Map(Object.entries(props).map(([name, def]) => [name, def.format ?? def.type ?? "?"]));

console.log("project:", url);
console.log("live column count:", live.size);
console.log("\n| Column | Expected (migrations) | Live DB | Status |");
console.log("|---|---|---|---|");
const missing = [];
const mismatched = [];
for (const [column, expectedType] of EXPECTED) {
  const liveType = live.get(column);
  let status;
  if (!liveType) {
    status = "MISSING";
    missing.push([column, expectedType]);
  } else if (liveType !== expectedType) {
    status = "TYPE MISMATCH";
    mismatched.push([column, expectedType, liveType]);
  } else {
    status = "ok";
  }
  console.log(`| ${column} | ${expectedType} | ${liveType ?? "-"} | ${status} |`);
}

const extra = [...live.keys()].filter((name) => !EXPECTED.some(([column]) => column === name));
console.log("\nMISSING columns:", missing.length ? missing.map(([c]) => c).join(", ") : "none");
console.log("TYPE MISMATCHES:", mismatched.length ? mismatched.map(([c, e, l]) => `${c} (want ${e}, live ${l})`).join(", ") : "none");
console.log("EXTRA live columns not used by the app:", extra.length ? extra.join(", ") : "none");
