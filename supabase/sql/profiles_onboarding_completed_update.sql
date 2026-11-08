-- Fix: allow authenticated user to mark own onboarding as completed once.
-- Safe-by-default:
-- - only column-level UPDATE privilege for onboarding_completed
-- - only own row
-- - only transition false/null -> true

grant update (onboarding_completed) on table public.profiles to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own_onboarding_completed'
  ) then
    create policy profiles_update_own_onboarding_completed
      on public.profiles
      for update
      using (
        auth.uid() = id
        and coalesce(onboarding_completed, false) = false
      )
      with check (
        auth.uid() = id
        and onboarding_completed = true
      );
  end if;
end $$;
