alter table public.vacancies
  drop constraint if exists vacancies_experience_level_check;

alter table public.vacancies
  add constraint vacancies_experience_level_check
  check (experience_level = any (array[
    'trainee'::text,
    'junior'::text,
    'middle'::text,
    'senior'::text,
    'lead'::text
  ]));
