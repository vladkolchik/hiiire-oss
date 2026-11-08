-- Analytics v1 data foundation.
-- Apply only through Supabase MCP after verifying the hiiire project ref.

create table if not exists public.rejection_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text check (category is null or char_length(category) <= 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  vacancy_id uuid not null references public.vacancies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  event_type text not null check (event_type in ('candidate_created', 'status_changed', 'backfill_initial')),
  occurred_at timestamptz not null default now(),
  rejection_reason_id uuid references public.rejection_reasons(id) on delete set null,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 300),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pipeline_events_rejection_requires_rejected_status
    check (rejection_reason_id is null or to_status = 'rejected')
);

create table if not exists public.analytics_export_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'hr', 'recruiter')),
  report_type text not null check (char_length(report_type) between 1 and 80),
  format text not null check (format in ('xlsx', 'csv')),
  filters jsonb not null default '{}'::jsonb,
  sheets text[] not null default '{}',
  row_counts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.analytics_filter_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  visibility text not null default 'private' check (visibility in ('private', 'company')),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hiring_targets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope_type text not null default 'company' check (scope_type in ('company', 'department', 'vacancy', 'recruiter')),
  scope_id uuid,
  metric_name text not null default 'hires' check (char_length(metric_name) between 1 and 80),
  period_start date not null default date_trunc('month', now())::date,
  period_end date not null default (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  target_hires integer check (target_hires is null or target_hires >= 0),
  target_time_to_fill_days integer check (target_time_to_fill_days is null or target_time_to_fill_days >= 0),
  target_time_to_hire_days integer check (target_time_to_hire_days is null or target_time_to_hire_days >= 0),
  sla_feedback_hours integer check (sla_feedback_hours is null or sla_feedback_hours >= 0),
  minimum_pipeline_size integer check (minimum_pipeline_size is null or minimum_pipeline_size >= 0),
  target_interview_to_offer_conversion numeric(5, 2)
    check (target_interview_to_offer_conversion is null or target_interview_to_offer_conversion between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hiring_targets
  add column if not exists scope_type text not null default 'company' check (scope_type in ('company', 'department', 'vacancy', 'recruiter')),
  add column if not exists scope_id uuid,
  add column if not exists metric_name text not null default 'hires' check (char_length(metric_name) between 1 and 80),
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists target_hires integer check (target_hires is null or target_hires >= 0),
  add column if not exists target_time_to_fill_days integer check (target_time_to_fill_days is null or target_time_to_fill_days >= 0),
  add column if not exists target_time_to_hire_days integer check (target_time_to_hire_days is null or target_time_to_hire_days >= 0),
  add column if not exists sla_feedback_hours integer check (sla_feedback_hours is null or sla_feedback_hours >= 0),
  add column if not exists minimum_pipeline_size integer check (minimum_pipeline_size is null or minimum_pipeline_size >= 0),
  add column if not exists target_interview_to_offer_conversion numeric(5, 2)
    check (target_interview_to_offer_conversion is null or target_interview_to_offer_conversion between 0 and 100);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hiring_targets' and column_name = 'target'
  ) then
    execute 'update public.hiring_targets set target_hires = coalesce(target_hires, target) where target_hires is null';
    execute 'alter table public.hiring_targets alter column target drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hiring_targets' and column_name = 'period_type'
  ) then
    execute 'alter table public.hiring_targets alter column period_type drop not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'hiring_targets' and column_name = 'period_key'
  ) then
    execute 'alter table public.hiring_targets alter column period_key drop not null';
    execute $sql$
      update public.hiring_targets
      set period_start = coalesce(
            period_start,
            case
              when period_key ~ '^\d{4}-\d{2}$' then to_date(period_key || '-01', 'YYYY-MM-DD')
              else date_trunc('month', created_at)::date
            end
          ),
          period_end = coalesce(
            period_end,
            case
              when period_key ~ '^\d{4}-\d{2}$' then (to_date(period_key || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
              else (date_trunc('month', created_at) + interval '1 month - 1 day')::date
            end
          )
    $sql$;
  end if;
end $$;

update public.hiring_targets
set period_start = coalesce(period_start, date_trunc('month', created_at)::date, date_trunc('month', now())::date),
    period_end = coalesce(period_end, (date_trunc('month', created_at) + interval '1 month - 1 day')::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date);

alter table public.hiring_targets
  alter column period_start set not null,
  alter column period_end set not null;

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'hiring_targets'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) ilike '%period_type%'
      and pg_get_constraintdef(con.oid) ilike '%period_key%'
  loop
    execute format('alter table public.hiring_targets drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.ai_analyses
  add column if not exists model_version text,
  add column if not exists prompt_version text,
  add column if not exists score_version text,
  add column if not exists score_explanation jsonb,
  add column if not exists audit_event_id text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_analyses' and column_name = 'provider_model'
  ) then
    execute 'update public.ai_analyses set model_version = coalesce(model_version, provider_model) where model_version is null';
  end if;
end $$;

create unique index if not exists idx_pipeline_events_candidate_created_once
  on public.pipeline_events(candidate_id)
  where event_type = 'candidate_created';

create unique index if not exists idx_pipeline_events_backfill_initial_once
  on public.pipeline_events(candidate_id)
  where event_type = 'backfill_initial';

create index if not exists idx_pipeline_events_company_occurred_at
  on public.pipeline_events(company_id, occurred_at desc);

create index if not exists idx_pipeline_events_candidate_occurred_at
  on public.pipeline_events(candidate_id, occurred_at desc);

create index if not exists idx_pipeline_events_vacancy_occurred_at
  on public.pipeline_events(vacancy_id, occurred_at desc);

create index if not exists idx_pipeline_events_actor_id
  on public.pipeline_events(actor_id);

create index if not exists idx_pipeline_events_rejection_reason
  on public.pipeline_events(rejection_reason_id)
  where rejection_reason_id is not null;

create index if not exists idx_rejection_reasons_company_active
  on public.rejection_reasons(company_id, is_active, name);

create index if not exists idx_analytics_export_events_company_created_at
  on public.analytics_export_events(company_id, created_at desc);

create index if not exists idx_analytics_export_events_user_id
  on public.analytics_export_events(user_id);

create index if not exists idx_analytics_filter_views_company_owner_visibility
  on public.analytics_filter_views(company_id, owner_id, visibility);

create index if not exists idx_analytics_filter_views_owner_id
  on public.analytics_filter_views(owner_id);

create unique index if not exists idx_analytics_filter_views_owner_name_visibility
  on public.analytics_filter_views(company_id, owner_id, lower(name), visibility);

create index if not exists idx_hiring_targets_company_period
  on public.hiring_targets(company_id, period_start, period_end);

create unique index if not exists hiring_targets_scope_period_unique
  on public.hiring_targets(company_id, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_name, period_start, period_end);

create or replace function public.analytics_update_candidate_status(
  p_candidate_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_status text,
  p_rejection_reason_id uuid default null,
  p_rejection_comment text default null
)
returns table (
  id uuid,
  status text,
  updated_at timestamptz,
  vacancy_id uuid,
  from_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_updated_at timestamptz := now();
  v_rejection_reason_id uuid := case when p_status = 'rejected' then p_rejection_reason_id else null end;
  v_rejection_reason_name text := null;
  v_rejection_comment text := nullif(btrim(coalesce(p_rejection_comment, '')), '');
  v_metadata jsonb := jsonb_build_object('source', 'candidate_status_route');
begin
  if p_status not in ('new', 'reviewing', 'security-check', 'interview-scheduled', 'interviewed', 'offer', 'hired', 'rejected') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  if p_actor_role not in ('admin', 'hr', 'recruiter') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_rejection_comment is not null and char_length(v_rejection_comment) > 300 then
    raise exception 'REJECTION_COMMENT_TOO_LONG' using errcode = '22023';
  end if;

  select
    c.id,
    c.status,
    c.vacancy_id,
    c.updated_at
  into v_candidate
  from public.candidates c
  join public.vacancies v on v.id = c.vacancy_id
  where c.id = p_candidate_id
    and v.company_id = p_company_id
    and (p_actor_role = 'admin' or c.created_by = p_actor_id)
  for update of c;

  if not found then
    raise exception 'CANDIDATE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_rejection_reason_id is not null then
    select rr.name
    into v_rejection_reason_name
    from public.rejection_reasons rr
    where rr.id = v_rejection_reason_id
      and rr.company_id = p_company_id
      and rr.is_active is true;

    if not found then
      raise exception 'REJECTION_REASON_NOT_FOUND' using errcode = '22023';
    end if;
  end if;

  if v_rejection_comment is not null then
    v_metadata := v_metadata || jsonb_build_object('rejection_comment', v_rejection_comment);
  end if;

  if v_candidate.status = p_status then
    return query
    select
      v_candidate.id::uuid,
      v_candidate.status::text,
      v_candidate.updated_at::timestamptz,
      v_candidate.vacancy_id::uuid,
      v_candidate.status::text;
    return;
  end if;

  update public.candidates c
  set status = p_status,
      updated_at = v_updated_at
  where c.id = v_candidate.id;

  insert into public.pipeline_events (
    company_id,
    candidate_id,
    vacancy_id,
    actor_id,
    from_status,
    to_status,
    event_type,
    occurred_at,
    rejection_reason_id,
    rejection_reason,
    metadata
  )
  values (
    p_company_id,
    v_candidate.id,
    v_candidate.vacancy_id,
    p_actor_id,
    v_candidate.status,
    p_status,
    'status_changed',
    v_updated_at,
    v_rejection_reason_id,
    v_rejection_reason_name,
    v_metadata
  );

  return query
  select
    v_candidate.id::uuid,
    p_status::text,
    v_updated_at,
    v_candidate.vacancy_id::uuid,
    v_candidate.status::text;
end;
$$;

revoke all on function public.analytics_update_candidate_status(uuid, uuid, uuid, text, text, uuid, text) from public;
revoke all on function public.analytics_update_candidate_status(uuid, uuid, uuid, text, text, uuid, text) from anon;
revoke all on function public.analytics_update_candidate_status(uuid, uuid, uuid, text, text, uuid, text) from authenticated;
grant execute on function public.analytics_update_candidate_status(uuid, uuid, uuid, text, text, uuid, text) to service_role;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_updated_at_column'
  ) then
    if not exists (select 1 from pg_trigger where tgname = 'update_rejection_reasons_updated_at') then
      create trigger update_rejection_reasons_updated_at
        before update on public.rejection_reasons
        for each row execute function public.update_updated_at_column();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'update_analytics_filter_views_updated_at') then
      create trigger update_analytics_filter_views_updated_at
        before update on public.analytics_filter_views
        for each row execute function public.update_updated_at_column();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'update_hiring_targets_updated_at') then
      create trigger update_hiring_targets_updated_at
        before update on public.hiring_targets
        for each row execute function public.update_updated_at_column();
    end if;
  end if;
end $$;

insert into public.pipeline_events (
  company_id,
  candidate_id,
  vacancy_id,
  actor_id,
  from_status,
  to_status,
  event_type,
  occurred_at,
  metadata
)
select
  v.company_id,
  c.id,
  c.vacancy_id,
  c.created_by,
  null,
  c.status,
  'backfill_initial',
  coalesce(c.applied_at, c.created_at, now()),
  jsonb_build_object('source', 'analytics_v1_backfill')
from public.candidates c
join public.vacancies v on v.id = c.vacancy_id
where not exists (
  select 1
  from public.pipeline_events pe
  where pe.candidate_id = c.id
);

alter table public.pipeline_events enable row level security;
alter table public.rejection_reasons enable row level security;
alter table public.analytics_export_events enable row level security;
alter table public.analytics_filter_views enable row level security;
alter table public.hiring_targets enable row level security;

drop policy if exists pipeline_events_select_access on public.pipeline_events;
create policy pipeline_events_select_access on public.pipeline_events
  for select
  using (
    company_id = private.current_user_company_id()
    and (
      private.is_company_admin_or_lead()
      or private.can_access_candidate(candidate_id)
      or private.can_access_vacancy(vacancy_id)
    )
  );

drop policy if exists rejection_reasons_select_company on public.rejection_reasons;
create policy rejection_reasons_select_company on public.rejection_reasons
  for select
  using (company_id = private.current_user_company_id());

drop policy if exists rejection_reasons_admin_mutate on public.rejection_reasons;
drop policy if exists rejection_reasons_insert_admin on public.rejection_reasons;
create policy rejection_reasons_insert_admin on public.rejection_reasons
  for insert
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists rejection_reasons_update_admin on public.rejection_reasons;
create policy rejection_reasons_update_admin on public.rejection_reasons
  for update
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead())
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists rejection_reasons_delete_admin on public.rejection_reasons;
create policy rejection_reasons_delete_admin on public.rejection_reasons
  for delete
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists analytics_export_events_select_admin on public.analytics_export_events;
create policy analytics_export_events_select_admin on public.analytics_export_events
  for select
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists analytics_export_events_insert_admin on public.analytics_export_events;
drop policy if exists analytics_export_events_insert_company_user on public.analytics_export_events;
create policy analytics_export_events_insert_company_user on public.analytics_export_events
  for insert
  with check (company_id = private.current_user_company_id() and user_id = auth.uid());

drop policy if exists analytics_filter_views_select_access on public.analytics_filter_views;
create policy analytics_filter_views_select_access on public.analytics_filter_views
  for select
  using (
    company_id = private.current_user_company_id()
    and (
      (visibility = 'private' and owner_id = auth.uid())
      or visibility = 'company'
    )
  );

drop policy if exists analytics_filter_views_insert_access on public.analytics_filter_views;
create policy analytics_filter_views_insert_access on public.analytics_filter_views
  for insert
  with check (
    company_id = private.current_user_company_id()
    and owner_id = auth.uid()
    and (
      visibility = 'private'
      or (visibility = 'company' and private.is_company_admin_or_lead())
    )
  );

drop policy if exists analytics_filter_views_update_access on public.analytics_filter_views;
create policy analytics_filter_views_update_access on public.analytics_filter_views
  for update
  using (
    company_id = private.current_user_company_id()
    and (
      (visibility = 'private' and owner_id = auth.uid())
      or (visibility = 'company' and private.is_company_admin_or_lead())
    )
  )
  with check (
    company_id = private.current_user_company_id()
    and owner_id = auth.uid()
    and (
      visibility = 'private'
      or (visibility = 'company' and private.is_company_admin_or_lead())
    )
  );

drop policy if exists analytics_filter_views_delete_access on public.analytics_filter_views;
create policy analytics_filter_views_delete_access on public.analytics_filter_views
  for delete
  using (
    company_id = private.current_user_company_id()
    and (
      (visibility = 'private' and owner_id = auth.uid())
      or (visibility = 'company' and private.is_company_admin_or_lead())
    )
  );

drop policy if exists hiring_targets_select_company on public.hiring_targets;
create policy hiring_targets_select_company on public.hiring_targets
  for select
  using (company_id = private.current_user_company_id());

drop policy if exists hiring_targets_admin_mutate on public.hiring_targets;
drop policy if exists hiring_targets_insert_admin on public.hiring_targets;
create policy hiring_targets_insert_admin on public.hiring_targets
  for insert
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists hiring_targets_update_admin on public.hiring_targets;
create policy hiring_targets_update_admin on public.hiring_targets
  for update
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead())
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists hiring_targets_delete_admin on public.hiring_targets;
create policy hiring_targets_delete_admin on public.hiring_targets
  for delete
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

grant select on table public.pipeline_events to authenticated;
grant select on table public.rejection_reasons to authenticated;
grant insert, update, delete on table public.rejection_reasons to authenticated;
grant select on table public.analytics_export_events to authenticated;
grant insert on table public.analytics_export_events to authenticated;
grant select, insert, update, delete on table public.analytics_filter_views to authenticated;
grant select, insert, update, delete on table public.hiring_targets to authenticated;
