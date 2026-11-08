-- Telegram bot support (webhook-only)
--
-- Adds:
-- - public.telegram_user_links: link Supabase profile <-> Telegram private chat_id
-- - public.telegram_connect_tokens: one-time tokens for /start deep link
--
-- Security:
-- - All privileged writes happen server-side using service_role (RLS bypass).
-- - Browser roles are denied write access by default (RLS enabled + deny policies).

-- 0) Ensure required extension for gen_random_uuid() exists (best-effort).
create extension if not exists "pgcrypto";

-- 1) User ↔ Telegram chat link
create table if not exists public.telegram_user_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  chat_id bigint not null unique,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.telegram_user_links enable row level security;

-- Select: user can read own link
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_user_links'
      and policyname = 'telegram_user_links_select_own'
  ) then
    create policy telegram_user_links_select_own
      on public.telegram_user_links
      for select
      using (user_id = auth.uid());
  end if;
end $$;

-- Delete: user can unlink self
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_user_links'
      and policyname = 'telegram_user_links_delete_own'
  ) then
    create policy telegram_user_links_delete_own
      on public.telegram_user_links
      for delete
      using (user_id = auth.uid());
  end if;
end $$;

-- Deny browser writes (service_role bypasses RLS)
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_user_links'
      and policyname = 'telegram_user_links_deny_inserts'
  ) then
    create policy telegram_user_links_deny_inserts
      on public.telegram_user_links
      for insert
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'telegram_user_links'
      and policyname = 'telegram_user_links_deny_updates'
  ) then
    create policy telegram_user_links_deny_updates
      on public.telegram_user_links
      for update
      using (false)
      with check (false);
  end if;
end $$;

-- 2) One-time connect tokens (no browser access)
create table if not exists public.telegram_connect_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_telegram_connect_tokens_user_expires
  on public.telegram_connect_tokens(user_id, expires_at desc);

alter table public.telegram_connect_tokens enable row level security;

-- No policies needed: default deny for browser roles (service_role bypasses RLS).

