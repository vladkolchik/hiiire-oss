-- Email notification preferences (per user)
--
-- Purpose:
-- Allow user to opt-out from email notifications while keeping their account email intact.
--
-- Model:
-- - One row per user (profiles.id)
-- - Default: enabled
-- - Read/write allowed only for the owner (user_id = auth.uid())

create table if not exists public.email_notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_notification_settings enable row level security;

-- Allow user to read own settings.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_notification_settings'
      and policyname = 'email_notification_settings_select_own'
  ) then
    create policy email_notification_settings_select_own
      on public.email_notification_settings
      for select
      using (user_id = auth.uid());
  end if;
end $$;

-- Allow user to insert own row (first time).
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_notification_settings'
      and policyname = 'email_notification_settings_insert_own'
  ) then
    create policy email_notification_settings_insert_own
      on public.email_notification_settings
      for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- Allow user to update own row.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_notification_settings'
      and policyname = 'email_notification_settings_update_own'
  ) then
    create policy email_notification_settings_update_own
      on public.email_notification_settings
      for update
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- Keep updated_at fresh (if helper exists).
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_updated_at_column'
  ) and not exists (
    select 1 from pg_trigger where tgname = 'update_email_notification_settings_updated_at'
  ) then
    create trigger update_email_notification_settings_updated_at
      before update on public.email_notification_settings
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

