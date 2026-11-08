-- Analytics v1 advisor fixes.
-- Apply only through Supabase MCP after verifying the hiiire project ref.

create index if not exists idx_pipeline_events_actor_id
  on public.pipeline_events(actor_id);

create index if not exists idx_analytics_export_events_user_id
  on public.analytics_export_events(user_id);

create index if not exists idx_analytics_filter_views_owner_id
  on public.analytics_filter_views(owner_id);

drop policy if exists rejection_reasons_admin_mutate on public.rejection_reasons;

drop policy if exists rejection_reasons_insert_admin on public.rejection_reasons;
create policy rejection_reasons_insert_admin on public.rejection_reasons
  for insert
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists rejection_reasons_update_admin on public.rejection_reasons;
create policy rejection_reasons_update_admin on public.rejection_reasons
  for update
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead())
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists rejection_reasons_delete_admin on public.rejection_reasons;
create policy rejection_reasons_delete_admin on public.rejection_reasons
  for delete
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists hiring_targets_admin_mutate on public.hiring_targets;

drop policy if exists hiring_targets_insert_admin on public.hiring_targets;
create policy hiring_targets_insert_admin on public.hiring_targets
  for insert
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists hiring_targets_update_admin on public.hiring_targets;
create policy hiring_targets_update_admin on public.hiring_targets
  for update
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead())
  with check (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());

drop policy if exists hiring_targets_delete_admin on public.hiring_targets;
create policy hiring_targets_delete_admin on public.hiring_targets
  for delete
  using (company_id = private.current_user_company_id() and private.is_company_admin_or_lead());
