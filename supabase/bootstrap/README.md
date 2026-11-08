# Self-hosted Supabase bootstrap

This directory is the recovery source for a new, empty hiiire Supabase
installation when a database dump is unavailable.

## Contents

- `selfhost_base.sql` recreates the core tables, constraints, indexes, RLS
  foundations, signup trigger, and private `resumes` bucket.
- `selfhost_manifest.txt` lists the repository SQL files in their required
  order.
- `selfhost_final.sql` adds columns and Storage policies that existed in the
  application contract but were not represented by a standalone SQL file.
- `scripts/build-selfhost-bootstrap.mjs` combines those sources into
  `supabase/migrations/20260701125302_selfhost_bootstrap.sql`.

Do not edit the generated bootstrap migration directly. Change a source file
or the recovery overlays, then rebuild it:

```bash
node scripts/build-selfhost-bootstrap.mjs
```

## Applying to a new environment

Database changes must be applied through Supabase MCP after checking that the
MCP project URL and the environment's `NEXT_PUBLIC_SUPABASE_URL` are the same.
Self-hosted Supabase has no hosted `project_ref`, so the project URL plus a
direct MCP database identity check replaces that part of the hosted-project
check.

Apply migrations in filename order:

1. `20260701125302_selfhost_bootstrap.sql`
2. `20260701140235_align_generated_type_nullability.sql`
3. `20260701144915_grant_private_rls_helpers.sql`
4. `20260702110101_credit_ledger_balance_trigger.sql`

The bootstrap creates schema only. It does not recover users, application
rows, uploaded files, Auth settings, SMTP settings, secrets, or cron jobs.

## Current deployment

The bootstrap was applied to `https://supabase.hiiire.com` on 2026-07-01
through the server's SSH-restricted Supabase MCP endpoint. Validation after
apply confirmed:

- 48 public tables, all with RLS enabled;
- all RPC functions referenced by the application are present;
- the Auth signup trigger exists;
- the private `resumes` bucket has a 5 MiB limit and PDF/DOC/DOCX/TXT MIME
  allowlist;
- authenticated Storage policies exist for select, insert, update, and delete.
- Auth health, REST schema, and an anonymous RLS-protected `profiles` query
  return successful responses through the public HTTPS endpoint.
