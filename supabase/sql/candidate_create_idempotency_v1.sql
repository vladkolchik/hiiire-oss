create table if not exists public.api_idempotency_keys (
  key text primary key,
  operation text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  request_hash text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  response_status integer,
  response_body jsonb,
  candidate_id uuid references public.candidates(id) on delete set null,
  job_id uuid references public.jobs_ai(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day')
);

create index if not exists idx_api_idempotency_keys_company_user
  on public.api_idempotency_keys(company_id, user_id, created_at desc);

create index if not exists idx_api_idempotency_keys_expires_at
  on public.api_idempotency_keys(expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_api_idempotency_keys_updated_at'
  ) then
    create trigger update_api_idempotency_keys_updated_at
      before update on public.api_idempotency_keys
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.api_idempotency_keys enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'api_idempotency_keys'
      and policyname = 'api_idempotency_keys_deny_all'
  ) then
    create policy api_idempotency_keys_deny_all
      on public.api_idempotency_keys
      for all
      using (false)
      with check (false);
  end if;
end $$;

drop function if exists public.create_candidate_with_idempotency(
  text,
  text,
  uuid,
  uuid,
  text,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz,
  text
);

create or replace function public.create_candidate_with_idempotency(
  p_key text,
  p_operation text,
  p_user_id uuid,
  p_company_id uuid,
  p_request_hash text,
  p_vacancy_id uuid,
  p_name text,
  p_position text,
  p_resume_text text,
  p_source text,
  p_applied_at timestamptz,
  p_mode text default 'enqueue'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  idem public.api_idempotency_keys;
  cand public.candidates;
  job public.jobs_ai;
  v_normalized_mode text := coalesce(p_mode, 'enqueue');
  v_response_status integer;
  v_response_body jsonb;
begin
  if v_normalized_mode not in ('enqueue', 'skip_ai_analysis', 'subscription_inactive') then
    raise exception 'invalid candidate create mode: %', v_normalized_mode;
  end if;

  insert into public.api_idempotency_keys (
    key,
    operation,
    user_id,
    company_id,
    request_hash,
    status
  ) values (
    p_key,
    p_operation,
    p_user_id,
    p_company_id,
    p_request_hash,
    'in_progress'
  )
  on conflict do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select *
    into idem
    from public.api_idempotency_keys
    where key = p_key
    for update;

    if not found then
      raise exception 'idempotency key lookup failed for key %', p_key;
    end if;

    if idem.operation <> p_operation
      or idem.user_id <> p_user_id
      or idem.company_id <> p_company_id
      or idem.request_hash <> p_request_hash then
      return jsonb_build_object(
        'responseStatus', 409,
        'responseBody', jsonb_build_object('error', 'IDEMPOTENCY_KEY_REUSED'),
        'candidateId', idem.candidate_id,
        'jobId', idem.job_id,
        'replayed', true
      );
    end if;

    if idem.status = 'completed'
      and idem.response_status is not null
      and idem.response_body is not null then
      return jsonb_build_object(
        'responseStatus', idem.response_status,
        'responseBody', idem.response_body,
        'candidateId', idem.candidate_id,
        'jobId', idem.job_id,
        'replayed', true
      );
    end if;

    return jsonb_build_object(
      'responseStatus', 409,
      'responseBody', jsonb_build_object('error', 'IDEMPOTENCY_REQUEST_IN_PROGRESS'),
      'candidateId', idem.candidate_id,
      'jobId', idem.job_id,
      'replayed', true
    );
  end if;

  insert into public.candidates (
    name,
    position,
    vacancy_id,
    created_by,
    resume_text,
    source,
    status,
    applied_at
  ) values (
    p_name,
    p_position,
    p_vacancy_id,
    p_user_id,
    p_resume_text,
    p_source,
    'new',
    p_applied_at
  )
  returning * into cand;

  if v_normalized_mode = 'enqueue' then
    select *
    into job
    from public.enqueue_ai_job_with_credit_reserve(
      p_company_id,
      cand.id,
      p_user_id,
      1
    );

    v_response_status := 200;
    v_response_body := jsonb_build_object(
      'candidateId', cand.id,
      'jobId', job.id
    );
  elsif v_normalized_mode = 'skip_ai_analysis' then
    v_response_status := 200;
    v_response_body := jsonb_build_object(
      'candidateId', cand.id,
      'jobId', null
    );
  else
    v_response_status := 402;
    v_response_body := jsonb_build_object(
      'error', 'SUBSCRIPTION_INACTIVE',
      'candidateId', cand.id
    );
  end if;

  update public.api_idempotency_keys
    set status = 'completed',
        response_status = v_response_status,
        response_body = v_response_body,
        candidate_id = cand.id,
        job_id = job.id,
        updated_at = now()
  where key = p_key;

  return jsonb_build_object(
    'responseStatus', v_response_status,
    'responseBody', v_response_body,
    'candidateId', cand.id,
    'jobId', job.id,
    'replayed', false
  );
exception
  when others then
    delete from public.api_idempotency_keys
    where key = p_key
      and status = 'in_progress'
      and response_status is null;
    raise;
end;
$$;
