## What changed

<!-- Briefly: what and why. Link the issue if there is one: Closes #... -->

## How it was tested

- [ ] `npm run lint`
- [ ] tests (`node --no-warnings --experimental-strip-types --test tests/*.test.mts` or the relevant `npm run test:*`)
- [ ] `npm run build`
- [ ] manually in a browser (desktop and mobile width), if the UI changed

## Checklist

- [ ] the pull request targets `dev`
- [ ] edge cases are covered: empty data, API/network errors, repeated actions, long input
- [ ] error messages and hints are clear to end users, with no technical details
- [ ] if the database schema changed: a new migration in `supabase/migrations/`, updated `docs/DATABASE_SCHEMA.md` and types
- [ ] if behaviour, the API or env changed: updated `docs/technical-reference.md`, the deployment guide and `.env.example` (and the README if the project overview changed); both language versions of a document are updated
- [ ] no secrets or real personal data in code, tests or screenshots
