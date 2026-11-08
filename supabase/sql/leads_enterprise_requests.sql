-- Enterprise lead workflow on top of request-access leads
-- - Add requested_plan discriminator
-- - Add handling metadata for admin CRM workflow
-- - Keep existing leads flow backward compatible

alter table public.leads add column if not exists requested_plan text;
alter table public.leads add column if not exists handled_by uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists handled_at timestamptz;
alter table public.leads add column if not exists decision_note text;

update public.leads
set requested_plan = 'enterprise'
where requested_plan is null;

alter table public.leads alter column requested_plan set default 'enterprise';
alter table public.leads alter column requested_plan set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_requested_plan_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_requested_plan_check
      check (requested_plan in ('starter', 'professional', 'enterprise'));
  end if;
end $$;

create index if not exists idx_leads_requested_plan_status_created_at
  on public.leads (requested_plan, status, created_at desc);
