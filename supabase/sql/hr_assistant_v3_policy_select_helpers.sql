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
