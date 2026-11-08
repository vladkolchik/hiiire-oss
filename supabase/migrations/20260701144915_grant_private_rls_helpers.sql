-- PostgREST roles need to evaluate RLS predicates that call helpers in the
-- non-exposed private schema. USAGE does not expose the schema through the API.
grant usage on schema private to anon, authenticated, service_role;

grant execute on function private.current_user_company_id()
  to anon, authenticated, service_role;
grant execute on function private.current_user_role()
  to anon, authenticated, service_role;
grant execute on function private.is_company_admin_or_lead()
  to anon, authenticated, service_role;
grant execute on function private.can_access_vacancy(uuid)
  to anon, authenticated, service_role;
grant execute on function private.can_access_candidate(uuid)
  to anon, authenticated, service_role;
grant execute on function private.can_access_job_ai(uuid)
  to anon, authenticated, service_role;
grant execute on function private.try_candidate_id_from_storage_path(text)
  to authenticated, service_role;
grant execute on function private.candidate_belongs_to_current_company(uuid)
  to authenticated, service_role;
