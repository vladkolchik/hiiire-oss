-- HH auto-survey snapshot on candidate card
-- Stores latest `chat_bot.auto_survey.text` from HH negotiations.

alter table public.candidates
  add column if not exists hh_auto_survey_text text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'candidates'
      and c.conname = 'candidates_hh_auto_survey_text_len_check'
  ) then
    alter table public.candidates
      add constraint candidates_hh_auto_survey_text_len_check
      check (
        hh_auto_survey_text is null
        or char_length(hh_auto_survey_text) <= 4000
      );
  end if;
end $$;
