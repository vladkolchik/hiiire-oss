alter table public.vacancies
  alter column salary_min type bigint using salary_min::bigint,
  alter column salary_max type bigint using salary_max::bigint;
