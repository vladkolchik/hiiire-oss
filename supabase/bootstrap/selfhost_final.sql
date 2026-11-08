-- Final-state objects that were applied to the old hosted project but were
-- documented only in generated types, app validation, or git history.

alter table public.vacancies
  add column if not exists department text,
  add column if not exists hiring_manager text,
  add column if not exists headcount integer not null default 1,
  add column if not exists work_schedule text,
  add column if not exists employment_form text,
  add column if not exists employment_forms text[] not null default '{}',
  add column if not exists salary_period text not null default 'month',
  add column if not exists salary_tax text,
  add column if not exists bonus_text text,
  add column if not exists benefits_text text,
  add column if not exists probation_months integer,
  add column if not exists travel_percent integer,
  add column if not exists mandatory_requirements_text text,
  add column if not exists hiring_process_text text;

alter table public.vacancies
  drop constraint if exists vacancies_department_length_check,
  drop constraint if exists vacancies_hiring_manager_length_check,
  drop constraint if exists vacancies_headcount_check,
  drop constraint if exists vacancies_work_schedule_length_check,
  drop constraint if exists vacancies_employment_form_check,
  drop constraint if exists vacancies_employment_forms_check,
  drop constraint if exists vacancies_salary_period_check,
  drop constraint if exists vacancies_salary_tax_check,
  drop constraint if exists vacancies_bonus_text_length_check,
  drop constraint if exists vacancies_benefits_text_length_check,
  drop constraint if exists vacancies_probation_months_check,
  drop constraint if exists vacancies_travel_percent_check,
  drop constraint if exists vacancies_mandatory_requirements_length_check,
  drop constraint if exists vacancies_hiring_process_length_check;

alter table public.vacancies
  add constraint vacancies_department_length_check
    check (department is null or char_length(department) between 1 and 120),
  add constraint vacancies_hiring_manager_length_check
    check (hiring_manager is null or char_length(hiring_manager) between 1 and 120),
  add constraint vacancies_headcount_check
    check (headcount between 1 and 1000),
  add constraint vacancies_work_schedule_length_check
    check (work_schedule is null or char_length(work_schedule) between 1 and 80),
  add constraint vacancies_employment_form_check
    check (
      employment_form is null
      or employment_form in ('tk', 'gph', 'self-employed', 'ip', 'other')
    ),
  add constraint vacancies_employment_forms_check
    check (
      employment_forms
      <@ array['tk', 'gph', 'self-employed', 'ip', 'other']::text[]
    ),
  add constraint vacancies_salary_period_check
    check (salary_period in ('month', 'hour', 'shift')),
  add constraint vacancies_salary_tax_check
    check (salary_tax is null or salary_tax in ('gross', 'net')),
  add constraint vacancies_bonus_text_length_check
    check (bonus_text is null or char_length(bonus_text) between 1 and 5000),
  add constraint vacancies_benefits_text_length_check
    check (benefits_text is null or char_length(benefits_text) between 1 and 5000),
  add constraint vacancies_probation_months_check
    check (probation_months is null or probation_months between 0 and 24),
  add constraint vacancies_travel_percent_check
    check (travel_percent is null or travel_percent between 0 and 100),
  add constraint vacancies_mandatory_requirements_length_check
    check (
      mandatory_requirements_text is null
      or char_length(mandatory_requirements_text) between 1 and 10000
    ),
  add constraint vacancies_hiring_process_length_check
    check (
      hiring_process_text is null
      or char_length(hiring_process_text) between 1 and 10000
    );

alter table public.ai_analyses
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists update_ai_analyses_updated_at on public.ai_analyses;
create trigger update_ai_analyses_updated_at
  before update on public.ai_analyses
  for each row execute function public.update_updated_at_column();

alter table public.integrations
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists update_integrations_updated_at on public.integrations;
create trigger update_integrations_updated_at
  before update on public.integrations
  for each row execute function public.update_updated_at_column();

create or replace function private.try_candidate_id_from_storage_path(p_name text)
returns uuid
language plpgsql
immutable
strict
set search_path = private
as $$
declare
  matched text[];
begin
  matched := regexp_match(
    p_name,
    '(?:^|/)candidates/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:/|$)'
  );
  if matched is null then
    return null;
  end if;
  return matched[1]::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.candidate_belongs_to_current_company(
  p_candidate_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select p_candidate_id is not null
    and private.can_access_candidate(p_candidate_id);
$$;

drop policy if exists resumes_select_company on storage.objects;
create policy resumes_select_company
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'resumes'
    and private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );

drop policy if exists resumes_insert_company on storage.objects;
create policy resumes_insert_company
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'resumes'
    and private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );

drop policy if exists resumes_update_company on storage.objects;
create policy resumes_update_company
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'resumes'
    and private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  )
  with check (
    bucket_id = 'resumes'
    and private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );

drop policy if exists resumes_delete_company on storage.objects;
create policy resumes_delete_company
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'resumes'
    and private.candidate_belongs_to_current_company(
      private.try_candidate_id_from_storage_path(name)
    )
  );
