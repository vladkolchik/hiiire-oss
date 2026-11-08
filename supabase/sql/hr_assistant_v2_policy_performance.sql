create index if not exists idx_assistant_threads_owner
  on public.assistant_threads(owner_id);

create index if not exists idx_assistant_messages_company_created
  on public.assistant_messages(company_id, created_at desc);
create index if not exists idx_assistant_messages_created_by
  on public.assistant_messages(created_by)
  where created_by is not null;

create index if not exists idx_assistant_context_company_entity
  on public.assistant_context_items(company_id, entity_type, entity_id);
create index if not exists idx_assistant_context_added_by
  on public.assistant_context_items(added_by)
  where added_by is not null;

create index if not exists idx_assistant_tool_runs_company_created
  on public.assistant_tool_runs(company_id, created_at desc);
create index if not exists idx_assistant_tool_runs_message
  on public.assistant_tool_runs(message_id)
  where message_id is not null;
create index if not exists idx_assistant_tool_runs_approved_by
  on public.assistant_tool_runs(approved_by)
  where approved_by is not null;

create index if not exists idx_assistant_audit_thread
  on public.assistant_audit_events(thread_id)
  where thread_id is not null;
create index if not exists idx_assistant_audit_tool_run
  on public.assistant_audit_events(tool_run_id)
  where tool_run_id is not null;
create index if not exists idx_assistant_audit_actor
  on public.assistant_audit_events(actor_user_id)
  where actor_user_id is not null;

drop policy if exists assistant_threads_select_company on public.assistant_threads;
create policy assistant_threads_select_company
  on public.assistant_threads
  for select
  using (
    company_id = (select private.current_user_company_id())
    and (
      visibility = 'company'
      or owner_id = (select auth.uid())
      or exists (
        select 1
        from public.profiles p
        where p.id = (select auth.uid())
          and p.company_id = assistant_threads.company_id
          and p.role = 'admin'
      )
    )
  );

drop policy if exists assistant_messages_select_company on public.assistant_messages;
create policy assistant_messages_select_company
  on public.assistant_messages
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.assistant_threads t
      where t.id = assistant_messages.thread_id
        and t.company_id = assistant_messages.company_id
        and (
          t.visibility = 'company'
          or t.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.company_id = t.company_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists assistant_context_select_company on public.assistant_context_items;
create policy assistant_context_select_company
  on public.assistant_context_items
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.assistant_threads t
      where t.id = assistant_context_items.thread_id
        and t.company_id = assistant_context_items.company_id
        and (
          t.visibility = 'company'
          or t.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.company_id = t.company_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists assistant_tool_runs_select_company on public.assistant_tool_runs;
create policy assistant_tool_runs_select_company
  on public.assistant_tool_runs
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.assistant_threads t
      where t.id = assistant_tool_runs.thread_id
        and t.company_id = assistant_tool_runs.company_id
        and (
          t.visibility = 'company'
          or t.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.profiles p
            where p.id = (select auth.uid())
              and p.company_id = t.company_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists assistant_audit_select_company_admin on public.assistant_audit_events;
create policy assistant_audit_select_company_admin
  on public.assistant_audit_events
  for select
  using (
    company_id = (select private.current_user_company_id())
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.company_id = assistant_audit_events.company_id
        and p.role = 'admin'
    )
  );

