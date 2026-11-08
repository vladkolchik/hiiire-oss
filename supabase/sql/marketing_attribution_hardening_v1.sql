create index if not exists idx_marketing_conversions_visitor_id
  on public.marketing_conversions (visitor_id);

drop policy if exists marketing_visitors_deny_all on public.marketing_visitors;
create policy marketing_visitors_deny_all
  on public.marketing_visitors
  for all
  using (false)
  with check (false);

drop policy if exists marketing_conversions_deny_all on public.marketing_conversions;
create policy marketing_conversions_deny_all
  on public.marketing_conversions
  for all
  using (false)
  with check (false);
