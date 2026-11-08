# Production self-hosted Supabase integration

The production Supabase instance is available at
`https://supabase.hiiire.com`. On 2026-07-02 the following Timeweb apps were
switched to it together:

- `ui-spb`;
- `worker-1-spb`;
- `telegram-relay`.

Each app must use the same values for:

```env
NEXT_PUBLIC_SUPABASE_URL=https://supabase.hiiire.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=<self-hosted ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<self-hosted SERVICE_ROLE_KEY>
```

`telegram-relay` does not need the anon key. The service-role key must remain
server-only.

## Auth email

Production Auth uses Resend SMTP:

```env
SITE_URL=https://hiiire.com
ADDITIONAL_REDIRECT_URLS=https://hiiire.com/auth/callback,https://hiiire.com/auth/confirm
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<RESEND_API_KEY>
SMTP_ADMIN_EMAIL=<verified hiiire.com sender>
SMTP_SENDER_NAME=hiiire
```

Copy `supabase/auth-email-templates/*.html` to
`/opt/supabase/volumes/templates`, copy
`docker-compose.auth-production.yml` to `/opt/supabase`, add the override with
`sh run.sh config add docker-compose.auth-production.yml`, then recreate
`templates-server` and `auth`. Recreating Auth changes its container address,
so restart Kong afterward.

## Cron

The old Supabase Cloud HTTP cron jobs are replaced by the VPS system cron.
Install:

- `hiiire-cron.sh` as `/opt/hiiire-cron/run.sh` with mode `0700`;
- `hiiire-production.cron` as `/etc/cron.d/hiiire-production` with mode `0644`;
- `/opt/hiiire-cron/secret.env` with mode `0600`.

The secret file contains `CRON_SECRET_B64`, which is the base64 representation
of the production web app's `CRON_SECRET`. At `09:00 UTC` the script calls both
production cron endpoints sequentially, retries failures, and prevents
overlapping runs with `flock`.

## Verified cutover

The 2026-07-02 cutover was verified by:

- successful Timeweb deploys for all three apps;
- HTTP `200` from web, worker, Telegram relay, Auth, and REST health routes;
- a production web write observed in the self-hosted database and then removed;
- a current worker heartbeat in `public.worker_heartbeats`;
- an Auth signup email accepted by Resend using the repository confirmation
  template;
- successful manual runs of both cron endpoints;
- cleanup of the temporary Auth user and all of its application rows.
