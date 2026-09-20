# MMAC Hub

MMAC Hub is a full-stack operations platform and public website for Macon Moves Animal Care, a 501(c)(3) animal-welfare nonprofit serving rural communities across western North Carolina and north Georgia.

The platform is designed to reduce administrative burden while supporting the organization’s real-world workflows across animal-care assistance, community cat/TNR work, vaccine clinics, volunteer coordination, resource navigation, forms and documents, and nonprofit financial operations.

## Product Goals

- Make it easy for community members to ask for help
- Give staff a clear operational view of requests, care cases, colonies, clinics, and finances
- Support scarce-capacity coordination without exposing public appointment inventory
- Keep veterinary clinical records appropriately separated from ordinary coordination records
- Preserve cash, check, card, donation, grant, and expense activity without forcing a single payment method
- Support low-friction mobile use in rural environments
- Keep the system simple enough that it reduces work instead of creating more of it

## Core Domains

- Public website and education
- Assistance requests and care cases
- Community cat / TNR management
- Community clinic planning and clinic-day workflow
- Forms, e-signatures, and document archive
- Volunteer and provider coordination
- Resource directory and service areas
- Financial operations and nonprofit reporting

## Technology

- Next.js
- TypeScript
- Tailwind CSS
- PostgreSQL via Supabase
- Supabase Auth
- Supabase Storage
- Supabase Realtime
- React Hook Form
- Zod
- Vercel

## Architecture

MMAC Hub is being built as a modular monolith: one application with clearly separated operational domains.

Shared entities such as people, animals, organizations, and geography connect the system, while clinical, financial, and document data retain stricter security and integrity boundaries.

The product is designed around one guiding rule:

> The system should reduce administrative work, not create it.

## Status

In active development.

Current phase: public assistance intake and administrator request review, with
the Unit 2 administrator authentication/authorization boundary implemented.
Live Supabase acceptance testing is still required before delivery approval.

## Administrator authentication (Unit 2)

The Supabase project-management account is separate from a user in this
project's Supabase Auth. Provision the initial development user in the MMAC
project's Authentication > Users screen, using email/password authentication.
Confirm the email and copy that Auth user's UUID. Creating an Auth user does
not grant MMAC administrator access.

Create `.env.local` in the repository root (or preserve the existing file).
Configure these existing connection variables privately:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<MMAC project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<MMAC publishable key>
SUPABASE_SECRET_KEY=<MMAC server secret key>
MMAC_ADMIN_USER_IDS=<approved Supabase Auth user UUID>
```

Do not put a password in this file. Do not commit `.env.local` or copy its
contents into logs, screenshots, or chat. `.env.example` deliberately contains
no environment-specific values. The existing `.gitignore` excludes local env
files. Set deployment configuration separately and restart the development
server (or redeploy the affected environment) after changing the allowlist.

`MMAC_ADMIN_USER_IDS` is server-only. Multiple entries use commas, for example
`<first-approved-UUID>,<second-approved-UUID>`. The parser trims whitespace,
validates every UUID, normalizes letter case, and denies all administrator
access if the variable is absent, blank, or has any invalid/empty entry.
There is no fallback to email or editable user metadata. Production users and
the production allowlist must be authorized separately; do not automatically
carry development administrators into production.

Run `npm run dev`, then open `/admin/login`. This is the normal sign-in flow;
the Supabase dashboard is only used for initial account setup/configuration.
No public signup, password-reset UI, roles UI, or email-link callback route is
introduced in this unit.

### How access is enforced

1. The login server action validates the form and uses the cookie-backed
   publishable-key client to call Supabase `signInWithPassword`.
2. `getAdminAccess` obtains the user from `auth.getUser()`, which verifies with
   Supabase Auth, then checks the UUID against the server-controlled allowlist.
3. `/admin`, the queue, the detail page, and `startRequestReview` each call
   `requireAdmin` independently before any privileged case read or write.
4. Missing/invalid configuration goes to a generic denial screen. Missing or
   failed identity verification goes to login. Authenticated non-admins are
   denied. No case data or provider error details are included in those screens.
5. Proxy refreshes session cookies on `/admin` routes, forwarding changes to
   the current request and response. Proxy sets private/no-store headers;
   Next.js development mode replaces Cache-Control with its own no-cache
   header. Proxy is not the authorization boundary; page/action checks remain
   mandatory. Confirm the private/no-store header in the deployment preview.
6. Sign-out clears the current local Supabase session and revalidates the
   administrator route tree. Unauthorized users can also sign out. A sign-out
   failure displays an error rather than claiming access has been removed.
   Sign-in/out require writable cookies; a failed cookie write is an error.
   Read-only page rendering relies on Proxy to refresh cookies beforehand.

The server-only secret-key client retains its existing database privileges.
It does not represent the signed-in user, so every new private operation must
explicitly call the guard first. The public Get Help action deliberately keeps
its existing validated intake path. This unit changes no tables, functions,
RLS policies, grants, or status transitions.

### Terminal validation

Use Node 20.19+ (or a current supported Node 22/24 release) and the existing
installed dependencies:

```sh
node --test tests/admin-auth.test.mjs
npx tsc --noEmit
npm run lint
git diff --check
git status --short
```

The security tests execute the real parser, guard, actions, protected pages,
and proxy with framework/Supabase I/O stubbed. They cover denied access before
privileged calls, verified administrator access to the existing action,
malformed configuration, verification failures, safe auth errors, allowlist
removal, and cookie propagation. They are not proof of a real sign-in or
database write. No real credentials are used in these tests.

### Live browser and database acceptance checks

Perform against the intended development project with a fictional request.
Do not test the mutation on a real assistance request.

1. In a private browser window, open `/admin/login`; inspect desktop and narrow
   layouts, labels, keyboard navigation, and pending/error feedback.
2. Enter invalid credentials privately; expect a generic failure and no case
   data. Enter the approved account's credentials; expect `/admin/requests`.
3. Reload, navigate to a detail page, return to the queue, and verify the
   session persists. Also revisit after an access token expires to verify
   refresh against the actual project.
4. On a fictional `new` request, use Start Review. Verify `under_review` in the
   queue and detail page after reload. Confirm the same request directly in
   SQL Editor before and after (replace the placeholder with its UUID):

   ```sql
   select id, status
   from public.assistance_requests
   where id = '<fictional-request-uuid>'::uuid;
   ```

5. Sign out; try `/admin`, `/admin/requests`, and a known detail URL directly.
   Expect login and no case data. Use Back and reload; access must remain denied.
6. For a real authenticated non-admin test without creating another account:
   keep the development account signed in, temporarily set the development
   allowlist to a freshly generated UUID that is not that account, restart the
   app, then revisit the queue/detail. Expect denial. In a previously opened
   fictional-request tab, submit Start Review; it must also be denied and the
   database status must remain unchanged. Restore the approved UUID afterward.
7. Repeat denial with the allowlist absent, blank, and with a valid UUID plus
   a malformed entry. Restart after each change; no case read/write may occur.
8. For an anonymous direct-mutation test, open a fictional `new` request in one
   tab, sign out in a second tab, then submit Start Review from the first tab.
   Expect login/denial and verify unchanged status directly in SQL Editor.
9. After restoring the intended configuration, confirm anonymous Get Help
   rendering, validation, and a fictional public submission still work. Its
   existing submission result is currently logged to the browser console;
   improving that public UX is outside Unit 2.
10. Inspect delivered page responses and client JS: no server secret key,
    allowlist value, or serialized password may appear. Passwords must never
    be included in logs or copied into a saved network trace. Supabase's normal
    session cookies are expected; they are not an administrator allowlist.

No commit, push, or later implementation unit is authorized until review.

## Unit 3 — case interactions and administrator detail

The request detail view now shows every animal, recorded services and diagnostics,
operational information, the original request explanation, and an append-only
interaction timeline. The queue and existing Start Review transition are unchanged.
No interactions, contact results or operational outcomes change request status.

### Persistence and authorization

- Migration: `supabase/migrations/20260916000000_create_assistance_request_events.sql`.
- One new interaction-only table, linked to requests and Auth users with restrictive
  deletion references. No JSON payloads, status-event columns or recorder tables.
- The shared Unit 2 guard independently protects the page, server query and insert
  action. The action derives actor UUID and display label from the verified user;
  submitted actor, status and audit fields cannot override them.
- The verified email supplies the historical label; a missing email falls back to
  `Administrator`. Labels never grant authority. Actor UUIDs are not selected for
  timeline rendering.
- New-table RLS permits no direct anonymous/authenticated access. Explicit grants
  allow the privileged application role to read and insert only approved columns,
  with no update, delete or truncate. Database owners remain capable of maintenance;
  this is application append-only history, not tamper-proof storage.
- One SECURITY INVOKER insert-trigger function enforces the cross-table date check.
  The database sets `created_at` to statement time. Occurrence must be at or after
  request `created_at`, and at most two minutes after database time. The action also
  checks these boundaries. The tolerance handles small clock differences; it does
  not support scheduling. Earlier history belongs in notes.
- Notes are required, limited to 10,000 characters, and rendered as escaped text.
  Corrections are new entries. Existing general notes are not converted into fake
  historical events.
- Case timestamps display in Eastern Time (`America/New_York`). The optional earlier
  occurrence input uses the browser/device timezone and sends an explicit UTC instant.
  A blank input lets the database choose now. Date-only prevention values do not shift
  with timezone.
- Events are fetched in pages to avoid silently losing history at the API row limit,
  then displayed newest occurrence first, with recorded time and ID as tie-breakers.
  The original submission remains the conceptual origin at the bottom.

No new environment variables or npm dependencies are required. Keep the accepted
Unit 2 environment setup. Never put a password or actual allowlist value in Git.

### Database setup and privilege inspection

Use a **development/test project**, and review the migration before applying it.
No live database migration was performed in the implementation workspace.

1. In that project's SQL Editor, run `supabase/tests/unit3_privileges.sql` and retain
   the output. It reports effective SELECT access for each required column across
   service areas, services, requested animal services and prescreen diagnostics.
2. Through your normal Supabase migration workflow, preview pending migrations:
   `npx supabase db push --dry-run`. Confirm the project is your development project
   and the only new pending migration is the Unit 3 file named above. Stop if there
   are unexpected migrations. After reviewing the preview, apply it with
   `npx supabase db push`. These are database migration commands, not Git pushes.
   For an already-running local Supabase database, use
   `npx supabase migration up --local` instead.
3. The migration itself checks `has_column_privilege` before adding any existing-table
   grant. Existing table-level, column-level and inherited privileges count. It grants
   SELECT **only on required columns that lack it**, and emits a NOTICE for every
   retained or added permission. No existing RLS policy or public access changes.
4. Rerun `supabase/tests/unit3_privileges.sql`: every effective column SELECT should
   be true. Save the migration notices to identify exactly which grants were needed.
5. Run `supabase/tests/assistance_request_events.sql` in SQL Editor as the database
   owner. Expect `Unit 3 database assertions passed; rolling back fixtures.` This test
   uses synthetic records, including a credential-free Auth row; everything rolls back.
   With psql, use `psql -v ON_ERROR_STOP=1 -f supabase/tests/assistance_request_events.sql`
   against an already securely configured development connection. Never paste database
   credentials into chat or tracked files.

Database tests cover allowed interaction/result/outcome combinations, invalid and
blank values, request/date boundaries, current audit time, unchanged request status,
actor/request references, denied direct-client access and denied history rewrites.
Live effective privilege results cannot be inferred from migration text alone.

### Automated checks

```bash
node --test tests/admin-auth.test.mjs tests/assistance-interactions.test.mjs
npx tsc --noEmit
npm run lint
npm run build
node tests/unit3-http.mjs
git diff --check
```

The HTTP script starts the built Next server plus a synthetic local Auth/REST service.
It exercises actual SDK calls, protected routes and Server Action POSTs, actor
attribution, save/reload rendering and public intake. It uses no real credentials
and is **not** proof of PostgreSQL persistence, live Supabase sessions or browser
interaction. The production build must exist before running it.

### Tracy's live/browser acceptance

1. Apply the reviewed migration and complete the SQL checks above. Start the app with
   the existing Unit 2 environment. Sign in using your own administrator account.
2. Optionally run `supabase/tests/unit3_browser_fixture.sql` once in the development
   project's SQL Editor. Unlike the rollback test, this script **persists** a labelled
   `Unit3 Browser Test` request with two animals. It requires the existing Microchipping
   catalog entry. It creates no Auth account. Copy the request URL from its NOTICE or
   find that labelled requester in the queue.
3. Open a request. Check requester, both animal names/count, status, service area,
   submitted date, phone/email/preference, transportation, availability, and $0.00
   contribution. Check that Requested Help is near the top and every animal's details
   appear. The fixture's cat has no prescreen/services: these must show missing states,
   while the dog shows its recorded diagnostic and service.
4. Save one Call, Text, Email and Note. Check each type's result choices; Note must hide
   the result. Try whitespace-only notes: save must fail and preserve input. Change
   interaction type after choosing a result: the old result must clear.
5. Save an earlier interaction dated after the request was created. Check chronology
   and the separate recorded time, then reload/navigate away and back. Try before
   request creation and more than two minutes in the future: both must be rejected.
6. Save `Care established`. Verify request status remains unchanged. Add a correction
   as a new note: the original remains visible. There should be no edit/delete control.
7. In SQL Editor, replace the placeholder below with the test request UUID and inspect
   the actual persisted rows. Verify the actor UUID is your Auth user, the label is
   your verified email, and audit time was not backdated:

   ```sql
   select r.status, r.created_at as request_created_at,
     e.interaction_type, e.contact_result, e.case_outcome, e.notes,
     e.occurred_at, e.created_at as recorded_at, e.actor_user_id, e.actor_label
   from public.assistance_request_events e
   join public.assistance_requests r on r.id = e.assistance_request_id
   where r.id = '<test-request-uuid>'::uuid
   order by e.occurred_at desc, e.created_at desc, e.id desc;
   ```

8. Leave the interaction form open, sign out in another tab, then attempt a save.
   Expect login/denial and no new database row. Repeat the accepted Unit 2 non-admin
   allowlist test and missing/malformed configuration test against detail and Save.
   Restore the approved configuration afterward. Never share account passwords.
9. On a new test request, confirm Start Review still performs only its existing
   `new → under_review` transition. No historical status event is expected until Unit 4.
10. Check anonymous Get Help rendering, validation and a fictional submission still
    work. Check the interaction form on desktop and a narrow viewport, including
    pending state, error retention, success clearing, timezone handling and reload.

Unit 3 is ready for review only after automated checks, and accepted only after the
real database and browser checks. Commit/push and Unit 4 require separate approval.

## Unit 4 — audited request status workflow

Unit 4 replaces the direct Start Review update with a guarded, atomic transition RPC
and adds reasoned administrator decisions to the existing case timeline. Existing
interactions and public intake remain separate from status changes.

**This code requires the new Unit 4 migration before use.** The migration is prepared,
not applied during BUILD. Review live privileges first and coordinate code/migration
rollout; accepted earlier migrations are unchanged. The earlier Unit 3 instruction
that Start Review creates no status event applies only to the Unit 3 baseline.

See [Unit 4 architecture and acceptance steps](docs/unit4-acceptance.md) for the
privilege preflight, migration procedure, rollback/permission SQL tests, two-session
concurrency test, browser workflow checks and exact repository-local commands.
