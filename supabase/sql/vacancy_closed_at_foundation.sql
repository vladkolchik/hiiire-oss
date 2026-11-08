alter table public.vacancies
  add column if not exists closed_at timestamp with time zone;

comment on column public.vacancies.closed_at is
  'Timestamp when vacancy entered closed status. Analytics must not infer this from updated_at.';

-- Run outside a transaction: CREATE INDEX CONCURRENTLY cannot run inside one.
create index concurrently if not exists idx_vacancies_company_closed_at
  on public.vacancies (company_id, closed_at)
  where closed_at is not null;
