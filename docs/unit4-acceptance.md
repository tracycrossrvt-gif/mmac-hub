# Unit 4: audited status workflow acceptance

Unit 4 extends the accepted Unit 2 guard and Unit 3 history. It does not change
public intake, interactions, authentication, or operational scheduling. No recorder
work or dependencies are introduced. This build prepares a migration; it does not
apply it to a linked/live project.

## What changes

- The server-only action verifies identity/UUID authorization, validates input, and
  calls one RPC. Start Review delegates to that same guarded action and now requires
  the version displayed with the request. No application code updates status directly.
- `transition_assistance_request_status` locks the request, compares reviewed status
  AND version, validates the transition/reason, updates status/version/updated time,
  and inserts one status event. An error aborts the transaction, including both writes.
- Interactions keep their existing insert path, result/outcome rules, backdating,
  two-minute future tolerance, and append-only access. They never increment status version.
- SQL is authoritative. The TypeScript transition map improves input/UI feedback;
  changing that map alone cannot authorize a database transition.
- Status events share the timeline and notes field; the actor is server-derived and
  timestamps are database-generated after obtaining the row lock. No historical
  transitions are invented: existing requests retain their status at version zero.
- Only `service_role` can invoke the transition RPC. Its SECURITY DEFINER owner is
  the trusted migration owner, with empty search_path and qualified database objects.
  Existing SELECT and interaction INSERT grants remain. The known direct status
  UPDATE grant is revoked; assertions abort on unexpected effective/inherited access.

The database does not know the environment UUID allowlist. The Auth FK verifies
actor existence, not MMAC authorization. Backend credentials and database owners
remain trusted infrastructure; this is not protection against a compromised owner.

## Repository-local checks

```bash
node --test tests/admin-auth.test.mjs tests/assistance-interactions.test.mjs tests/assistance-status.test.mjs
npx tsc --noEmit
npm run lint
npm run build
node tests/unit3-http.mjs --unit4
git diff --check
```

The HTTP test runs the built Next server and real SDK/action transport against a
synthetic local Auth/REST service. It includes the Unit 3 checks plus status-action
transport, denied access before RPC, verified attribution, stale feedback and mixed
history rendering. It is not a PostgreSQL, live Supabase, or interactive browser test.
SQL structure assertions in Node are not execution tests for the migration.

## Required privilege inspection BEFORE migration

1. In the correct **development** project's SQL Editor, run the read-only
   `supabase/tests/unit4_privileges.sql` as the database owner. Save its results.
   Alternatively, using an already-secured development psql connection:

   ```bash
   psql -v ON_ERROR_STOP=1 -f supabase/tests/unit4_privileges.sql
   ```

2. Review effective column/table permissions, role memberships, owners, RLS policies,
   triggers and executable SECURITY DEFINER functions. Expected repository state:
   service_role has a column-level `UPDATE(status)` grant; browser roles cannot mutate
   case data; service_role can read requests/history and insert only interaction columns.
   Inspect definitions of any extra functions/views/triggers that might write request
   status or history; the migration cannot prove absence of arbitrary alternate paths.
3. Stop if table-wide/inherited status UPDATE, direct status INSERT, history rewrite,
   audit-field INSERT, unexpected owner-role membership, or another writable status
   path exists. Do not silently broaden permissions or revoke unrelated grants. Resolve
   unexpected live state through a separately reviewed change before rollout.

## Coordinated rollout and database checks (owner performs later)

Do not apply the migration during repository BUILD. After review and permission
inspection, schedule a brief pause in administrator case work. Old code cannot parse
new status events, and its old Start Review update will fail after revocation. New
code requires the version column. Deploy this application version together with:

`supabase/migrations/20260920000000_audited_request_status_workflow.sql`

Preview pending migrations with `npx supabase db push --dry-run`; verify the linked
project and that only the expected Unit 4 migration is pending. Apply through the
normal approved migration process (`npx supabase db push` for the linked development
project, or `npx supabase migration up --local` for a running local Supabase stack).
Do not reset a live database. No deployment commands have been run during BUILD.

The migration wraps its schema/ACL/function work in one transaction. If an assertion
fails, roll back the failed session and review the reported privilege; do not remove
or bypass the assertion to make rollout succeed. There is no broad automatic revoke.

After applying, rerun the privilege report and run:

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/assistance_request_events.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/assistance_request_status.sql
```

Both scripts are for development databases and roll back all fixtures, including
credential-free Auth rows. Expect each script's assertions-passed message. The Unit 4
suite executes all 36 status pairs (nine valid), checks exactly one matching event
per success, blank/long reasons, stale status/version, return-to-earlier-status (ABA),
terminal rejection, permissions, shape constraints, and unchanged status/version
when logging `care_established`. A nonexistent actor makes the audit INSERT fail
**after** the status UPDATE, proving rollback of status/version/updated time.

## Two-connection concurrency test

Use a dedicated fictional development case and two independent psql connections,
not two commands in one transaction/session. Obtain its request UUID, the approved
administrator Auth UUID, and its current `under_review` status/version. Replace all
placeholders below; use the same reviewed version in both sessions. Never use a real
case just for this test. This test intentionally persists one decision/event.

Session A:

```sql
begin;
set local role service_role;
select * from public.transition_assistance_request_status(
  '<request-uuid>'::uuid, 'under_review', <reviewed-version>, 'needs_info',
  'Concurrency test A: awaiting information', '<admin-auth-uuid>'::uuid, 'Concurrency test administrator'
);
-- Leave this transaction open after the result appears.
```

Session B, while A is still open:

```sql
begin;
set local role service_role;
select * from public.transition_assistance_request_status(
  '<request-uuid>'::uuid, 'under_review', <reviewed-version>, 'accepted',
  'Concurrency test B: stale decision', '<admin-auth-uuid>'::uuid, 'Concurrency test administrator'
);
```

B must wait for A's lock. Run `commit;` in A. B must then fail with `PT409` (or a
serialization failure if explicitly running a stricter isolation level). Run
`rollback;` in B. Inspect the request/history as owner: A's `needs_info` and one
version increment/event survive; B created no event and did not reverse A.

Optionally repeat on a second fictional case but use `rollback;` in A: B may then
succeed because the reviewed version remains current. Exactly one decision/event
should persist, and the event timestamps must reflect execution after lock release.

## Browser acceptance

With the approved Unit 2 environment and the new migration/code together:

1. Confirm anonymous `/get-help`, `/admin/login`, and `/admin/denied` load. Confirm
   anonymous and authenticated non-allowlisted users cannot read cases or invoke
   status mutations; repeat the missing/malformed allowlist check in a test environment.
2. On a **new fictional** request, click Start Review without a typed reason. Expect
   `under_review`, version +1, and one `New → Under review` history card with
   `Review started.`, verified actor label and two database timestamps. Reload.
3. Under review offers only Needs information, Accepted, Referred, Unable to assist.
   Needs information offers only Under review, Accepted, Referred, Unable to assist.
   No decision is preselected. Empty/whitespace or over-limit reasons must fail.
4. Use separate fictional requests to exercise every permitted transition and all
   three terminal decision statuses. Each successful action gives one durable event.
   Terminal decisions have no next-state controls, but interaction logging stays
   available. Accepted must not imply the operational case is closed.
5. Open a request in two browser tabs at the same version. Change it in tab A. In
   tab B submit a different valid decision with a typed reason. Expect stale feedback,
   no second event, and the reason retained. Reload the case, review the timeline,
   explicitly acknowledge the current case, reselect a valid decision, then submit.
   There is no automatic retry or refreshed-version substitution.
6. Also test the ABA case: keep a tab on under_review vN, use another tab to move to
   needs_info vN+1 and back to under_review vN+2, then submit the old tab. It must fail.
7. Confirm pending controls prevent repeat submits. On an uncertain connection result,
   reload and check the timeline before resubmitting; a lost response can follow a
   successful commit. Never assume a transport error means no write occurred.
8. Log Call/Text/Email/Note interactions, including `Care established` and a valid
   backdated interaction. Status/version must not change. Mixed history, latest activity,
   all-animal details, missing data states and escaped notes should remain correct.
9. Sign out in another tab and try a status action from the old tab: access denied,
   no new event. Verify public Get Help still saves a fictional request as `new` v0.
10. Check desktop/mobile layout, keyboard navigation, pending/validation/conflict
    messages, and that the reason survives a refresh/review of a stale case.

Verify persisted rows directly, substituting only the fictional request UUID:

```sql
select r.status, r.status_version, r.updated_at,
  e.event_type, e.old_status, e.new_status, e.status_version as event_version,
  e.interaction_type, e.case_outcome, e.notes, e.actor_user_id, e.actor_label,
  e.occurred_at, e.created_at as recorded_at
from public.assistance_requests r
left join public.assistance_request_events e on e.assistance_request_id = r.id
where r.id = '<request-uuid>'::uuid
order by e.occurred_at desc, e.created_at desc, e.id desc;
```

Keep pre-existing history intact. An appended note can explain a mistake; it does
not rewrite an event, reverse a status decision, or reopen a terminal decision.
Commit, push, live migration and Unit 5 each remain outside this BUILD step.
