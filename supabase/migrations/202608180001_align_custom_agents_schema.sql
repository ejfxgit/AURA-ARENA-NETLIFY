-- ============================================================================
-- Align public.custom_agents with the schema the application expects.
-- ============================================================================
--
-- WHY: POST /api/custom-agents passes Zod validation and reaches Supabase, but
-- the INSERT built by customAgentToRow() (src/lib/custom-agents.ts) writes 16
-- columns while the live table only has the 8 from 202608150001. PostgREST
-- rejects the unknown columns with PGRST204 ("column not found in schema
-- cache"), so the create never reaches the database.
--
-- Column names, types, defaults and constraints below are taken verbatim from
-- supabase/migrations/202608170001_upgrade_custom_agents.sql, which declares
-- exactly these columns but was never applied to the live project.
--
-- SAFE TO RUN REPEATEDLY, and safe when some columns were added by hand:
--   * add column if not exists  -> never duplicates an existing column
--   * the normalize block       -> attaches the declared default/NOT NULL to
--                                  columns that already exist without them
--                                  (add column if not exists SKIPS its own
--                                  NOT NULL/DEFAULT when the column is there)
--   * NULLs are backfilled before SET NOT NULL, so existing rows cannot break
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- ============================================================================


-- 1. Add every column the application writes but the live table lacks. -------

alter table public.custom_agents
  add column if not exists trading_focus       text[]  not null default array['MOMENTUM']::text[],
  add column if not exists information_focus   text[]  not null default array['PRICE_ACTION', 'MOMENTUM', 'VOLUME']::text[],
  add column if not exists news_preference     text    not null default 'CONSIDER',
  add column if not exists social_sentiment    boolean not null default true,
  add column if not exists onchain_activity    boolean not null default false,
  add column if not exists whale_movements     boolean not null default false,
  add column if not exists decision_behaviors  text[]  not null default array['TRADE_SELECTIVELY', 'WAIT_CONFIRMATION']::text[],
  add column if not exists custom_instructions text    not null default '';


-- 2. Normalize columns that already existed (e.g. added manually) so they -----
--    carry the declared default and NOT NULL. Backfill first: SET NOT NULL
--    fails if any row holds a NULL.

update public.custom_agents set trading_focus       = array['MOMENTUM']::text[]                            where trading_focus       is null;
update public.custom_agents set information_focus   = array['PRICE_ACTION', 'MOMENTUM', 'VOLUME']::text[]  where information_focus   is null;
update public.custom_agents set news_preference     = 'CONSIDER'                                           where news_preference     is null;
update public.custom_agents set social_sentiment    = true                                                 where social_sentiment    is null;
update public.custom_agents set onchain_activity    = false                                                where onchain_activity    is null;
update public.custom_agents set whale_movements     = false                                                where whale_movements     is null;
update public.custom_agents set decision_behaviors  = array['TRADE_SELECTIVELY', 'WAIT_CONFIRMATION']::text[] where decision_behaviors is null;
update public.custom_agents set custom_instructions = ''                                                   where custom_instructions is null;

alter table public.custom_agents
  alter column trading_focus       set default array['MOMENTUM']::text[],
  alter column information_focus   set default array['PRICE_ACTION', 'MOMENTUM', 'VOLUME']::text[],
  alter column news_preference     set default 'CONSIDER',
  alter column social_sentiment    set default true,
  alter column onchain_activity    set default false,
  alter column whale_movements     set default false,
  alter column decision_behaviors  set default array['TRADE_SELECTIVELY', 'WAIT_CONFIRMATION']::text[],
  alter column custom_instructions set default '';

alter table public.custom_agents
  alter column trading_focus       set not null,
  alter column information_focus   set not null,
  alter column news_preference     set not null,
  alter column social_sentiment    set not null,
  alter column onchain_activity    set not null,
  alter column whale_movements     set not null,
  alter column decision_behaviors  set not null,
  alter column custom_instructions set not null;


-- 3. Value constraints, matching the Zod enums in src/lib/custom-agents.ts. ---
--    Dropped first so re-running cannot fail on an existing constraint.

alter table public.custom_agents
  drop constraint if exists custom_agents_focus_values,
  drop constraint if exists custom_agents_information_focus_values,
  drop constraint if exists custom_agents_news_preference,
  drop constraint if exists custom_agents_behavior_values,
  drop constraint if exists custom_agents_instructions_length;

alter table public.custom_agents
  add constraint custom_agents_focus_values check (trading_focus <@ array[
    'MOMENTUM', 'TREND_FOLLOWING', 'BREAKOUT', 'MEAN_REVERSION', 'SCALPING',
    'SWING_TRADING', 'VOLATILITY', 'VOLUME', 'LIQUIDITY', 'ORDER_FLOW', 'WHALE_ACTIVITY'
  ]),
  add constraint custom_agents_information_focus_values check (information_focus <@ array[
    'PRICE_ACTION', 'MOMENTUM', 'VOLUME', 'VOLATILITY', 'LIQUIDITY', 'ORDER_BOOK',
    'WHALE_ACTIVITY', 'SOCIAL_SENTIMENT', 'NEWS', 'MACRO_EVENTS', 'TECHNICAL_INDICATORS', 'MARKET_STRUCTURE'
  ]),
  add constraint custom_agents_news_preference check (news_preference in ('IGNORE', 'CONSIDER', 'PRIORITIZE')),
  add constraint custom_agents_behavior_values check (decision_behaviors <@ array[
    'HIGH_CONFIDENCE', 'TRADE_FREQUENTLY', 'TRADE_SELECTIVELY', 'WAIT_CONFIRMATION', 'REACT_QUICKLY'
  ]),
  add constraint custom_agents_instructions_length check (char_length(custom_instructions) <= 600);


-- 4. Drop the PostgREST schema cache that produced PGRST204. ------------------

notify pgrst, 'reload schema';


-- Verify (expects 16 rows, no NULL is_nullable surprises):
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'custom_agents'
--   order by ordinal_position;
