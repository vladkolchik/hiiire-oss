-- Signup email state helper
--
-- Allows server-side signup flow to distinguish:
-- - no account
-- - existing confirmed account
-- - existing unconfirmed account

create or replace function public.get_signup_email_state(p_email text)
returns table (
  user_id uuid,
  email text,
  email_confirmed boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id as user_id,
    lower(trim(u.email)) as email,
    (u.email_confirmed_at is not null) as email_confirmed
  from auth.users u
  where lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(p_email, '')))
  order by u.created_at desc
  limit 1;
$$;

revoke all on function public.get_signup_email_state(text) from public;
revoke all on function public.get_signup_email_state(text) from anon;
revoke all on function public.get_signup_email_state(text) from authenticated;
grant execute on function public.get_signup_email_state(text) to service_role;
