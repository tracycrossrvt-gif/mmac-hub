# Slice 1 request-table privilege prerequisite

## Cause and correction

The original request-table migration enabled RLS but did not clear automatic table
grants. Supabase-style defaults grant table INSERT/UPDATE to application roles;
later narrow grants do not subtract those privileges. Unit 4 removes only its known
column UPDATE grant, so its effective-privilege assertion correctly rejects the
remaining table grant. RLS restricts rows but does not revoke ACLs; service_role
bypasses RLS. Direct writes would bypass the audited/idempotent RPC boundaries.

`20260919000000_normalize_assistance_request_privileges.sql` runs as the actual table
owner, rejects application membership in that owner, clears direct request-table
grants for PUBLIC/anon/authenticated/service_role, and restores service_role SELECT.
Effective table AND column checks reject residual inherited access. Failure rolls
back all its ACL changes. It changes no policies, owners, role memberships, global
defaults, RPCs, application code, or existing migrations. No CASCADE is used.

Unit 4 and idempotency assertions remain unchanged. The prerequisite deliberately
removes the obsolete column UPDATE(status) grant too; do not deploy it while old
application code still depends on direct status UPDATE.

## Migration ordering: fresh versus already recorded

Fresh/disposable chain: Unit 3 -> prerequisite -> Unit 4 -> idempotency (24 migrations).
A new migration dated after Unit 4 cannot repair fresh replay: execution stops at
Unit 4 before reaching it. Existing historical migrations are not rewritten.

If Unit 4 or later versions are already recorded, STOP automated rollout of this
earlier-dated migration. Inspect the target's migration history, owners, ACLs,
memberships and deployed application version first. Never reset a populated database,
delete migration-history rows, mark SQL as applied without executing it, or replay
Unit 4. Do not add UPDATE(status) back.

Safest existing-environment path: rehearse on a disposable copy of that environment,
review a migration-tool preview that includes ONLY this missing prerequisite, and
obtain separate approval for the tool's out-of-order migration process. Apply as the
actual table owner with an appropriate maintenance window. If the deployment process
cannot support this, agree an explicit bootstrap/forward-migration strategy before
release; do not improvise duplicate migrations. No production procedure is authorized
by this document. SQL re-execution is tested, but CLI history reconciliation is not.

## Tests and evidence limits

`tests/migration-privileges.test.mjs` uses Node's existing test runner and an externally
installed PGlite module. It executes actual SQL in fresh in-memory databases. No
application dependency, hosted connection, or concurrency simulation is introduced.

Engine compatibility: PGlite 0.3.14 embeds PostgreSQL 17.5; PGlite 0.5.8 embeds
PostgreSQL 18.3. A referenced-parent ON DELETE RESTRICT raises 23503 on the former
and 23001 on the latter. The Unit 3 fixture now expects the exact engine-specific
code ONLY for its two RESTRICT deletes, checks the exact event foreign key and its
validated RESTRICT definition, and verifies that request, actor and history remain.
Other SQLSTATE expectations and all migrations/security assertions are unchanged.
Negative tests reject NO ACTION substitution, an unrelated constraint failure and
a statement that succeeds. Chain tests print `version()` so engine drift is visible.
This follows PostgreSQL's upstream RESTRICT error-code correction:
https://github.com/postgres/postgres/commit/086c84b23d99c2ad268f97508cd840efc1fdfd79

Set `MMAC_PGLITE_MODULE` to the absolute path of an isolated PGlite `dist/index.js`
(0.3.14 for PostgreSQL 17 parity; 0.5.8 for the PostgreSQL 18 compatibility check), then:

```sh
node --test tests/*.test.mjs
npx tsc --noEmit
npm run lint
npm run build
node tests/unit3-http.mjs --unit4
git diff --check
```

Without that variable, the migration tests explicitly SKIP; this is not a pass for
database acceptance. An invalid configured module path fails the test run.

The suite covers restrictive defaults, broad table/function defaults plus PUBLIC
access, exact original Unit 4 failure, migration rollback, owner membership including
NOINHERIT/SET ROLE, non-owner rejection, a trusted non-superuser migration owner,
inherited table/column privileges, denied
direct writes, service-role reads, and repeat execution before/after Unit 4. It runs
all five SQL suites under both default-grant profiles. Earlier ordinary PostgreSQL
fixtures omitted Supabase's broad defaults; their success did not prove fresh
Supabase bootstrap compatibility.

Still required: real fresh Supabase bootstrap/ownership/grants; PostgREST execution
and denial; browser success, uncertain-response/reload/retry and storage cleanup.
PGlite is not independent-connection concurrency acceptance. The previously reported
12 real PostgreSQL concurrency scenarios do not establish PostgREST/browser acceptance.

For `unit3-http.mjs`, build with NEXT_PUBLIC_SUPABASE_URL and
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY unset and without a local environment file:
the harness supplies its ephemeral loopback URL at runtime. A build with those
public values already inlined will ignore that runtime URL. This limitation of the
synthetic harness does not replace testing a normally configured local Supabase build.

Repository verification on 2026-11-04: 230 Node tests passed (215 existing plus 15
new), zero skips; all five SQL scripts executed under both grant profiles;
TypeScript, ESLint, production build and synthetic HTTP checks passed. An initial
build failed on a corrupted generated Turbopack cache; preserving it outside the
repository and rebuilding resolved that failure without source changes. The first
HTTP run used an inlined placeholder URL; rebuilding with the public variables unset
resolved the harness setup issue described above. Docker and psql are unavailable
here, so no real Supabase/PostgREST or independent-connection test ran in this round.

RESTRICT follow-up: reproduced the original 13-pass/2-fail result on PGlite 0.5.8.
After the focused fixture correction, the complete Node suite passed 233/233 with
zero skips on BOTH PGlite 0.3.14/PG17.5 and 0.5.8/PG18.3 (18 migration/fixture tests
plus 215 existing application tests). Both runs execute the five SQL scripts under
both grant profiles. TypeScript, lint and production build passed. No migration or
application code changed. This is in-memory SQL verification, not real Supabase acceptance.

## Windows: read-only inspection of an existing disposable local stack

Run from the repository root. Identify the unique disposable database container;
do not use a hosted connection string or production credentials.

```powershell
docker ps --format '{{.Names}}  {{.Image}}  {{.Ports}}'
$container = 'supabase_db_YOUR_UNIQUE_DISPOSABLE_PROJECT'
docker inspect $container --format '{{.Name}} {{.Config.Image}}'
if ($LASTEXITCODE -ne 0) { throw 'Verify the disposable container name first' }

$sql = "BEGIN READ ONLY;`n" +
  (Get-Content -Raw supabase/tests/unit4_privileges.sql) +
  "`nSELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`nCOMMIT;"
$sql | docker exec -i $container psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Inspection failed; stop and review' }
```

Review actual table owner, raw table/column ACLs, default ACLs, RLS, policies, role
flags/memberships, and executable SECURITY DEFINER functions. A missing history table
or stopped container is a setup blocker, not permission to bypass inspection.

## Next disposable Supabase acceptance

1. Apply the reviewed patch to a clean checkout at `4320e73` using `git apply --check`
   followed by `git apply`. Review the diff. Do not use `git am` for this uncommitted diff.
2. Use a NEW disposable export including the uncommitted correction (plain `git archive
   HEAD` would omit it). Set a unique local project ID in that disposable copy only.
   Ensure it contains no production environment file or linked-project configuration.
3. Retain automatic-grant behavior; do not change auto_expose_new_tables or global
   defaults to hide the failure. Start with the already-used Supabase CLI 2.116.0 and
   Docker Desktop: `npx supabase start`. If any migration fails, stop and save its error.
   Do not rerun old schema migrations manually or use migration repair to skip them.
4. Confirm all 24 migrations, including the prerequisite, are recorded. Rerun the
   read-only inspection. All direct request writes must be denied; service_role must
   retain SELECT; browser roles must have no request-table privileges.
5. Run the five SQL files below against this disposable container with
   `Get-Content -Raw <file> | docker exec -i $container psql -X -U postgres -d postgres -v ON_ERROR_STOP=1`.
   Stop on any nonzero exit code. Data-changing suites use fictional fixtures and rollback.
   - `supabase/tests/public_submission_privileges.sql`
   - `supabase/tests/public_submission_idempotency.sql`
   - `supabase/tests/assistance_request_events.sql`
   - `supabase/tests/assistance_request_status.sql`
   - `supabase/tests/unit4_privileges.sql`
6. Using only local credentials, verify actual PostgREST: first submission/replay
   return one request ID; conflicting payload returns PT409; anonymous RPC execution,
   receipt reads, direct request INSERT/UPDATE and legacy unkeyed RPC are denied.
   Verify authorized administrator reads, interaction append, and audited Start Review.
7. Finish the browser matrix in `slice1-idempotency-acceptance.md`, especially a lost
   response AFTER commit followed by reload and same-key retry. Confirm one case,
   correct success feedback and sensitive sessionStorage cleanup.

The backend slice remains unaccepted until these real integration/browser checks pass.
