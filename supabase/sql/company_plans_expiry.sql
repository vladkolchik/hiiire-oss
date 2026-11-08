-- Add plan expiry support (for Telegram notifications)
alter table public.company_plans
  add column if not exists expires_at timestamptz;

