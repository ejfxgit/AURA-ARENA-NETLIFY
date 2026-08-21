alter table public.custom_agents
  add column if not exists trading_focus text[] not null default array['MOMENTUM'],
  add column if not exists information_focus text[] not null default array['PRICE_ACTION', 'MOMENTUM', 'VOLUME'],
  add column if not exists news_preference text not null default 'CONSIDER',
  add column if not exists social_sentiment boolean not null default true,
  add column if not exists onchain_activity boolean not null default false,
  add column if not exists whale_movements boolean not null default false,
  add column if not exists decision_behaviors text[] not null default array['TRADE_SELECTIVELY', 'WAIT_CONFIRMATION'],
  add column if not exists custom_instructions text not null default '';

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
