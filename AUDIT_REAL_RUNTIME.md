# AURA Arena Runtime Audit

Scope: AI decision, battle start, live battle, finish/settlement, challenges, performance,
leaderboard, battle detail / ShareCard, news. Read-only inspection of the files directly on
those paths. No build, lint, typecheck, test or migration was run. Nothing was modified.

## Verdict

**MOSTLY REAL**

The initial battle decision is genuinely produced by OpenRouter from real OKX data and real RSS
articles, with no deterministic fallback anywhere on that path. Entry, live and exit prices are
real OKX quotes, and WIN/LOSS/DRAW is derived from `direction + real entry + real exit`.
Completed battles persist in Supabase, and both performance and the leaderboard read persisted
data.

It is not fully REAL because of one unconditional path: the challenge pipeline recomputes
direction and confidence with the deterministic factor model and writes the result over the
persisted `ai_direction` / `ai_confidence_after`. After any challenge, the direction that
settles the battle is no longer the model's.

---

## Critical Issues

### 1. A challenge replaces the OpenRouter direction and confidence with deterministic factor math, and that is what settles

- **File/function**
  - `src/app/api/challenges/route.ts:133-136`
  - `src/lib/challenge/pipeline.ts:20-29,86-88` (`runChallenge`)
  - `src/lib/engine/recalc.ts:68-129` (`recalculate`), `:26-33` (`classifyDirection`)
  - `src/lib/ai/custom-strategy.ts:109-127` (`configuredDirection` / `customAgentDirectionForConviction`)

- **Problem**
  `runChallenge` recomputes conviction as a weighted average of `thesis.factors` — the
  deterministic factor scores from `buildFactors` / `buildConfiguredFactors`, which the AI
  decision path explicitly does not use as the decision — and maps it to a direction with
  `classifyDirection` (built-in agents) or `customAgentDirectionForConviction` (custom agents).
  It then assigns `thesis.direction = recalc.newDirection` and
  `thesis.confidence = recalc.newConfidence` unconditionally, and the route copies both onto the
  battle: `battle.ai_direction = battle.thesis.direction`,
  `battle.ai_confidence_after = battle.thesis.confidence`.

  Three concrete flips, none of which require the challenge to be judged valid (the assignment is
  not gated on `materiallyValid`):
  - The model returned `WAIT`. `stanceOf("WAIT")` is `"LONG"` (`recalc.ts:43-45`), so the
    no-position decision becomes a real `LONG` position once conviction ≥ 60.
  - Built-in agent, conviction in the 45–60 band → `WAIT`, zeroing `ai_pnl` for a decision the
    model made with high confidence.
  - Custom agent: `configuredDirection` reverses the side when
    `conviction < threshold - 15`, and `decisionThreshold` reaches 68–80 for
    `CONSERVATIVE` / `HIGH_CONFIDENCE` / `WAIT_CONFIRMATION` configurations. A mid-50s conviction
    (the common case, since `social` and `whale_activity` contribute exactly 0 — see
    `src/lib/evidence/engine.ts:64-79`, `src/lib/ai/factors.ts:60-66`) turns a model `SHORT` into
    a persisted `LONG`.

  The model's confidence is also replaced by conviction, so `ai_confidence_before -> after` as
  shown on the ShareCard is "model value → factor-model value", not a model revision.

- **Actual execution path**
  `POST /api/challenges` → `runChallenge` → `evaluateChallenge` → `recalculate` (deterministic) →
  `thesis.direction/confidence` mutated → `battle.ai_direction` / `ai_confidence_after`
  overwritten → `persistBattle` (writes `user_battles.battle`) → later
  `POST /api/battles/[id]/finish` → `updateLivePnl(battle, exitPrice)` reads
  `battle.ai_direction` → `positionPnl` → `computeWinner` → `settle_wallet_battle` (balance,
  counters, reputation) → leaderboard / performance / detail / ShareCard.

- **Can it affect persisted result?** **YES** — unconditionally, for every battle that receives
  at least one challenge. It changes the persisted direction, the persisted confidence, `ai_pnl`,
  the winner, the credited balance and both leaderboards.

- **Minimal fix required**
  Keep the challenge pipeline's effect on weights/confidence, but stop it deciding the side: do
  not assign `thesis.direction` / `battle.ai_direction` from `recalc.newDirection`. Either drop
  those two lines and report `newDirection` as analysis-only, or re-ask OpenRouter with the
  challenge as input and take direction only from that response. Leave `ai_confidence_after`
  reflecting a recalculation only if the UI stops presenting it as the model's own revision.

### 2. Store-first reads can serve a stale in-memory battle and then overwrite the persisted record

- **File/function**
  - `src/app/api/battles/[id]/finish/route.ts:29-33`
  - `src/app/api/battles/[id]/route.ts:17-21`, `src/app/api/battles/[id]/start/route.ts:15-19`
  - `src/app/api/challenges/route.ts:120-124`
  - `src/lib/store.ts:21-28` (module-global `Map` on `globalThis`)

- **Problem**
  Every battle route reads `getBattle(id)` first and only falls back to Supabase when the entry
  is missing or owned by another user. The in-memory copy is authoritative for the read, and every
  subsequent write pushes that whole object back with `persistBattle` /
  `settle_wallet_battle` (`update public.user_battles set battle = p_battle`). With more than one
  server instance (any serverless/multi-worker deployment), instance A can hold a pre-challenge
  copy while instance B has already persisted the challenge; if A then handles `finish`, it settles
  from its stale `ai_direction` and writes its stale object over the persisted record, dropping the
  challenge array and the post-challenge state.

- **Actual execution path**
  Instance A: `POST /api/battles` → `saveBattle` (A's memory) → instance B: `POST /api/challenges`
  → `persistBattle` (DB updated) → instance A: `POST /api/battles/[id]/finish` → `getBattle` hits
  A's stale copy → `updateLivePnl` with stale `ai_direction` → `settle_wallet_battle(p_battle =
  stale object)` → DB row replaced.

- **Can it affect persisted result?** **YES** in any multi-instance deployment (single local
  process is unaffected, because the in-memory object is the same reference the writes mutate).

- **Minimal fix required**
  Make Supabase the read source of truth on the mutating routes: load with `loadBattle(...)` first
  (or unconditionally re-read before `finish`), and use the in-memory store only as a cache that is
  never preferred over the persisted row.

---

## Medium Issues

### 1. Two concurrent `finish` requests can rewrite the persisted exit price and winner after the account was already credited

- `src/app/api/battles/[id]/finish/route.ts:35-115`, `supabase/migrations/202608150002_wallet_accounts.sql:147-206`.
- Both requests read the battle before either sets `settlement_applied`, so both fetch their own
  `getPrice`, compute their own winner, and call `settle_wallet_battle`. The row lock correctly
  prevents double-crediting — the second call takes the already-settled branch — but that branch
  still runs `update public.user_battles set battle = p_battle`, so the persisted `exit_price`,
  `ai_pnl`, `human_pnl` and `winner` become the *second* quote's values while the balance,
  win/loss counters and reputation came from the first. Reachable with two browser tabs on the same
  battle, since both auto-settle at `remaining === 0` (`src/app/arena/[battleId]/page.tsx:188-196`;
  the `finishRequested` ref only guards one tab).
- Minimal fix: in the already-settled branch of `settle_wallet_battle`, keep the stored battle
  rather than overwriting it (or overwrite only non-result fields).

### 2. `settlement_applied` is set before the settlement write succeeds and is never rolled back

- `src/app/api/battles/[id]/finish/route.ts:100-106` sets `battle.settlement_applied = true` and
  mutates `status`, `exit_price`, `winner` in memory *before* `settleWalletBattle`. If the RPC
  throws, the route returns 503 but the in-memory battle is left FINISHED + settled while the
  persisted row is still ACTIVE and unsettled. A retry hitting the same instance takes the
  idempotent early return at `:38-40` and reports a settled battle that was never persisted or
  credited — so the detail page and ShareCard show a winner that no persisted record supports.
- Minimal fix: set `settlement_applied` (and the FINISHED status) only after
  `settleWalletBattle` resolves, or restore the previous values in the catch block.

---

## Verified Correct

- **AI decision is the model's.** `src/lib/ai/decision.ts` has no heuristic, no default direction
  and no fallback confidence; `chatOrThrow` (`src/lib/ai/openrouter.ts:66-107`) throws `AiError`
  instead of returning null, and `POST /api/battles` (`src/app/api/battles/route.ts:78-88`) creates
  and persists nothing when it throws. The narration-only `chat()` client is used solely by
  `explainRecalculation` / `explainCustomRecalculation`.
- **`buildFactors` / `buildConfiguredFactors` stances are not the decision at creation.** Both are
  called for `factors` only (`src/lib/ai/thesis.ts:49`, `src/lib/ai/custom-thesis.ts:115`); the
  returned `stance` is discarded, and the prompt labels the technical block as unweighted context
  containing no direction (`decision.ts:98-118`).
- **`live-signal.ts` is display-only.** `computeLiveSignal` runs in the browser
  (`"use client"`), and its `direction`/`confidence` are never sent to any route — `start`,
  `finish` and `/api/challenges` carry no client direction, and the detail page renders it as
  "Current signal", separate from the persisted "Battle direction"
  (`src/app/arena/[battleId]/page.tsx:442-476`).
- **No mock/seeded/random decision path.** No `Math.random`, seeded price, synthetic candle or
  fabricated sentiment reaches a battle: `src/lib/market/okx.ts` and `src/lib/market/adapter.ts`
  throw `MarketDataError` instead of substituting, `src/lib/evidence/engine.ts` reports unconnected
  factors as unavailable with a fixed neutral 50 that contributes 0, and `snapshotFromMarket`
  leaves `aiSignal`/`aiConfidence` null. The only `Math.random` uses are `uid()` and a localStorage
  client id.
- **Entry / live / exit prices are real OKX.** Creation uses `getSnapshot` (`battles/route.ts:51`),
  start re-anchors entry with `getPrice` and refuses to start on failure (`start/route.ts:34-39`),
  live polling keeps the last real price and flags `priceStale` rather than inventing one
  (`[id]/route.ts:40-56`), and finish refuses to settle without a real quote
  (`finish/route.ts:54-59`). Ticker/candle caches are 10s/15s TTL on real OKX responses — bounded
  delay on genuine quotes, not substituted data.
- **Settlement math.** `positionPnl` and `computeWinner` (`src/lib/battle/engine.ts:4-20`) use
  `ai_direction` / `human_direction`, the real `entry_price` and the real exit price only; `WAIT`
  correctly yields no position. Server-authoritative — no client P&L is accepted.
- **News reaches the prompt and is not fabricated.** `fetchAssetNews` → `requestDecision` →
  `newsBlock` (`decision.ts:121-147`). `src/lib/news/rss.ts` copies title/url/publishedAt from the
  feeds, sets `sentiment: null`, skips unparseable entries and dates, and never fills a gap.
  `AVAILABLE` / `NO_MATCHES` / `UNAVAILABLE` are distinct in the type, in the prompt text, and in
  `/api/news/sync` (200 vs 503). `detail.newsSentiment` is forced to null unless
  `news.status === "AVAILABLE"` (`decision.ts:246`), so an AI guess cannot be presented as
  coverage.
- **Persistence.** `persistBattle` upserts into `user_battles`; `settle_wallet_battle` updates
  balance, counters, reputation and the battle row in one transaction under `for update`, and is
  idempotent on `settlement_applied` (no double-crediting).
- **Performance reads persisted data.** `GET /api/battles?scope=mine` →
  `listBattlesForUser` (Supabase, `owner_id` filtered); the Performance view filters
  `FINISHED`/`VERIFIED` and sums persisted `human_pnl`
  (`src/components/arena-workspace.tsx:245,450-472,931-932`).
- **Leaderboard reads persisted data.** `loadLeaderboard` calls the security-definer
  `leaderboard_humans` / `leaderboard_agents` functions, which aggregate
  `demo_accounts` counters and settled `user_battles`; a read failure returns 503 rather than
  zeros. `store.ts` no longer feeds it.
- **Custom-agent stats are owner-scoped and excluded from the public league.**
  `/api/custom-agents*` filter `owner_id = auth.user.id`; card stats are derived client-side from
  the caller's own persisted battles filtered by `customAgentId` and `settlement_applied`
  (`src/components/custom-agents.tsx:235-248`); `leaderboard_agents` excludes
  `agentId = 'custom'`; `finish` skips public agent stats for custom battles.
- **`store.ts` is not the persistence source of truth for results.** All results are written to
  Supabase, and the unauthenticated `GET /api/battles` deliberately filters wallet-owned battles
  out of the in-memory list. (Its use as the preferred *read* path is Critical #2 above.)
- **Battle detail and ShareCard display persisted fields.** `ShareCard`
  (`src/components/share-card.tsx`) renders only `winner`, `ai_pnl`, `human_pnl`,
  `ai_direction`, `human_direction`, `ai_confidence_before/after`, `thesis.direction` and X Layer
  state — nothing recomputed. The detail page switches to the recorded values once settled:
  `shownPnl = finished ? battle.ai_pnl : livePosition.pnl`,
  `shownPrice = finished ? battle.exit_price ?? battle.current_price : livePrice`
  (`src/app/arena/[battleId]/page.tsx:404-405`), and "Thesis at entry" is the persisted model
  reasoning.

---

## Remaining Runtime Flow

```
Agent (built-in AGENT_LIST / owner-configured custom_agents row)
  → OKX            getSnapshot + getCandles(100, 1m)        [real, throws on failure]
  → News           fetchAssetNews → RSS (CoinDesk, Cointelegraph)
                   AVAILABLE / NO_MATCHES / UNAVAILABLE     [no substitution]
  → OpenRouter     requestDecision(briefing + market + technical context + news)
                   chatOrThrow → strict zod validation      [no fallback decision]
  → Decision       direction / confidence / reasoning / keyEvidence / newsSentiment
  → Battle         POST /api/battles → persistBattle (user_battles)
                   POST /start → entry_price re-anchored from getPrice
  → Live OKX       GET /api/battles/[id] → getPrice → updateLivePnl → persistBattle
                   (browser also runs live-signal.ts: DISPLAY ONLY)
  → [Challenges]   POST /api/challenges → deterministic recalculate()
                   ⚠ OVERWRITES ai_direction + ai_confidence_after (Critical #1)
  → Settlement     POST /finish → getPrice (exit) → positionPnl(entry, exit)
                   → computeWinner(human_pnl, ai_pnl) → status FINISHED
  → Supabase       settle_wallet_battle: demo_accounts, profiles.reputation_score,
                   user_battles.battle (locked, idempotent on settlement_applied)
  → Performance    GET /api/battles?scope=mine → listBattlesForUser (persisted)
    Leaderboard    GET /api/leaderboard → leaderboard_humans / leaderboard_agents (persisted)
  → Detail/Card    persisted battle fields; live feed only while ACTIVE
```

---

## Minimal Next Steps

1. Stop the challenge pipeline from writing the direction: remove the
   `thesis.direction = recalc.newDirection` / `battle.ai_direction = battle.thesis.direction`
   assignment (`src/lib/challenge/pipeline.ts:88`, `src/app/api/challenges/route.ts:134`), or
   replace it with a fresh OpenRouter decision that receives the challenge. This is the only fix
   required to make the settled direction genuinely the model's.
2. Re-read the battle from Supabase (not `store.ts`) at the start of `finish`, `start`,
   `/api/challenges` and `/api/onchain/finalize`, so a stale in-memory copy can never overwrite
   persisted state.
3. In `settle_wallet_battle`'s already-settled branch, do not overwrite the stored battle JSON.
4. Move `battle.settlement_applied = true` (and the FINISHED/exit/winner mutations) to after
   `settleWalletBattle` succeeds.
