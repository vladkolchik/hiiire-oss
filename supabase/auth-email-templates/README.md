# Supabase Auth email templates

This folder stores the production Supabase Auth email templates used for hiiire.

Self-hosted Supabase Auth does not read these files directly or load them from
Studio. Production copies them to `/opt/supabase/volumes/templates`; the
private `templates-server` service from
`supabase/selfhost/docker-compose.auth-production.yml` serves them to Auth.

## URL settings

Production URL configuration should include:

- Site URL: `https://hiiire.com`
- Redirect URLs:
  - `https://hiiire.com/auth/callback`
  - `https://hiiire.com/auth/confirm`

The templates use `{{ .SiteURL }}/auth/confirm` with `{{ .TokenHash }}`. This matches the app's server-side callback handler, which verifies the token hash and writes Supabase auth cookies for the browser that opened the link.

## Templates

- `confirm-signup.html` -> Supabase `Confirm signup`
- `reset-password.html` -> Supabase `Reset password`
- `change-email.html` -> Supabase `Change email address`

`change-email.html` is prepared for future support. The app currently has callback support for `email_change`, but it does not yet expose a user-facing email-change form.

## Editing rules

- Do not use `{{ .ConfirmationURL }}` for these templates. It can route through Supabase's default flow instead of the app's server-side confirmation endpoint.
- Keep links pointed at `/auth/confirm` and include `token_hash={{ .TokenHash }}` plus the correct `type`.
- Keep `next` as an app-local path. The callback sanitizes `next` and only accepts paths that start with a single `/`.
- After editing a template here, copy the files to the server, recreate
  `templates-server` and `auth`, restart Kong, and send a test email.
