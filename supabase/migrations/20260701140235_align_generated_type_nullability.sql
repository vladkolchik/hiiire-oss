alter table public.company_plans
  alter column auto_renew set not null;

alter table public.profiles
  alter column onboarding_completed set not null;

alter table public.vacancies
  alter column salary_currency set not null;
