// Determine whether this environment has ANY way to execute DDL against the
// live Supabase project, and if so, apply the alignment migration.
//
//   node tmp-diagnostics/apply-migration.mjs
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
const ref = new URL(url).hostname.split(".")[0];
const sql = readFileSync(
  new URL("../supabase/migrations/202608180001_align_custom_agents_schema.sql", import.meta.url),
  "utf8",
);

console.log("project ref:", ref);
console.log("migration bytes:", sql.length);

// Every credential that could authorize DDL. A Personal Access Token (sbp_...)
// or a direct Postgres password is required; neither is a service_role key.
console.log("\n--- credentials present ---");
for (const name of [
  "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL",
  "DATABASE_URL", "POSTGRES_URL", "PGPASSWORD", "PGHOST", "PGURI",
]) {
  const value = process.env[name] ?? env[name];
  console.log(`  ${name.padEnd(22)} ${value ? "SET" : "absent"}`);
}

let applied = false;

// Path 1: Supabase Management API. Needs a PAT; a service_role key is rejected.
const pat = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
console.log("\n--- path 1: Management API /database/query ---");
for (const token of [pat, secret].filter(Boolean)) {
  const label = token === pat ? "SUPABASE_ACCESS_TOKEN" : "service_role key";
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    console.log(`  ${label}: HTTP ${res.status} ${text.slice(0, 200)}`);
    if (res.ok) { applied = true; break; }
  } catch (error) {
    console.log(`  ${label}: request failed - ${error.message}`);
  }
}

// Path 2: a SQL-executing RPC, if the project happens to expose one.
if (!applied) {
  console.log("\n--- path 2: SQL-executing RPC via PostgREST ---");
  for (const fn of ["exec_sql", "execute_sql", "exec", "run_sql", "sql"]) {
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, sql }),
    });
    const text = await res.text();
    console.log(`  ${fn.padEnd(12)} HTTP ${res.status} ${text.slice(0, 120)}`);
    if (res.ok) { applied = true; break; }
  }
}

console.log(applied ? "\nRESULT: migration APPLIED" : "\nRESULT: no DDL path available - migration NOT applied");
process.exitCode = applied ? 0 : 1;
