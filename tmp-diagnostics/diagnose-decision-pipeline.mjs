// Pinpoints which upstream dependency is failing inside generateAndStore().
//
//   node tmp-diagnostics/diagnose-decision-pipeline.mjs
//
// READ-ONLY. Writes nothing, fabricates nothing.
//
// Why these four checks: src/lib/agents/decision-service.ts:56-84 runs, in order,
//   1. getSnapshot(def)      -> OKX ticker
//   2. getCandles(def, 100)  -> OKX candles
//   3. generateThesis(...)   -> OpenRouter chatOrThrow
//   4. writeAgentDecision()  -> service-role upsert
// The FIRST of these to fail is the cause of BOTH symptoms: POST /api/battles
// returns 503 and POST /api/agents/decisions leaves agent_decisions empty, so the
// cards fall back to their absent state.
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

// Same defaults as src/lib/config.ts.
const OKX = env.OKX_API_BASE_URL || "https://www.okx.com";
const MODEL = env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
const OR_KEY = env.OPENROUTER_API_KEY || "";
const INST = "BTC-USDT";

const verdicts = [];
function record(step, ok, detail) {
  verdicts.push({ step, ok, detail });
  console.log(`  ${ok ? "OK  " : "FAIL"} ${step}${detail ? ` — ${detail}` : ""}`);
}

async function timed(fn, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const started = Date.now();
  try {
    const res = await fn(controller.signal);
    return { res, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

console.log(`OKX base:  ${OKX}`);
console.log(`OR model:  ${MODEL}\n`);

// --- 1. OKX ticker (getSnapshot) --------------------------------------------
console.log("1. OKX ticker — getSnapshot(def)");
try {
  const { res, ms } = await timed((signal) =>
    fetch(`${OKX}/api/v5/market/ticker?instId=${INST}`, { signal }));
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  if (res.status !== 200) {
    record("HTTP status", false, `HTTP ${res.status} in ${ms}ms — ${text.slice(0, 200)}`);
  } else if (body?.code !== "0") {
    record("OKX envelope code", false, `code=${body?.code} msg=${body?.msg} — ${text.slice(0, 160)}`);
  } else {
    record("HTTP status", true, `HTTP 200 in ${ms}ms, last=${body?.data?.[0]?.last}`);
  }
} catch (error) {
  record("reachability", false, `${error.name}: ${error.message}${error.cause ? ` (cause: ${error.cause.code ?? error.cause.message})` : ""}`);
}

// --- 2. OKX candles (getCandles) --------------------------------------------
console.log("\n2. OKX candles — getCandles(def, 100)");
try {
  const { res, ms } = await timed((signal) =>
    fetch(`${OKX}/api/v5/market/candles?instId=${INST}&bar=1m&limit=100`, { signal }));
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  if (res.status !== 200) {
    record("HTTP status", false, `HTTP ${res.status} in ${ms}ms — ${text.slice(0, 200)}`);
  } else if (body?.code !== "0") {
    record("OKX envelope code", false, `code=${body?.code} msg=${body?.msg}`);
  } else {
    record("HTTP status", true, `HTTP 200 in ${ms}ms, ${body?.data?.length ?? 0} candles`);
  }
} catch (error) {
  record("reachability", false, `${error.name}: ${error.message}${error.cause ? ` (cause: ${error.cause.code ?? error.cause.message})` : ""}`);
}

// --- 3. OKX instruments (resolveTradableAsset / /api/markets) ---------------
console.log("\n3. OKX SPOT instruments — instrument validation");
try {
  const { res, ms } = await timed((signal) =>
    fetch(`${OKX}/api/v5/public/instruments?instType=SPOT`, { signal }), 20000);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { /* non-JSON */ }
  if (res.status !== 200 || body?.code !== "0") {
    record("instrument list", false, `HTTP ${res.status} code=${body?.code} — ${text.slice(0, 160)}`);
  } else {
    const has = (body.data ?? []).some((i) => i.instId === INST);
    record("instrument list", has, `HTTP 200 in ${ms}ms, ${body.data?.length} instruments, ${INST} listed: ${has}`);
  }
} catch (error) {
  record("reachability", false, `${error.name}: ${error.message}${error.cause ? ` (cause: ${error.cause.code ?? error.cause.message})` : ""}`);
}

// --- 4. OpenRouter with the CONFIGURED model (chatOrThrow) ------------------
console.log(`\n4. OpenRouter — chatOrThrow with "${MODEL}"`);
if (!OR_KEY) {
  record("OPENROUTER_API_KEY", false, "absent — chatOrThrow throws AI_UNAVAILABLE immediately");
} else {
  try {
    const { res, ms } = await timed((signal) =>
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OR_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://aura-arena.app",
          "X-Title": "AURA Arena",
        },
        // Minimal probe: proves the model id resolves and the key is accepted.
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: "Reply with the single word OK." }],
          max_tokens: 5,
        }),
        signal,
      }));
    const text = await res.text();
    if (res.status !== 200) {
      let msg = text.slice(0, 240);
      try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* keep raw */ }
      record("model call", false, `HTTP ${res.status} in ${ms}ms — ${msg}`);
    } else {
      const content = JSON.parse(text)?.choices?.[0]?.message?.content;
      record("model call", Boolean(content && content.trim()), `HTTP 200 in ${ms}ms, content=${JSON.stringify(content ?? null)}`);
    }
  } catch (error) {
    record("reachability", false, `${error.name}: ${error.message}`);
  }
}

// --- verdict ----------------------------------------------------------------
const failed = verdicts.filter((v) => !v.ok);
console.log(`\n${"=".repeat(70)}`);
if (!failed.length) {
  console.log("All four upstreams are healthy.");
  console.log("If POST still 503s, the failure is in writeAgentDecision() (service-role");
  console.log("upsert) or inside generateThesis() itself — capture the dev-server");
  console.log("console, which logs [openrouter], [agent-decisions] and [markets] lines.");
} else {
  console.log(`FIRST FAILING STEP: ${failed[0].step} — ${failed[0].detail}`);
  console.log("\nThis is the cause of BOTH the /api/battles 503 and the empty");
  console.log("agent_decisions table. Steps 1-2 surface as a MarketDataError");
  console.log('("Market data unavailable."); step 4 surfaces as an AiError.');
}
process.exitCode = failed.length ? 1 : 0;
