# Unit 2 review — administrator authentication and authorization

Implemented against repository baseline `e27a506` on 2026-09-13.
No commit, push, database migration, grant/RLS change, or dependency change.

## Implemented boundary

- Email/password login at `/admin/login` using Supabase Auth and session cookies.
- Server-confirmed identity via `getUser`, followed by UUID allowlist membership.
- Missing, blank, malformed, or partially malformed configuration denies access.
- Independent guards on `/admin`, queue, detail, and Start Review.
- Session refresh forwards cookies to the current request and browser response.
- Sign-out available on the queue, detail, and denial screens.
- Auth actions require successful cookie writes and return generic errors.
- Auth session state, email, and editable user metadata never grant admin access.

The existing privileged client still bypasses ordinary user RLS. This unit
therefore enforces administrator authority in the application before that
client is constructed. Future private reads/actions need the same guard.
The public intake action deliberately remains unauthenticated and unchanged.

## Automated results

| Check | Result |
| --- | --- |
| `node --test tests/admin-auth.test.mjs` | 28 passed |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed |
| `git diff --check` | Passed |
| Privileged client construction for denied callers | Zero calls in security tests |
| Approved identity through the existing Start Review action | Passed with stubbed Supabase I/O |
| Cookie replacement, deletion, and write failure | Passed with stubbed I/O |

The test harness uses the existing TypeScript compiler and Node test runner.
It executes application source with framework/Supabase I/O stubbed, without
adding a dependency or using a real account password.

## Local HTTP results

The actual Next development server was exercised with no Supabase connection
credentials and no authenticated session:

- `/admin/login`: HTTP 200, email/password form present.
- `/admin/denied`: HTTP 200, generic denial screen.
- `/get-help`: HTTP 200, public submission form present.
- Missing allowlist: `/admin`, queue, and detail returned HTTP 307 to denial.
- Valid allowlist but no verified identity: those routes returned HTTP 307 to login.
- Direct HTTP invocation of `startRequestReview`: Next action response instructed
  a redirect to `/admin/login`; no database connection was available or used.
- Direct public intake action with invalid input: existing safe validation failure.
- Delivered HTML and generated development client JavaScript contained no
  allowlist variable, approved administrator UUID, or server-secret variable.

Next dev replaces Cache-Control with `no-cache, must-revalidate`. The proxy's
private/no-store behavior is tested at the function level; verify the final
response header in a production-mode preview before deployment.

## Not verified live

The browser service could not reach the local server (blocked local address).
No visual browser pass is claimed. This checkout also lacks MMAC connection
credentials; `.env.local` was not created or modified.

The following remain manual acceptance checks using README instructions:

- Real invalid-credential rejection and approved administrator sign-in.
- Session navigation, reload, token refresh, and sign-out against Supabase.
- Real administrator queue/detail reads and a fictional Start Review database write.
- Authenticated non-admin denial against the actual project.
- Stale-tab mutation denial after sign-out or allowlist removal.
- Missing/malformed configuration denial while a real session exists.
- Public Get Help successful persistence and narrow-screen/keyboard browser UX.

The real non-admin test can use the development account with its UUID temporarily
removed from the development allowlist, then restored. No extra account or role
system is required. Never run mutation checks on real assistance requests.

## Review scope

No workflow expansion or later-unit implementation is included. Small additions
to the proposed file plan are a reusable SignOutButton and this security test
harness. The Next development server appended generated instructions to
AGENTS.md during testing; only that generated addition was removed afterward,
preserving the original file. Pre-existing untracked documentation was untouched.

Stop here for user review and explicit approval. Live validation is outstanding;
this report is not a claim that Unit 2 has passed full acceptance testing.
