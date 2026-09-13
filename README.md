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
