begin;

alter table public.feedback
  add column if not exists author_name text,
  add column if not exists author_email text,
  add column if not exists author_role text,
  add column if not exists type text default 'other',
  add column if not exists sections text[] default array['stats']::text[],
  add column if not exists status text not null default 'new',
  add column if not exists admin_class text,
  add column if not exists admin_note text,
  add column if not exists external_url text,
  add column if not exists source_url text,
  add column if not exists user_agent text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists ai_summary text,
  add column if not exists ai_labels jsonb,
  add column if not exists ai_processed_at timestamptz;

alter table public.feedback
  alter column page drop not null,
  alter column page set default 'stats';

update public.feedback as f
set
  type = coalesce(f.type, 'other'),
  sections = coalesce(f.sections, array['stats']::text[]),
  author_name = coalesce(f.author_name, p.name),
  author_email = coalesce(f.author_email, p.email),
  author_role = coalesce(f.author_role, p.role)
from public.profiles as p
where f.page = 'stats'
  and f.user_id = p.id;

alter table public.feedback
  drop constraint if exists feedback_type_check,
  drop constraint if exists feedback_sections_count_check,
  drop constraint if exists feedback_sections_allowed_check,
  drop constraint if exists feedback_sections_unique_check,
  drop constraint if exists feedback_message_length_check,
  drop constraint if exists feedback_status_check,
  drop constraint if exists feedback_admin_class_check,
  drop constraint if exists feedback_admin_note_length_check,
  drop constraint if exists feedback_external_url_check,
  drop constraint if exists feedback_source_url_length_check,
  drop constraint if exists feedback_source_url_check,
  drop constraint if exists feedback_user_agent_length_check,
  drop constraint if exists feedback_author_name_length_check,
  drop constraint if exists feedback_author_email_length_check,
  drop constraint if exists feedback_author_role_check;

create or replace function public.feedback_text_array_is_unique(p_values text[])
returns boolean
language sql
immutable
as $$
  select count(*) = count(distinct value)
  from unnest(p_values) as t(value);
$$;

alter table public.feedback
  add constraint feedback_type_check check (type in ('idea','missing_feature','usability','question','other')),
  add constraint feedback_sections_count_check check (cardinality(sections) between 1 and 10),
  add constraint feedback_sections_allowed_check check (
    sections <@ array['dashboard','vacancies','candidates','calendar','stats','settings','hr_assistant','ai_analysis','billing','other']::text[]
  ),
  add constraint feedback_sections_unique_check check (public.feedback_text_array_is_unique(sections)),
  add constraint feedback_message_length_check check (message is null or char_length(message) between 1 and 10000),
  add constraint feedback_status_check check (status in ('new','reviewed','in_progress','closed','deferred')),
  add constraint feedback_admin_class_check check (
    admin_class is null or admin_class in ('bug','feature','ux','question','billing','data','integration','other')
  ),
  add constraint feedback_admin_note_length_check check (admin_note is null or char_length(admin_note) <= 5000),
  add constraint feedback_external_url_check check (
    external_url is null or (char_length(external_url) <= 2048 and external_url ~ '^https?://')
  ),
  add constraint feedback_source_url_check check (
    source_url is null or (char_length(source_url) <= 2048 and source_url ~ '^https?://')
  ),
  add constraint feedback_user_agent_length_check check (user_agent is null or char_length(user_agent) <= 1000),
  add constraint feedback_author_name_length_check check (author_name is null or char_length(author_name) <= 200),
  add constraint feedback_author_email_length_check check (author_email is null or char_length(author_email) between 3 and 320),
  add constraint feedback_author_role_check check (author_role is null or author_role in ('admin','hr','recruiter'));

alter table public.feedback
  drop constraint if exists feedback_reviewed_by_fkey;

alter table public.feedback
  add constraint feedback_reviewed_by_fkey
  foreign key (reviewed_by) references public.platform_admins(user_id) on delete set null;

drop index if exists public.idx_feedback_company_created_at;
drop index if exists public.idx_feedback_created_at;
create index if not exists idx_feedback_company_created_at on public.feedback(company_id, created_at desc);
create index if not exists idx_feedback_created_at on public.feedback(created_at desc);
create index if not exists idx_feedback_status_created_at on public.feedback(status, created_at desc);
create index if not exists idx_feedback_type_created_at on public.feedback(type, created_at desc);
create index if not exists idx_feedback_sections_gin on public.feedback using gin(sections);

commit;
