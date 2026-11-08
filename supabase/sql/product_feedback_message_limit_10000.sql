begin;

alter table public.feedback
  drop constraint if exists feedback_message_length_check;

alter table public.feedback
  add constraint feedback_message_length_check check (message is null or char_length(message) between 1 and 10000);

commit;
