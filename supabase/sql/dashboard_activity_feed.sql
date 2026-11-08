create schema if not exists private;

create or replace function private.dashboard_activity_can_access_vacancy(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_vacancy_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vacancies v
    where v.id = p_vacancy_id
      and v.company_id = p_company_id
      and (
        p_role = 'admin'
        or v.created_by = p_user_id
      )
  )
$$;

revoke all on function private.dashboard_activity_can_access_vacancy(uuid, uuid, text, uuid) from public;
revoke all on function private.dashboard_activity_can_access_vacancy(uuid, uuid, text, uuid) from anon;
revoke all on function private.dashboard_activity_can_access_vacancy(uuid, uuid, text, uuid) from authenticated;

create or replace function private.dashboard_activity_can_access_candidate(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_candidate_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.candidates c
    join public.vacancies v on v.id = c.vacancy_id
    where c.id = p_candidate_id
      and v.company_id = p_company_id
      and (
        p_role = 'admin'
        or c.created_by = p_user_id
      )
  )
$$;

revoke all on function private.dashboard_activity_can_access_candidate(uuid, uuid, text, uuid) from public;
revoke all on function private.dashboard_activity_can_access_candidate(uuid, uuid, text, uuid) from anon;
revoke all on function private.dashboard_activity_can_access_candidate(uuid, uuid, text, uuid) from authenticated;

create or replace function private.dashboard_activity_rows(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_type text default 'all'
)
returns table (
  activity_id text,
  activity_kind text,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_email text,
  title text,
  description text,
  credit_delta integer,
  entity_type text,
  entity_id uuid,
  entity_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ('vacancy_created:' || v.id::text) as activity_id,
    'vacancy_created'::text as activity_kind,
    v.created_at as occurred_at,
    v.created_by as actor_id,
    p.name as actor_name,
    p.email as actor_email,
    'Создана вакансия'::text as title,
    v.title as description,
    null::integer as credit_delta,
    'vacancy'::text as entity_type,
    v.id as entity_id,
    v.title as entity_name
  from public.vacancies v
  left join public.profiles p on p.id = v.created_by and p.company_id = p_company_id
  where v.company_id = p_company_id
    and p_type in ('all', 'vacancies')
    and private.dashboard_activity_can_access_vacancy(p_company_id, p_user_id, p_role, v.id)

  union all

  select
    ('candidate_created:' || pe.id::text) as activity_id,
    'candidate_created'::text as activity_kind,
    c.created_at as occurred_at,
    pe.actor_id as actor_id,
    p.name as actor_name,
    p.email as actor_email,
    'Добавлен кандидат'::text as title,
    c.name as description,
    null::integer as credit_delta,
    'candidate'::text as entity_type,
    c.id as entity_id,
    c.name as entity_name
  from public.pipeline_events pe
  join public.candidates c on c.id = pe.candidate_id
  join public.vacancies v on v.id = pe.vacancy_id
  left join public.profiles p on p.id = pe.actor_id and p.company_id = p_company_id
  where pe.event_type = 'candidate_created'
    and p_type in ('all', 'candidates')
    and v.company_id = p_company_id
    and pe.company_id = v.company_id
    and c.vacancy_id = v.id
    and private.dashboard_activity_can_access_candidate(p_company_id, p_user_id, p_role, c.id)

  union all

  select
    ('credits_spent:' || cl.id::text) as activity_id,
    'credits_spent'::text as activity_kind,
    cl.created_at as occurred_at,
    coalesce(cl.created_by, j.requested_by) as actor_id,
    p.name as actor_name,
    null::text as actor_email,
    'Списаны кредиты'::text as title,
    'AI-анализ резюме'::text as description,
    cl.delta as credit_delta,
    null::text as entity_type,
    null::uuid as entity_id,
    null::text as entity_name
  from public.credit_ledger cl
  join public.jobs_ai j on j.id = cl.reference_id
  left join public.profiles p on p.id = coalesce(cl.created_by, j.requested_by) and p.company_id = p_company_id
  where p_type in ('all', 'credits')
    and cl.company_id = p_company_id
    and j.company_id = p_company_id
    and cl.reason = 'resume_analysis'
    and cl.delta < 0
    and cl.reference_type = 'ai_job'
$$;

revoke all on function private.dashboard_activity_rows(uuid, uuid, text, text) from public;
revoke all on function private.dashboard_activity_rows(uuid, uuid, text, text) from anon;
revoke all on function private.dashboard_activity_rows(uuid, uuid, text, text) from authenticated;

create or replace function public.count_dashboard_activity(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_type text default 'all'
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::bigint
  from private.dashboard_activity_rows(p_company_id, p_user_id, p_role, p_type) rows
$$;

create or replace function public.list_dashboard_activity(
  p_company_id uuid,
  p_user_id uuid,
  p_role text,
  p_type text default 'all',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  activity_id text,
  activity_kind text,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  actor_email text,
  title text,
  description text,
  credit_delta integer,
  entity_type text,
  entity_id uuid,
  entity_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    rows.activity_id,
    rows.activity_kind,
    rows.occurred_at,
    rows.actor_id,
    rows.actor_name,
    rows.actor_email,
    rows.title,
    rows.description,
    rows.credit_delta,
    rows.entity_type,
    rows.entity_id,
    rows.entity_name
  from private.dashboard_activity_rows(p_company_id, p_user_id, p_role, p_type) rows
  order by rows.occurred_at desc, rows.activity_id desc
  limit greatest(1, least(coalesce(p_limit, 25), 200)) offset greatest(0, coalesce(p_offset, 0))
$$;

revoke all on function public.count_dashboard_activity(uuid, uuid, text, text) from public;
revoke all on function public.count_dashboard_activity(uuid, uuid, text, text) from anon;
revoke all on function public.count_dashboard_activity(uuid, uuid, text, text) from authenticated;
grant execute on function public.count_dashboard_activity(uuid, uuid, text, text) to service_role;

revoke all on function public.list_dashboard_activity(uuid, uuid, text, text, integer, integer) from public;
revoke all on function public.list_dashboard_activity(uuid, uuid, text, text, integer, integer) from anon;
revoke all on function public.list_dashboard_activity(uuid, uuid, text, text, integer, integer) from authenticated;
grant execute on function public.list_dashboard_activity(uuid, uuid, text, text, integer, integer) to service_role;
