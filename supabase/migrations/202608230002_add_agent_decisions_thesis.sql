-- Restore the repository-required analysis payload on the existing table.
-- Idempotent: safe to apply after a partial or complete schema rollout.
alter table if exists public.agent_decisions
  add column if not exists thesis jsonb;

notify pgrst, 'reload schema';
