begin;

do $$
begin
  if exists (
    select 1
    from public.feedback
    where type is null
      or sections is null
      or author_email is null
      or author_role is null
      or message is null
  ) then
    raise exception 'Unexpected feedback rows without product feedback columns require explicit handling before finalization';
  end if;
end $$;

alter table public.feedback
  alter column type set not null,
  alter column sections set not null,
  alter column author_email set not null,
  alter column author_role set not null,
  alter column page drop default;

alter table public.feedback
  drop constraint if exists feedback_message_length_check,
  drop constraint if exists feedback_author_email_length_check,
  drop constraint if exists feedback_author_role_check;

alter table public.feedback
  add constraint feedback_message_length_check check (char_length(message) between 1 and 10000),
  add constraint feedback_author_email_length_check check (char_length(author_email) between 3 and 320),
  add constraint feedback_author_role_check check (author_role in ('admin','hr','recruiter'));

alter table public.feedback drop column if exists page;

commit;
