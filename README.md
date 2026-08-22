# ⚔️ AURA ARENA

## Challenge the machine. Break its thesis. Prove the result.

AURA Arena is a competitive AI trading arena where specialized AURA
agents analyze live OKX market conditions, humans challenge their
theses, battles run on server-authoritative market prices, and completed
results become persistent performance data and shareable battle cards.

> **AI predicts. You challenge. The market decides.**

------------------------------------------------------------------------

## 1. Product in one sentence

**AURA Arena turns AI trading predictions into competitive, measurable
battles between humans and specialized AI agents.**

The core loop is:

``` text
LIVE OKX MARKET
      ↓
MARKET CONTEXT
      ↓
AURA AGENT THINKS
      ↓
AI DECISION + THESIS
      ↓
HUMAN CHALLENGES
      ↓
EVIDENCE / RECALCULATION
      ↓
HUMAN vs AI BATTLE
      ↓
SERVER SETTLEMENT
      ↓
REAL P&L / WINNER
      ↓
SUPABASE PERSISTENCE
      ↓
REPUTATION / PERFORMANCE
      ↓
SHARE CARD
```

------------------------------------------------------------------------

# 2. What AURA Arena actually is

A normal AI trading product says:

> "BTC looks bullish."

AURA Arena asks:

> **"You think it will go up? Prove it. I challenge you."**

The AI receives market context and generates a structured decision. The
human can take the other side. Both are exposed to the same market
movement. At the end, the server calculates the result using the real
entry/exit prices and the configured battle rules.

The product deliberately combines:

-   crypto market terminal
-   AI intelligence
-   specialized agent personalities
-   human-vs-AI competition
-   evidence-based challenges
-   deterministic P&L
-   persistent performance
-   X Layer testnet infrastructure
-   social result cards

The **Arena** is the fun/competitive layer on top of a serious backend.

------------------------------------------------------------------------

# 3. Product personality

AURA Arena is designed to feel like:

``` text
Trading terminal
      +
AI intelligence lab
      +
competitive game
      +
crypto-native product
```

The visual language is:

-   dark
-   futuristic
-   purple energy
-   green positive states
-   red negative states
-   strong typography
-   compact data panels
-   agent cards
-   battle cards
-   terminal-style market information

The product should feel serious enough for traders but entertaining
enough that users want to challenge an AI repeatedly.

------------------------------------------------------------------------

# 4. The AURA agent roster

The current application has a canonical roster including:

-   **NOVA**
-   **VOLT**
-   **MIRA**
-   **QUANTA**
-   **ATLAS**
-   **RIFT**

Each agent has its own identity, strategy and personality.

Examples of the current specialization direction:

  Agent    Identity / specialization
  -------- --------------------------------------
  NOVA     Wallet-flow / on-chain intelligence
  VOLT     Momentum / market movement
  MIRA     Strategy specialization
  QUANTA   Quantitative analysis
  ATLAS    Market structure, liquidity and flow
  RIFT     Market anomaly detection

The important architectural rule is:

``` text
AGENT IDENTITY
+
AGENT PERSONA
+
MARKET CONTEXT
+
AI REASONING
=
AURA DECISION
```

The underlying LLM is an intelligence provider. It is not the visible
product identity.

------------------------------------------------------------------------

# 5. Custom agents

One of the fun parts of AURA Arena is the custom-agent system.

The idea is:

> **Build your fighter. Give it a personality. Put it in the arena.**

A custom agent belongs to its authenticated owner.

Conceptually:

``` text
Create Agent
   ↓
Name
   ↓
Visual identity
   ↓
Strategy/personality
   ↓
Configuration
   ↓
Save
   ↓
Your agent enters the Arena
```

Examples of possible identities:

-   Momentum Hunter
-   News Sniper
-   Whale Tracker
-   Mean Reversion
-   Risk Guardian
-   Contrarian
-   Macro Agent
-   Scalper

The application keeps custom-agent statistics owner-scoped and separates
custom agents from the public canonical agent league.

------------------------------------------------------------------------

# 6. How the AI works

AURA deliberately separates **AI reasoning** from **financial
calculations**.

### The AI is used for:

-   market thesis
-   reasoning
-   evidence interpretation
-   challenge interpretation
-   agent personality
-   structured direction
-   confidence
-   key evidence
-   news context when valid

### Deterministic application code controls:

-   price
-   entry
-   exit
-   stake
-   leverage
-   P&L
-   maximum-loss rules
-   battle timing
-   settlement
-   winner
-   balance accounting

The model cannot simply say:

``` text
“I won +50 AURA.”
```

The backend calculates what actually happened.

------------------------------------------------------------------------

# 7. AI architecture

The runtime intelligence path is approximately:

``` text
AURA AGENT
    ↓
SELECTED MARKET
    ↓
OKX SNAPSHOT
    ↓
OKX CANDLES
    ↓
TECHNICAL / MARKET CONTEXT
    ↓
NEWS CONTEXT
    ↓
AGENT PERSONA
    ↓
OPENROUTER
    ↓
STRUCTURED MODEL RESPONSE
    ↓
SCHEMA VALIDATION
    ↓
AURA DECISION
```

The decision contains structured information such as:

``` text
direction
confidence
reasoning
key evidence
news context / sentiment where valid
```

The application should reject invalid model output rather than inventing
a fake decision.

------------------------------------------------------------------------

# 8. OpenRouter

OpenRouter is used as the server-side LLM gateway.

The conceptual request is:

``` text
AURA backend
    │
    ├── agent identity
    ├── strategy/persona
    ├── market price
    ├── candles
    ├── technical context
    └── valid news context
            ↓
        OpenRouter
            ↓
          LLM
            ↓
     structured response
            ↓
      validation
            ↓
      AURA decision
```

`OPENROUTER_API_KEY` must remain server-side.

Never expose it using a `NEXT_PUBLIC_*` variable.

------------------------------------------------------------------------

# 9. Why structured AI output matters

LLMs are probabilistic.

Battle settlement must not be.

Therefore:

``` text
LLM response
     ↓
parse
     ↓
validate
     ↓
valid AURA decision
     ↓
battle system
```

If the model produces malformed output, the correct behavior is to
report an AI/decision failure rather than silently fabricate:

``` text
LONG
SHORT
WAIT
```

just to make the UI look active.

------------------------------------------------------------------------

# 10. OKX market integration

OKX is the application's market-data source.

The market layer is designed around a canonical market registry rather
than separate hardcoded lists in each component.

Conceptually:

``` text
OKX instruments
      ↓
Market Registry
      ↓
AURA application
```

A market can carry information such as:

``` text
symbol
instId
base currency
quote currency
display name
price
24h change
high
low
volume
live state
icon
```

The selected market should control the whole pipeline.

For example:

``` text
ETH-USDT selected
       ↓
OKX ETH-USDT
       ↓
ETH ticker
       ↓
ETH candles
       ↓
ETH technical context
       ↓
agent decision for ETH
       ↓
ETH battle
       ↓
ETH P&L
       ↓
ETH settlement
```

This prevents stale BTC/ETH/SOL hardcoding from leaking into another
market.

------------------------------------------------------------------------

# 11. OKX live data: WebSocket + API

The market service uses OKX market infrastructure for real market
information.

The architecture separates:

### Live updates

Useful for:

-   live ticker
-   price movement
-   live battle display

### HTTP/server retrieval

Useful for:

-   snapshots
-   candles
-   server-side market operations
-   API routes

The browser can display live signals, but final settlement remains
server-authoritative.

The market layer also uses bounded caching around real OKX responses to
reduce unnecessary repeated requests.

------------------------------------------------------------------------

# 12. News pipeline

AURA can enrich the agent's market context with RSS news.

The current architecture includes feeds such as:

-   CoinDesk
-   Cointelegraph

The news system deliberately distinguishes:

``` text
AVAILABLE
NO_MATCHES
UNAVAILABLE
```

If no valid news exists, AURA does not fabricate it.

The pipeline is:

``` text
RSS
 ↓
parse
 ↓
validate title/url/date
 ↓
asset-specific news
 ↓
AI context
```

News sentiment is only treated as available when the underlying news
coverage is actually available.

------------------------------------------------------------------------

# 13. The agent decision

A decision can look conceptually like:

``` text
Agent:
NOVA

Market:
ETH-USDT

Decision:
LONG

Confidence:
80%

Thesis:
Market structure and flow support continuation.

Key evidence:
- positive momentum
- supportive volume
- wallet activity
- liquidity
```

Those values come from the actual decision pipeline.

They should never be hardcoded just to make the Agents page look alive.

------------------------------------------------------------------------

# 14. Challenge system

The most interesting AURA feature is the human challenge.

Example:

``` text
AI thesis:

“Momentum is building and liquidity supports
a bullish continuation.”

AI:
LONG
80% confidence
```

Human:

``` text
“Your social signal is inflated by low-quality bot accounts.”
```

AURA can then process the challenge:

``` text
Human challenge
      ↓
Evidence interpretation
      ↓
Evidence quality
      ↓
Factor adjustment
      ↓
AI recalculation
      ↓
Updated decision
```

The goal is not random animation.

The challenge should be connected to actual evidence/calculation.

------------------------------------------------------------------------

# 15. Recalculation

The recalculation engine can transform the agent's factor model.

Conceptual example:

``` text
BEFORE

Momentum       25%
Volume         20%
Social         25%
Whale          20%
Liquidity      10%

Confidence     78%
Direction      LONG
```

After a supported challenge:

``` text
Social         25% → 8%

Confidence     78% → 59%

LONG → WAIT
```

The exact values are produced by the existing recalculation engine.

The UI should display the actual result.

------------------------------------------------------------------------

# 16. Why recalculation matters

Without recalculation:

``` text
AI says something
↓
human types something
↓
nothing changes
```

With recalculation:

``` text
AI thesis
   ↕
human evidence
   ↕
AI re-evaluation
   ↓
new state
```

That turns the AI from a static prediction box into a competitor that
can be challenged.

------------------------------------------------------------------------

# 17. Battle system

A battle has two sides:

``` text
AURA AGENT
    VS
HUMAN
```

The human chooses:

``` text
LONG
SHORT
WAIT
```

The battle also contains:

``` text
market
stake
leverage
duration
entry price
current price
P&L
status
```

The server remains authoritative.

------------------------------------------------------------------------

# 18. Battle creation

Simplified flow:

``` text
User selects agent
        ↓
User selects market
        ↓
User selects position
        ↓
User selects stake
        ↓
User selects leverage
        ↓
Enter Battle
        ↓
POST /api/battles
        ↓
server validation
        ↓
agent decision
        ↓
battle persistence
        ↓
battle start
```

The start route re-anchors the entry price using the current server
market price.

------------------------------------------------------------------------

# 19. Battle timing

Battle duration is backend-authoritative.

The UI timer is not the source of truth.

Conceptually:

``` text
START
 ↓
server start timestamp
 ↓
duration
 ↓
ACTIVE
 ↓
finish window
 ↓
server exit price
 ↓
SETTLEMENT
```

This prevents a browser timer from changing the actual settlement
window.

------------------------------------------------------------------------

# 20. Leverage

The current supported leverage set includes:

``` text
30x
50x
100x
120x
```

Leverage is persisted with the battle.

The same canonical leverage/P&L rules are used for live calculations and
settlement.

The existing battle engine also enforces the configured maximum-loss
cap.

------------------------------------------------------------------------

# 21. P&L calculation

P&L is deterministic.

The settlement engine uses:

``` text
AI direction
Human direction
Entry price
Exit price
Stake
Leverage
```

For example:

``` text
Entry:
2,400

Exit:
2,420

AI:
LONG

Human:
SHORT
```

The backend determines the result from those facts.

The AI does not calculate its own P&L.

The browser does not get to choose its final P&L.

------------------------------------------------------------------------

# 22. Settlement

The authoritative settlement flow is approximately:

``` text
Battle active
     ↓
POST /api/battles/[id]/finish
     ↓
get current/exit price
     ↓
calculate AI P&L
     ↓
calculate human P&L
     ↓
compute winner
     ↓
update accounting
     ↓
update reputation/counters
     ↓
persist FINISHED
```

Settlement is designed to be idempotent.

A repeated finish request must not double-credit the same battle.

------------------------------------------------------------------------

# 23. Winner calculation

The result compares:

``` text
AI P&L
vs
Human P&L
```

The winner is determined by the settlement engine.

Typical outcomes:

``` text
AI WON
HUMAN WON
```

The result is persisted.

The UI displays the recorded result rather than calculating a new result
after the fact.

------------------------------------------------------------------------

# 24. Supabase

Supabase is the persistent backend data layer.

It supports areas including:

-   authentication/session
-   profiles
-   demo accounts
-   battles
-   agent decisions
-   custom agents
-   reputation/performance
-   withdrawals
-   settlement state

Important data must not live only in React state or browser local
storage.

------------------------------------------------------------------------

# 25. Database ownership

The logical data model contains areas such as:

### Profiles

User profile/account information.

### Demo accounts

AURA balance and accounting state.

### User battles

Battle state and persisted results.

### Agent decisions

AI decision records.

### Custom agents

Owner-scoped custom agent definitions.

### Withdrawals

Testnet redemption lifecycle.

### Performance / reputation

Data derived from actual settled battles.

### Database functions

Atomic server-side operations such as battle settlement.

------------------------------------------------------------------------

# 26. Battle persistence

Persisted battle data includes fields such as:

``` text
battle ID
owner
agent
market
status
entry price
exit price
human direction
AI direction
stake
leverage
AI P&L
human P&L
confidence before
confidence after
thesis
settlement state
```

The exact database schema is defined by the repository's Supabase
migrations.

The migrations are the schema authority.

------------------------------------------------------------------------

# 27. Supabase security

Supabase access is separated by trust level.

Examples:

``` text
public/anonymous reads
authenticated reads
owner-scoped reads
server-only mutations
```

Custom agents are owner-scoped.

Sensitive accounting mutations can require server/service-role
execution.

Never expose:

``` text
SUPABASE_SECRET_KEY
```

to browser code.

------------------------------------------------------------------------

# 28. Wallet authentication

The application uses wallet-based authentication with Supabase Web3
sessions.

Conceptually:

``` text
Connect wallet
      ↓
Create signed message
      ↓
Wallet signs
      ↓
Identity verified
      ↓
Supabase session
      ↓
AURA account
```

The application verifies that the authenticated identity matches the
active wallet.

This prevents simply trusting a client-submitted wallet address.

------------------------------------------------------------------------

# 29. AURA demo economy

The current welcome/demo balance is:

``` text
800 AURA
```

AURA is the internal demo unit used by the Arena.

The persisted account balance is the source of truth.

The frontend should not simply display a fake balance.

Battle results can affect the persisted demo accounting according to the
existing settlement system.

------------------------------------------------------------------------

# 30. Testnet redemption

The current demo economy also contains a testnet redemption
architecture.

Configured rate:

``` text
1,000 AURA = 1 USDT TESTNET
```

Minimum redemption:

``` text
1,000 AURA
```

The intended flow:

``` text
AURA balance
    ↓
withdraw request
    ↓
server validation
    ↓
AURA reservation
    ↓
withdrawal record
    ↓
treasury transfer
    ↓
actual testnet broadcast
    ↓
transaction hash
    ↓
completed/failed state
```

The treasury private key remains server-side.

The feature is explicitly testnet/no-real-value infrastructure.

Real mode remains separate/Coming Soon.

------------------------------------------------------------------------

# 31. X Layer integration

AURA's X Layer integration is intended to provide blockchain-native
identity/testnet infrastructure and an optional verifiable
finalization/proof layer.

The conceptual proof flow is:

``` text
Battle completed
      ↓
battle result
      ↓
hash / proof data
      ↓
X Layer finalization
      ↓
verifiable on-chain result
```

The contract is not intended to become the trading engine.

It should not custody user battle funds or replace the deterministic
server settlement system.

------------------------------------------------------------------------

# 32. X Layer Testnet

The current X Layer testnet configuration uses:

``` text
Chain ID: 1952
```

Typical server configuration:

``` env
X_LAYER_RPC_URL=
X_LAYER_CHAIN_ID=1952
X_LAYER_CONTRACT_ADDRESS=
```

Testnet must remain separate from mainnet.

The application should never silently fall back from testnet to mainnet.

------------------------------------------------------------------------

# 33. Result / Share Card

A completed battle becomes a visual result card.

The card is generated from the real persisted battle result.

It can show:

``` text
AURA ARENA

AI WON / HUMAN WON

MARKET

AI AGENT

AI POSITION
HUMAN POSITION

AI P&L
HUMAN P&L

AI CONFIDENCE

LEVERAGE
STAKE
```

The result card is deliberately designed as a social asset.

It should look like an Arena result, not a generic browser screenshot.

------------------------------------------------------------------------

# 34. X/Twitter sharing

The production public URL is:

``` text
https://auraarenaokx.vercel.app
```

The share output must never expose:

``` text
localhost
localhost:3000
/arena/battle_<id>
battle_<id>
```

The current sharing concept is:

``` text
completed battle
      ↓
generate P&L card PNG
      ↓
save/download image
      ↓
open X compose directly
      ↓
insert result caption
```

The X web intent cannot directly attach an arbitrary local canvas/blob
image to the compose window, so the application must not falsely claim
that a local browser PNG was uploaded to X automatically.

------------------------------------------------------------------------

# 35. Example X caption

A polished share caption can follow this structure:

``` text
⚔️ AURA ARENA — HUMAN vs AI

🤖 NOVA — AI WON
📊 ETH / USDT

AI: LONG · +2.41 AURA
Human: SHORT · -2.41 AURA

⚡ AI Confidence: 80%
💰 Stake: 100 AURA · 50x

The machine made its move.
Can you beat the AI?

https://auraarenaokx.vercel.app
```

The real values must be injected dynamically.

No hardcoded winner, P&L, market, agent or confidence should be used.

------------------------------------------------------------------------

# 36. Agents page

The Agents page represents the intelligence roster.

An agent card can show:

``` text
agent identity
strategy
current decision
confidence
performance
battle count
```

When no persisted decision exists, the UI should honestly show an
unavailable state.

It must not invent:

``` text
LONG
SHORT
WAIT
```

just to make the card look complete.

------------------------------------------------------------------------

# 37. Performance

Agent performance is derived from actual persisted battle results.

Conceptually:

``` text
settled battles
      ↓
wins / losses
      ↓
P&L
      ↓
win rate
      ↓
agent performance
```

The public leaderboard reads persisted performance data.

Custom-agent statistics remain owner-scoped and are separated from the
public canonical agent league.

------------------------------------------------------------------------

# 38. Reputation

The reputation layer is based on actual results.

Potential metrics include:

``` text
wins
losses
win rate
P&L
challenge success
challenge defense
```

The key principle:

> **Performance must come from recorded battles, not hardcoded marketing
> numbers.**

------------------------------------------------------------------------

# 39. Backend API

The Next.js backend contains routes in the style of:

``` text
/api/agents
/api/agents/decisions

/api/battles
/api/battles/[id]
/api/battles/[id]/start
/api/battles/[id]/finish

/api/challenges
/api/custom-agents

/api/markets
/api/leaderboard

/api/wallet/account
/api/wallet/withdrawals
```

The exact route list should always be checked against the current
repository.

The common pattern is:

``` text
React
 ↓
Next.js API
 ↓
server validation
 ↓
business logic
 ↓
OKX / OpenRouter / Supabase / X Layer
 ↓
validated response
 ↓
React
```

------------------------------------------------------------------------

# 40. Representative project structure

``` text
AURA ARENA/
│
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── agents/
│   │   │   ├── battles/
│   │   │   ├── challenges/
│   │   │   ├── custom-agents/
│   │   │   ├── markets/
│   │   │   ├── leaderboard/
│   │   │   └── wallet/
│   │   │
│   │   ├── arena/
│   │   │   ├── agents/
│   │   │   ├── battles/
│   │   │   ├── markets/
│   │   │   └── [battleId]/
│   │   │
│   │   ├── profile/
│   │   ├── history/
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── arena-workspace.tsx
│   │   ├── custom-agents.tsx
│   │   ├── share-card.tsx
│   │   └── ...
│   │
│   └── lib/
│       ├── ai/
│       ├── battle/
│       ├── market/
│       ├── news/
│       ├── supabase/
│       ├── chain/
│       ├── agents.ts
│       ├── account.ts
│       ├── types.ts
│       └── ...
│
├── supabase/
│   └── migrations/
│
├── contracts/
│
├── public/
│
├── .env.example
├── package.json
└── README.md
```

This is an architectural map, not a promise that every directory
contains only the files shown.

------------------------------------------------------------------------

# 41. Important backend modules

### `src/lib/market/`

Canonical market acquisition and live market data.

### `src/lib/ai/`

Decision generation and AI provider integration.

### `src/lib/news/`

RSS/news retrieval and validation.

### `src/lib/battle/`

Battle timing, position/P&L and deterministic battle rules.

### `src/lib/supabase/`

Persistence, account access and database helpers.

### `src/lib/agents.ts`

Canonical AURA agent configuration.

### `src/components/`

UI and interaction components.

### `src/app/api/`

Server-side API routes.

### `supabase/migrations/`

Database schema, functions and security evolution.

### `contracts/`

X Layer smart-contract code.

------------------------------------------------------------------------

# 42. Data source of truth

This table is one of the most important things for developers to
understand:

  Data                     Source of truth
  ------------------------ ----------------------------------
  Market price             OKX/server market layer
  Candles                  OKX/server market layer
  AI decision              validated decision + persistence
  Battle state             server/database
  Entry price              server
  Exit price               server
  P&L                      deterministic battle engine
  Winner                   settlement engine
  Balance                  Supabase/accounting
  Custom-agent ownership   authenticated Supabase data
  Performance              settled persisted battles
  Withdrawal state         Supabase + actual transfer
  Blockchain transaction   actual X Layer broadcast

------------------------------------------------------------------------

# 43. Security principles

Never expose:

``` text
OPENROUTER_API_KEY
SUPABASE_SECRET_KEY
X_LAYER_DEPLOYER_PRIVATE_KEY
X_LAYER_TREASURY_PRIVATE_KEY
OKX_API_KEY
OKX_API_SECRET
OKX_API_PASSPHRASE
```

Never trust client-generated:

``` text
P&L
balance
settlement
wallet identity
withdrawal state
```

Server validation controls sensitive operations.

------------------------------------------------------------------------

# 44. Environment variables

The repository's `.env.example` is the authoritative list.

Typical categories are:

``` env
# Public deployment origin
NEXT_PUBLIC_SITE_URL=https://auraarenaokx.vercel.app
NEXT_PUBLIC_VERCEL_URL=

# Supabase public
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Supabase server
SUPABASE_SECRET_KEY=

# AI
OPENROUTER_API_KEY=
OPENROUTER_MODEL=

# X Layer server
X_LAYER_RPC_URL=
X_LAYER_CHAIN_ID=1952
X_LAYER_CONTRACT_ADDRESS=
X_LAYER_DEPLOYER_PRIVATE_KEY=

# Testnet redemption
X_LAYER_USDT_CONTRACT_ADDRESS=
X_LAYER_TREASURY_PRIVATE_KEY=

# X Layer public browser config
NEXT_PUBLIC_X_LAYER_EXPLORER=
NEXT_PUBLIC_X_LAYER_CONTRACT_ADDRESS=
NEXT_PUBLIC_X_LAYER_CHAIN_ID=1952

# OKX market data / Web3
OKX_API_BASE_URL=
OKX_WEB3_API_BASE_URL=
OKX_API_KEY=
OKX_API_SECRET=
OKX_API_PASSPHRASE=
OKX_PROJECT_ID=

# News
NEWS_RSS_FEEDS=
```

Do not copy real values into this README.

Do not commit `.env.local`.

------------------------------------------------------------------------

# 45. Local setup

Install dependencies:

``` bash
npm install
```

Create:

``` text
.env.local
```

using the repository's:

``` text
.env.example
```

as the reference.

Then:

``` bash
npm run dev
```

Open:

``` text
http://localhost:3000
```

------------------------------------------------------------------------

# 46. Verification commands

Use the scripts that actually exist in `package.json`.

Typical checks:

``` bash
npm run typecheck
npm run lint
npm run build
```

If the project contains a test script:

``` bash
npm test
```

A complete verification should include both code checks and an
end-to-end browser battle.

------------------------------------------------------------------------

# 47. Full end-to-end test

### Account

``` text
Connect wallet
↓
Authenticate
↓
Load AURA account
```

### Agent

``` text
Open Agents
↓
Load decisions
↓
Verify real state
```

### Market

``` text
Open Markets
↓
Select market
↓
Verify OKX data
```

### Battle

``` text
Select agent
↓
Select market
↓
Select LONG / SHORT / WAIT
↓
Select stake
↓
Select leverage
↓
Enter Battle
```

### Live

``` text
Market moves
↓
current price changes
↓
live P&L changes
```

### Challenge

``` text
Submit challenge
↓
evidence processing
↓
recalculation
↓
decision state updates if warranted
```

### Settlement

``` text
battle ends
↓
server gets exit price
↓
P&L calculated
↓
winner determined
↓
accounting updated
↓
battle persisted
```

### Result

``` text
result page
↓
real winner
↓
real P&L
↓
share card
↓
X caption
```

------------------------------------------------------------------------

# 48. Production / Vercel deployment

AURA Arena is intended to run as a Next.js application on Vercel.

Production URL:

``` text
https://auraarenaokx.vercel.app
```

For deployment:

``` text
1. Push the project to the connected Git repository.
2. Create/connect the Vercel project.
3. Configure the correct build command from package.json.
4. Configure the Next.js runtime for Vercel.
5. Add production environment variables in Vercel.
6. Deploy.
7. Open the production site.
8. Test authentication.
9. Test API routes.
10. Test market data.
11. Test an end-to-end demo battle.
```

Important:

> Changing Vercel environment variables requires a new
> deployment/rebuild so the server runtime receives the new
> configuration.

------------------------------------------------------------------------

# 49. Local vs production debugging

If:

``` text
localhost works
```

but:

``` text
Vercel fails
```

do not immediately modify the database.

Compare:

``` text
LOCAL NEXT.JS RUNTIME
vs
VERCEL NEXT.JS RUNTIME
```

Check:

``` text
Supabase URL
Supabase project
public key
server key
OpenRouter key
X Layer configuration
auth cookies
production origin
server environment
API route execution
```

Then inspect the actual API response and Vercel function logs.

------------------------------------------------------------------------

# 50. Runtime debugging rule

When an API says:

``` text
database unavailable
```

that is not enough.

Trace:

``` text
Browser
 ↓
API route
 ↓
service
 ↓
Supabase client
 ↓
PostgREST
```

Expose/log only safe diagnostics such as:

``` text
project host
authenticated yes/no
agent ID
market
error.code
error.message
error.details
error.hint
HTTP status
```

Never print secrets.

The original PostgREST error is much more useful than a generic UI
error.

------------------------------------------------------------------------

# 51. Failure philosophy

AURA should prefer truthful failure states over fake success.

Examples:

``` text
OKX unavailable
→ report market failure

AI unavailable
→ report decision failure

News unavailable
→ report unavailable news

Supabase unavailable
→ report database failure

X Layer unconfigured
→ report unconfigured verification

Transfer failed
→ report failed withdrawal
```

Never fabricate a value simply because the UI expects one.

------------------------------------------------------------------------

# 52. Why the architecture is interesting

AURA combines:

``` text
LIVE DATA
+
AI
+
SPECIALIZED AGENTS
+
HUMAN EVIDENCE
+
DETERMINISTIC BATTLE ENGINE
+
PERSISTENCE
+
REPUTATION
+
BLOCKCHAIN
+
SOCIAL SHARING
```

The key transformation is:

``` text
AI opinion
```

becomes:

``` text
AI commitment
```

then:

``` text
AI commitment
+
human challenge
+
real market
=
measurable result
```

------------------------------------------------------------------------

# 53. The viral loop

AURA is designed around a natural competitive growth loop:

``` text
User challenges AI
        ↓
AI wins or loses
        ↓
Result card generated
        ↓
User shares
        ↓
Another trader sees it
        ↓
They want to challenge the AI
        ↓
New user enters Arena
        ↓
New battle
```

The result card is therefore a product-growth mechanism, not just a
cosmetic feature.

------------------------------------------------------------------------

# 54. Agent personality

The Arena becomes much more memorable when every agent feels like a
competitor.

Example style:

### ATLAS

Calm and patient.

> "I don't need the first move. I need confirmation."

### RIFT

Anomaly hunter.

> "Something changed in the flow. That is where I look."

### NOVA

On-chain flow specialist.

> "The wallets moved before the chart noticed."

### VOLT

Momentum specialist.

> "Momentum is accelerating. Waiting is also a position."

These personalities should remain connected to real strategy and
decision data.

------------------------------------------------------------------------

# 55. The "fun" rule

AURA should be entertaining, but the jokes must be grounded in real
results.

Example:

``` text
Agent:
“I have reviewed the outcome.”

Human:
“You lost.”

Agent:
“…Correct.”
```

The personality is fun.

The result is still real.

Never turn the agents into random chatbots disconnected from the
market/battle engine.

------------------------------------------------------------------------

# 56. Why the Arena model works

Traditional trading UI:

``` text
chart
indicators
numbers
```

Traditional AI assistant:

``` text
question
answer
```

AURA:

``` text
market
  ↓
agent thesis
  ↓
human disagreement
  ↓
evidence
  ↓
recalculation
  ↓
battle
  ↓
result
  ↓
reputation
```

This creates an actual narrative.

------------------------------------------------------------------------

# 57. Future expansion

The architecture can grow toward:

-   agent tournaments
-   seasonal rankings
-   custom-agent championships
-   public battle feeds
-   agent rivalries
-   longer performance history
-   more strategy types
-   spectator mode
-   agent-vs-agent battles
-   richer challenge evidence
-   deeper on-chain proof

These are future directions and should not be interpreted as already
implemented features.

------------------------------------------------------------------------

# 58. What AURA does NOT claim

AURA Arena should not claim:

-   guaranteed AI profitability
-   guaranteed trading success
-   real-money gambling
-   fake blockchain transactions
-   fake market data
-   fake news
-   fake AI decisions
-   fake P&L
-   fake transaction hashes
-   automatic X image upload when the browser cannot perform it

The strongest product claim is simpler:

> **The AI makes a decision. The market tests it. The server records
> what actually happened.**

------------------------------------------------------------------------

# 59. Developer rules

### Rule 1 --- OKX owns market truth

Do not create a second market source.

### Rule 2 --- OpenRouter provides intelligence

Do not expose the provider as the AURA identity.

### Rule 3 --- Deterministic code owns P&L

Do not let the LLM calculate settlement.

### Rule 4 --- Supabase owns persistence

Do not make React state the source of truth.

### Rule 5 --- Server owns sensitive operations

Do not trust the browser with settlement/accounting.

### Rule 6 --- Never fabricate

If the system does not know, say so.

### Rule 7 --- Preserve the existing architecture

Before adding a new system, find the existing canonical implementation.

------------------------------------------------------------------------

# 60. Where to start reading the code

Recommended order:

``` text
1. package.json

2. src/lib/types.ts

3. src/lib/agents.ts

4. src/lib/market/

5. src/lib/ai/

6. src/lib/news/

7. src/lib/battle/

8. src/lib/supabase/

9. src/app/api/agents/

10. src/app/api/battles/

11. src/app/api/challenges/

12. src/app/api/custom-agents/

13. src/app/arena/

14. src/components/arena-workspace.tsx

15. src/components/share-card.tsx

16. supabase/migrations/

17. contracts/
```

Then trace one completed battle from browser to settlement.

------------------------------------------------------------------------

# 61. How to trace one battle

Start with:

``` text
/arena/battle/[id]
```

Then follow:

``` text
GET battle
 ↓
Supabase battle row
 ↓
agent
 ↓
market
 ↓
entry price
 ↓
exit price
 ↓
AI direction
 ↓
human direction
 ↓
stake
 ↓
leverage
 ↓
AI P&L
 ↓
human P&L
 ↓
winner
 ↓
settlement_applied
```

This gives the complete persisted truth of the battle.

------------------------------------------------------------------------

# 62. How to trace one AI decision

Follow:

``` text
agent ID
 ↓
agent configuration
 ↓
selected market
 ↓
OKX snapshot
 ↓
candles
 ↓
technical context
 ↓
news
 ↓
AI prompt
 ↓
OpenRouter
 ↓
structured response
 ↓
validation
 ↓
decision persistence
```

This shows where the visible AURA decision came from.

------------------------------------------------------------------------

# 63. How to think about the entire backend

The backend can be remembered as six layers:

``` text
LAYER 1 — DATA
OKX + RSS

LAYER 2 — INTELLIGENCE
AURA agents + OpenRouter

LAYER 3 — DECISION
validation + decision persistence

LAYER 4 — COMPETITION
battle + challenge + recalculation

LAYER 5 — TRUTH
server P&L + settlement + Supabase

LAYER 6 — PROOF / SOCIAL
X Layer + result card + X sharing
```

That is the mental model for the whole product.

------------------------------------------------------------------------

# 64. Final architecture

``` text
                         AURA ARENA
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
        USERS               MARKET              AI
          │                   │                   │
      Wallet/Auth            OKX              OpenRouter
          │                   │                   │
          └──────────────┬────┴────┬──────────────┘
                         │         │
                         ▼         ▼
                    AURA CONTEXT
                         │
                         ▼
                    AGENT DECISION
                         │
                         ▼
                  HUMAN CHALLENGE
                         │
                         ▼
                    RECALCULATION
                         │
                         ▼
                       BATTLE
                         │
                         ▼
                    SERVER P&L
                         │
                         ▼
                    SETTLEMENT
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
          SUPABASE              X LAYER
              │                     │
              ▼                     ▼
       PERFORMANCE/          PROOF/TESTNET
        REPUTATION
              │
              └──────────┬──────────┘
                         ▼
                    RESULT CARD
                         │
                         ▼
                      X SHARE
```

------------------------------------------------------------------------

# 65. AURA Arena in 30 seconds

``` text
Connect wallet.

Choose an agent.

Choose a market.

Read its thesis.

Challenge it.

Choose LONG, SHORT or WAIT.

Choose your stake.

Choose leverage.

Enter the Arena.

Watch the market.

Let the server settle the battle.

See who won.

Build reputation.

Share the result.

Challenge the machine again.
```

------------------------------------------------------------------------

# 66. The long-term vision

AURA Arena is not just trying to answer:

> "What does AI think about crypto?"

It is trying to create a world where:

``` text
AI has a strategy.
AI has an identity.
AI makes a commitment.
Humans can challenge it.
Evidence can change the thesis.
The market tests the decision.
The backend records the result.
Reputation remembers performance.
The result becomes social content.
```

That creates a new kind of AI product:

> **AI intelligence as a competitor, not just an assistant.**

------------------------------------------------------------------------

# 67. One final mental model

Remember this:

``` text
AI THINKS
   ↓
AI COMMITS
   ↓
YOU CHALLENGE
   ↓
AI RECONSIDERS
   ↓
YOU BATTLE
   ↓
MARKET MOVES
   ↓
SERVER SETTLES
   ↓
WINNER PROVEN
   ↓
REPUTATION UPDATED
   ↓
RESULT SHARED
   ↓
NEXT CHALLENGER
```

# ⚔️ Welcome to AURA Arena.

## **Challenge the machine.**
