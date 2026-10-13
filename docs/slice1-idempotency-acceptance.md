# Slice 1: durable public submission idempotency

## Contract and limits

The browser creates a UUID after client validation, before the first network call.
The Server Action validates `{ submissionId, data }` with the existing business
schema. PostgreSQL fingerprints all 21 typed business arguments using v1
canonicalization (numeric display scale and weekday order do not matter; numeric
precision before column rounding does). The identifier is included in the digest.
The database does not trust a client fingerprint. JSON is transient, not stored.

`public_assistance_submission_receipts` claims the UUID before any entity insert.
Its unique primary key arbitrates concurrent attempts. The winner inserts the
existing single-animal record set. A separate SQL statement reads the committed
winner after ON CONFLICT waits; a same-statement CTE would have a stale snapshot.
Matching replays return the original request ID and original `new` receipt status,
never current administrator workflow state. Changed data gets PT409 with no writes.
Every failure rolls back the claim and all entity inserts. The non-null deferred
request FK forbids an orphan receipt at commit. No incomplete durable claim exists.

Receipts have no application UPDATE/DELETE/TRUNCATE workflow, no public read policy,
and no automatic expiry. They are retained for the case lifetime. Losing/deleting
one destroys replay protection for that key. Existing requests are not backfilled.
A different identifier is a different submission, even for identical business data.
This is not person/animal deduplication, abuse prevention, or public authentication.

The old unkeyed RPC signature is dropped without CASCADE. The new RPC alone has
service_role execution; receipt table access is revoked even from service_role.
SECURITY DEFINER, empty search_path, server-only client, and verified admin guards
are preserved. No status/history writes occur on replay. Assertions abort on
unexpected inherited receipt access, direct case INSERT, owner membership, or
extra submission overloads. Other SECURITY DEFINER write paths require preflight
human inspection; do not infer their safety solely from a name search.

## Browser privacy and recovery

Only unresolved submitted data is stored in sessionStorage, under
`mmac.public-assistance-attempt.v1`. It is not a draft autosave and never uses
localStorage. It contains contact and medical information accessible to same-origin
JavaScript. Frozen snapshots are cloned from parsed form data; retries never read
newly edited fields. Storage is saved and read back before the first send. Inputs
remain locked while unresolved. A synchronous ref guard prevents overlapping sends.

Normal reloads restore the attempt. Explicit retry uses the identical UUID/data;
there is no automatic resend, expiry, edit-as-new or new-key fallback. A mismatch,
corrupt/incompatible storage, or storage error blocks sending. Server validation
failure also locks the attempt: a later rejected attempt cannot prove an earlier
request never committed. Client validation still permits correction before sending.

Confirmed success replaces the sensitive snapshot with just version/state,
submission ID and request ID; the displayed form values and React attempt state
are cleared. Restoring a pending form preserves its original empty RHF defaults,
so reset after a successful retry cannot repopulate private values.
A separate UUID-only `mmac.public-assistance-attempt.v1.guard` marker is verified
before any network call. It survives emergency snapshot cleanup: missing data with
an existing marker blocks a fresh attempt, including after reload. Valid snapshots
from the original implementation acquire this marker before retry. Unexpected
state fields or mismatched markers are treated as corruption.
If confirmation storage fails, the helper attempts to remove the
sensitive snapshot, the form stays disabled, and the user is told receipt succeeded
and to close the tab. If the browser refuses BOTH replacement and removal, software
cannot guarantee clearing its storage: the visible warning is essential. Loss of
both storage keys, tab closure, another browser/device, or manual tampering can lose recovery
identity. The application cannot guarantee deduplication after that loss.

There is no verified public MMAC contact method in this repository. Messages are
neutral and no phone/email is invented. Product review must supply a verified
contact route for conflict/corrupt-storage recovery. There is deliberately no
self-service button to discard an uncertain submission and create another.

## Local database testing (never production)

Use a disposable LOCAL PostgreSQL database with the same major version as Supabase.
Inspect target identity first. Set `PGHOST=127.0.0.1` (or a local Unix socket),
`PGDATABASE=mmac_idempotency_test_<name>` and secure local authentication. Do not
put passwords or Supabase URLs in commands, scripts or chat. A local Supabase test
stack already supplies auth/roles. A bare local PostgreSQL instance needs:

```sql
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
grant usage on schema public to anon, authenticated, service_role;
```

These are isolated test fixtures, not a replacement for Supabase Auth. Role names
are cluster-wide; use a disposable cluster, not a shared server. Apply all repository
migrations in filename order to that isolated database as its trusted owner only.
Use psql with `-X -v ON_ERROR_STOP=1` so migration/test failures stop execution.

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/public_submission_privileges.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/public_submission_idempotency.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/assistance_request_events.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/assistance_request_status.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/unit4_privileges.sql
```

The idempotency SQL suite rolls back its fictional records, test trigger and Auth
fixture. It tests every payload argument, normalized replays, a forced LAST-stage
insert failure, successful retry after rollback, deferred FK enforcement, effective
role denial and replay after the actual audited Start Review RPC.

For real concurrency, set the following in the shell (PowerShell uses `$env:NAME`):

```text
MMAC_DISPOSABLE_DB=yes
MMAC_TEST_DATABASE=mmac_idempotency_test_<name>
PGHOST=127.0.0.1
```

Then run:

```sh
node tests/public-submission-concurrency.mjs
```

The runner requires psql and refuses an unnamed/nonlocal target. It opens two
independent connections, confirms B is WAITING on a database lock, then commits or
rolls back A. Twelve scenarios cover matching/mismatched payloads with commit/rollback at
READ COMMITTED, REPEATABLE READ and SERIALIZABLE. The latter two must reject a
concurrent committed winner with serialization failure (40001), allowing a later
retry with the same identifier. Blocking is verified against A's actual backend
PID, and replay must return the committed winner's exact ID.
It checks every entity count and replays after discarding the original response.
These tests intentionally persist fictional fixtures; destroy the disposable test
database afterwards. No migration is applied by the runner. Single-session PGlite
SQL success is useful but does not establish real multi-connection concurrency.

## Application checks

```sh
node --test tests/assistance-submission.test.mjs tests/public-submission-attempt.test.mjs tests/public-submission-form.test.mjs tests/admin-auth.test.mjs tests/assistance-interactions.test.mjs tests/assistance-status.test.mjs
npx tsc --noEmit
npm run lint
npm run build
node tests/unit3-http.mjs --unit4
git diff --check
```

The form callback tests execute the actual component and installed RHF form
control (including reset/register); React scheduling and sessionStorage are test
substitutes. They cover restored retry cleanup even when confirmation storage
fails and same-turn double clicks. They do not prove real DOM/browser behavior.
The HTTP harness uses synthetic Auth/REST, not a live database. For browser/live
acceptance use ONLY fictional data in the development Supabase project:

1. Submit normally: one receipt and complete related record set; success disables
   submission; sessionStorage contains no contact/medical payload after success.
2. Reject client input: editable validation errors, no saved submission/network call.
3. Block sessionStorage writes BEFORE submitting: visible failure, zero network calls.
4. Let the database commit, then drop the response using a test proxy/browser request
   interception. Do not use a real case. Verify uncertainty, unchanged UUID/snapshot,
   disabled fields and explicit retry. Retry returns the same ID and no extra rows.
5. Reload while uncertain; verify restoration and identical replay. Reject the action
   transport Promise; verify the same recovery UI (not an unhandled rejection).
6. Edit a pending payload in test storage, then reload/retry: PT409, zero new rows,
   retained identifier, no fresh-submit path. Corrupt the stored JSON: fail closed.
7. Duplicate the pending tab and send both; verify one case. Independent fresh tabs
   are different submissions and are NOT protected by the original identifier.
8. Advance the original case through Start Review, replay, and confirm unchanged
   status/version/history. Run Unit 2/3/4 acceptance/regression checks.
9. Simulate storage failure after success: no further send, clear form, warn that
   receipt succeeded; attempt snapshot removal. Reload and confirm a leftover UUID
   guard blocks a new submission. Check browser console/server output
   for no contact, medical data, fingerprint, secret key or raw database diagnostics.

## Rollout and rollback

Before application rollout, reconcile the development checkout to the shared branch
through an explicitly reviewed Git operation; local d2e3215 and remote 48543c0 were
verified content-equivalent, but their commit identities differ. Do not merge or
rewrite them incidentally while delivering this change.

Review effective live privileges using the read-only preflight before approving
any live migration. Pause intake and drain old in-flight requests, apply the new
migration with its assertions, reload PostgREST schema cache (migration NOTIFY),
deploy the matching application, verify new/old RPC permissions and smoke-test with
fictional data, then reopen intake. Old open tabs must refresh; they must NOT fall
back to unkeyed submission. Run application rollback only with a compatible keyed
contract or keep intake paused; never restore the old duplicate-creation path.

No live migration or Supabase writes were authorized for implementation testing.
