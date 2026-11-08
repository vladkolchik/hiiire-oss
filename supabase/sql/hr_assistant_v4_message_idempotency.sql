create unique index if not exists idx_assistant_messages_user_client_message_id_unique
  on public.assistant_messages (thread_id, ((metadata ->> 'clientMessageId')))
  where role = 'user'
    and metadata ? 'clientMessageId'
    and nullif(metadata ->> 'clientMessageId', '') is not null;
