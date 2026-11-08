alter table public.candidates
  add column if not exists desired_salary_text text,
  add column if not exists desired_salary_amount bigint,
  add column if not exists desired_salary_currency text,
  add column if not exists desired_salary_source text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_desired_salary_amount_non_negative'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_desired_salary_amount_non_negative
      check (desired_salary_amount is null or desired_salary_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_desired_salary_amount_max'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_desired_salary_amount_max
      check (desired_salary_amount is null or desired_salary_amount <= 999999999999999);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_desired_salary_text_length'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_desired_salary_text_length
      check (desired_salary_text is null or char_length(desired_salary_text) <= 160);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_desired_salary_currency_length'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_desired_salary_currency_length
      check (desired_salary_currency is null or char_length(desired_salary_currency) <= 12);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_desired_salary_source_check'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_desired_salary_source_check
      check (desired_salary_source is null or desired_salary_source in ('hh', 'ai_parser', 'regex'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_desired_salary_displayable'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_desired_salary_displayable
      check (
        (
          desired_salary_text is null
          and desired_salary_amount is null
          and desired_salary_currency is null
          and desired_salary_source is null
        )
        or (nullif(btrim(desired_salary_text), '') is not null and desired_salary_source is not null)
      );
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
  p_mode text default 'enqueue',
  p_desired_salary_text text default null,
  p_desired_salary_amount bigint default null,
  p_desired_salary_currency text default null,
  p_desired_salary_source text default null
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
  v_desired_salary_text text := nullif(left(trim(coalesce(p_desired_salary_text, '')), 160), '');
  v_desired_salary_amount bigint := case
    when p_desired_salary_amount is not null
      and p_desired_salary_amount >= 0
      and p_desired_salary_amount <= 999999999999999
      then p_desired_salary_amount
    else null
  end;
  v_desired_salary_currency text := nullif(left(upper(trim(coalesce(p_desired_salary_currency, ''))), 12), '');
  v_desired_salary_source text := case
    when p_desired_salary_source in ('hh', 'ai_parser', 'regex') then p_desired_salary_source
    else null
  end;
begin
  if v_normalized_mode not in ('enqueue', 'skip_ai_analysis', 'subscription_inactive') then
    raise exception 'invalid candidate create mode: %', v_normalized_mode;
  end if;

  if v_desired_salary_text is null and v_desired_salary_amount is not null then
    v_desired_salary_text := left(
      trim(replace(replace(to_char(v_desired_salary_amount, 'FM999G999G999G999G999'), ',', ' '), '.', ' ') || coalesce(' ' || v_desired_salary_currency, '')),
      160
    );
  end if;

  if v_desired_salary_text is null or v_desired_salary_source is null then
    v_desired_salary_text := null;
    v_desired_salary_amount := null;
    v_desired_salary_currency := null;
    v_desired_salary_source := null;
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
    applied_at,
    desired_salary_text,
    desired_salary_amount,
    desired_salary_currency,
    desired_salary_source
  ) values (
    p_name,
    p_position,
    p_vacancy_id,
    p_user_id,
    p_resume_text,
    p_source,
    'new',
    p_applied_at,
    v_desired_salary_text,
    v_desired_salary_amount,
    v_desired_salary_currency,
    v_desired_salary_source
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

revoke all on function public.create_candidate_with_idempotency(
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
  text,
  text,
  bigint,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.create_candidate_with_idempotency(
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
  text,
  text,
  bigint,
  text,
  text
) to service_role;
