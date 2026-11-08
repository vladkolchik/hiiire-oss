-- Remove stale no-precondition RPC overloads after app deploy.

drop function if exists public.cancel_interview_mvp(uuid, uuid, text);
drop function if exists public.complete_interview_mvp(uuid, uuid, text);
