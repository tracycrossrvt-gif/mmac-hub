# Slice 2a — Requested services (single animal)

Status: **design approved by Tracy 2026-11-17; implementation not started.** Nothing in
this document has been applied to code, migrations, or any database. Product decisions
in §0 are Tracy's defaults and still need Stephanie's review.

Scope: step 3 of the Get Help workflow ("Request Services") for the **one animal** the
form supports today. Multiple animals per request is Slice 2b and is out of scope. The
design below is per-animal, so 2b can reuse it without another change to how service
rows are stored.

Goal in one sentence: the applicant ticks the **broad kind of help** they need (or "Not
sure — I'd like advice"), and those choices land in `request_animal_services` atomically
with the rest of the request, so Stephanie sees structured requests in the admin view
instead of reading them out of free text.

---

## 0. Decisions — Tracy defaults, pending Stephanie review

| # | Decision | Default |
|---|---|---|
| D1 | What the public form offers | Three **broad categories**: "Surgery", "Medical care", "Vaccine Clinic", plus "Not sure — I'd like advice". Not the 8 detailed services. |
| D2 | Required or optional | **Required.** At least one category or "Not sure" must be ticked. "Not sure" counts as an answer. |
| D3 | Species "Other" | Sees **only "Not sure — I'd like advice"**. |
| D4 | Wording | As proposed in §2 ("Which services are you asking about?", "Not sure — I'd like advice"). |
| D5 | Option deactivated while someone is filling in the form | The applicant is told to contact MMAC. **Acceptable for the demo; revisit before the pilot (Phase 4.5).** |
| D6 | Rabies | **Don't auto-suggest** or pre-tick anything based on rabies status. |

**Why broad categories (D1):** public applicants describe the *kind* of help they need.
MMAC staff decide the specific services during review. This follows AGENTS.md: "Make it
extremely easy to ask for help. Do not make it easy to consume a scarce resource until
MMAC has decided to give it to you." A public checklist of specific procedures
(microchipping, FeLV/FIV testing, nail trim…) would read like an order form for scarce
services. A category says "this is the kind of help I need" and leaves the decision with MMAC.

The 8 seeded detailed services **stay in the `services` table** for future staff use
(for example, when staff record what was actually provided), but they are **not shown on
the public form and are rejected by the public submission function**.

---

## 1. Current state

### `services` (migration `20260830185852_create_services.sql`)

| Column | Notes |
|---|---|
| `id uuid` PK | `gen_random_uuid()` |
| `name text` | unique |
| `slug text` | unique |
| `description text` | nullable |
| `species_scope text` | `'all' \| 'dog' \| 'cat'`, default `'all'` |
| `is_active boolean` | default `true` |
| `sort_order integer` | default `0` |
| `created_at`, `updated_at` | |

RLS is enabled with **no policies**, so `anon` and `authenticated` see zero rows even if
a table grant exists. `service_role` bypasses RLS. Migration `20260916000000` guarantees
`service_role` column SELECT on `services(id, name, description)` only. It does not
guarantee `species_scope`, `is_active`, `sort_order`, or `slug`. On the hosted project
these are probably covered by Supabase's default table grants, but we can't assume that.

Seeded rows (`supabase/seed.sql`, fixed IDs `50000000-…-0001` to `…-0008`, all active):

| sort | Name | Scope |
|---|---|---|
| 10 | Spay / Neuter | all |
| 20 | Rabies Vaccination | all |
| 30 | Core Vaccines | all |
| 40 | Parasite Prevention | all |
| 50 | Heartworm Testing | dog |
| 60 | FeLV / FIV Testing | cat |
| 70 | Nail Trim | all |
| 80 | Microchipping | all |

There is currently no way to say "this service is a public request option." Seed data
only runs on `db reset`, so it can't be the only place that defines public options on an
existing database such as the dev/demo project.

### `request_animal_services` (migration `20260830185951`)

`id`, `request_animal_id → request_animals(id) on delete cascade`,
`service_id → services(id) on delete restrict`, `notes text`, `created_at`,
`unique (request_animal_id, service_id)`. RLS is enabled with no policies.

### Who writes and who reads

- **Nothing writes to it today.** `submit_public_assistance_request` (current version in
  `20261012000000_add_public_submission_idempotency.sql`) inserts people, households,
  household_members, animals, assistance_requests, request_animals, prescreens and
  request_availability. It never touches `request_animal_services`. No server action,
  seed, or admin action inserts into it either.
- **The admin detail page already reads it.** `getRequestDetail.ts` selects
  `request_animal_services (id, notes, service:services (name, description))` and
  validates it with `requestDetailSchema`. `CaseSummary.tsx` ("Requested services") and
  `CaseAnimals.tsx` render it, and currently always show "No structured services
  recorded". Once 2a ships they show the chosen category names with no change. The only
  admin change is showing the new "asked for advice" flag (§4.4).

---

## 2. Form UX

### Placement

Put it in the existing **"What Help Do You Need?"** card, **above** the "Tell us what you
need help with" textarea. Species is chosen in the card above, so the options can already
be filtered. Picking a category first and then explaining in words matches how people
think: "Surgery — she needs to be spayed, and she's been limping."

### The control

```
Which services are you asking about?
Select all that apply. Asking doesn't guarantee a service.

[ ] Surgery
[ ] Medical care
[ ] Vaccine Clinic
───────────────────────────
[ ] Not sure — I'd like advice
```

- A `<fieldset>` with a `<legend>`, styled the same as the existing "Which mornings…"
  day checkboxes: bordered label tiles, `min-h-11` (44px) tap targets, and
  `has-checked:` highlight.
- The options are services with **`is_active` and `is_public_request_option`**, filtered
  by species, ordered by `sort_order` then `name`:
  - dog → scope `all` or `dog`
  - cat → scope `all` or `cat`
  - other → **only "Not sure — I'd like advice"** (D3)
  - no species chosen yet → only "Not sure", plus the hint "Choose a species above to see
    the services we can help with."
  All three categories are scope `all`. The species filter stays in place so a future
  dog- or cat-only public option works without code changes.
- "Not sure — I'd like advice" is always shown, set apart by a divider. It can be combined
  with categories ("Surgery, and advise me on anything else"). It is stored as a boolean
  flag, not as a fake service (§4.4).
- **Species change:** when species changes (for example dog → other), any ticked options
  that are no longer valid are removed, and a polite live region (`aria-live="polite"`)
  says, for example, "Surgery was removed. For other animals, choose “Not sure” and tell
  us what you need below." The form never silently submits hidden selections.
- **Descriptions:** names only at launch. Add one-line public descriptions only if
  Stephanie supplies them (open question Q2).
- **No rabies-based suggestions** (D6). Nothing is pre-ticked.

### Required (D2)

Rule: at least one category **or** "Not sure — I'd like advice" must be ticked.

- **One tap, never a blocker.** Anyone unsure ticks "Not sure", which keeps the North Star
  "make it extremely easy to ask for help" intact.
- **An empty answer is ambiguous.** If the question were optional, Stephanie couldn't tell
  "skipped the question" from "doesn't know".
- **It doesn't consume anything scarce.** Ticking a box is a request, not a booking. The
  existing hint "Requested services do not guarantee that care will be provided" stays.
- **It degrades safely.** If the options can't load (§3.2), "Not sure" is still available.

### Errors and summary (consistent with 3c)

- New error key `serviceIds`, inserted into `errorFields` **between `lastHeatCycleNotes`
  and `helpSummary`** (form order). The summary link targets the first checkbox in the
  group (`service-0`, or `service-advice` when only "Not sure" is shown), which is the
  same pattern `availableDays` uses with `available-monday`.
- Message: **"Choose at least one service, or choose “Not sure — I'd like advice.”"**
- Inline: `FieldError` under the group, with the `<fieldset>` `aria-describedby` pointing
  at it, exactly as the availability fieldset does.
- The cross-field rule uses `fieldsPassed("serviceIds", "serviceAdviceRequested")` in its
  `when`, so it reports in the same pass as every other field error.
- Focus moves to the error summary on a failed submit (unchanged behavior).

### Mobile

- Single column below `sm`, two columns at `sm+` (`grid gap-3 sm:grid-cols-2`), identical
  to the day picker. Long names wrap inside the tile, and the whole tile is the label, so
  the tap target is the full row.
- The "Not sure" tile spans both columns (`sm:col-span-2`) so it reads as a separate
  choice, not one more category.
- Verify at 375 / 768 / 1280 as part of the slice's acceptance.

---

## 3. Data flow

### 3.1 Getting the public options

**Read them on the server with the existing service-role client and pass them to the
form as props.** No new public grants, policies, or client-side Supabase calls.

- New `src/features/assistance/server/getPublicServiceOptions.ts` (`import "server-only"`):
  `select id, name, species_scope from services where is_active and
  is_public_request_option order by sort_order, name` through `createAdminClient()`,
  parsed with a Zod schema. Return only those three fields.
- `src/app/(public)/get-help/page.tsx` (server component) awaits it and renders
  `<GetHelpForm serviceOptions={options} />`. The page then renders per request instead of
  being fully static. The service-role key stays on the server; only the three fields
  above reach the client. Traffic is tiny, so per-request reads are fine. Avoid
  build-time caching for now because it would need the secret key at build time.
- The migration grants `service_role` column SELECT on `services(species_scope,
  is_active, sort_order, is_public_request_option)` only where it isn't already
  effective, using the same check-then-grant pattern (with a NOTICE for each column) as
  `20260916000000`.

Alternative considered: an anon RLS policy on public options, like `service_areas` has. I'm
not recommending it because it adds a new public read surface just to render one form,
and the intake path is service-role-only end to end today.

### 3.2 If the options fail to load

Log a fixed message (no provider error text), render the form with only "Not sure —
I'd like advice" and the hint "We couldn't load the list of services right now. Choose
“Not sure” and tell us what you need below." The applicant can still submit.

### 3.3 Zod schema (`getHelpSchema.ts`)

New fields:

```ts
serviceIds: z.array(z.uuid()).max(20)
  .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
          "Select each service only once.")
  .transform((ids) => ids.map((id) => id.toLowerCase()).sort()),   // canonical order
serviceAdviceRequested: z.boolean(),
```

plus a cross-field rule (path `["serviceIds"]`, `when: fieldsPassed("serviceIds",
"serviceAdviceRequested")`): `serviceIds.length > 0 || serviceAdviceRequested`.

- **UUID list, no duplicates, max 20:** enforced in Zod (shape only). 20 is a sanity bound,
  not a policy.
- **Active, public option, species-matched:** the shared schema can't know the live
  catalog, so this is not in Zod. The client only *offers* valid choices. **The database
  function is the authority** (§4.5), because it checks in the same transaction that
  writes the rows.
- Sorting in the transform makes the saved sessionStorage snapshot and the RPC arguments
  deterministic. The database still canonicalizes on its own and doesn't rely on this.

### 3.4 Server action (`submitGetHelpRequest.ts`) and re-validation

- Re-parses the whole submission with `getHelpSubmissionSchema` (unchanged behavior).
- Passes `p_contract_version: 2`, `p_service_ids`, and `p_service_advice_requested`.
- **Legacy attempts:** a browser tab can hold a pending v1 attempt (saved before the
  deploy, with no service fields) and retry it after the deploy. The submission schema
  becomes a union keyed on `contractVersion` (absent = 1). A v1 submission is validated
  with the v1 rules (no service requirement) and sent with `p_contract_version: 1`,
  empty IDs, and `false`. It then replays or creates exactly as it would have before.
  `publicSubmissionAttempt.ts` accepts both shapes, and `freezeAttempt` also freezes
  `serviceIds`.
- Error mapping is unchanged: `PT409` → `submission_conflict`; everything else →
  `unconfirmed`. An option deactivated between page load and submit raises `PT422`, which
  shows as unconfirmed, and the locked card points the applicant to MMAC (D5). That
  outcome is safe (no duplicate, no partial write). A "please choose again" recovery path
  is parked for before the pilot.

---

## 4. Database change

One new migration, e.g.
`supabase/migrations/2026MMDDhhmmss_submit_requested_services.sql`, wrapped in
`begin; … commit;` and following the structure of `20261012000000`.

### 4.1 Marking public request options

- `alter table public.services add column is_public_request_option boolean not null default false;`
  Every existing row, including the 8 detailed services, becomes `false`.
- **The migration inserts the three category rows**, so every database gets them,
  including the dev/demo project, which is never reset:

  | Fixed id | Name | Slug | Scope | Sort | Public |
  |---|---|---|---|---|---|
  | `50000000-0000-0000-0000-000000000101` | Surgery | `surgery` | all | 110 | true |
  | `50000000-0000-0000-0000-000000000102` | Medical care | `medical-care` | all | 120 | true |
  | `50000000-0000-0000-0000-000000000103` | Vaccine Clinic | `vaccine-clinic` | all | 130 | true |

  Use `insert … on conflict do nothing`, then
  `update … set is_public_request_option = true where slug in ('surgery','medical-care','vaccine-clinic')`.
  The insert can safely run more than once, and it never overwrites a row someone has
  since edited or deactivated. Descriptions stay `null` until Stephanie supplies public
  wording.
- The migration **asserts** that afterward exactly three services have
  `is_public_request_option = true`, that they are exactly these three slugs, and that
  they are active. Otherwise it raises and rolls back.
- **`seed.sql`** gets the same three rows (same fixed IDs) with
  `is_public_request_option = true`, and its `on conflict … do update set` list gains
  `is_public_request_option`. The 8 detailed rows keep `false` explicitly. A local
  `db reset` and the dev project then end up identical.
- Staff-side editing of which services are public is out of scope. For now it changes only
  through migrations.

### 4.2 Replace the function: DROP the old signature, then CREATE

**Requirement:** the migration **drops** the existing
`submit_public_assistance_request(uuid, text, text, text, text, text, text, text, text, numeric, text, text, text, numeric, text, text, text, text, text, text, text, text[])`
(no CASCADE, so any unexpected dependency stops the migration), then creates the new
function. It does **not** use `CREATE OR REPLACE` and does not leave the old signature
alongside the new one.

The new signature adds three trailing parameters with defaults:

```sql
p_contract_version smallint default 1,
p_service_ids uuid[] default '{}',
p_service_advice_requested boolean default false
```

- The defaults make the currently deployed app (which calls with named arguments and
  omits the new ones) behave **exactly as v1**. That allows **migration first, code
  second** (§6).
- **Overload guard (same as 20261012000000),** in the post-migration DO block:
  - `to_regprocedure('<old 22-argument signature>') is null`, otherwise raise
  - `count(*) = 1` over `pg_proc` joined to `pg_namespace` where `nspname = 'public'` and
    `proname = 'submit_public_assistance_request'`, otherwise raise
    `'Unexpected submission overload; migration rolled back'`
- Exactly one overload also means PostgREST's named-argument resolution is unambiguous.
- A follow-up migration (parked) removes the defaults and v1 acceptance once no v1
  attempts can still be pending. It also drops and recreates the function and keeps the
  same guard.

### 4.3 Receipts table

`public_assistance_submission_receipts.contract_version` currently has
`check (contract_version = 1)`. Replace it with `check (contract_version in (1, 2))`.
Look up the constraint by definition in `pg_constraint` instead of assuming its
generated name, and fail the migration if it isn't found exactly once.

### 4.4 "Not sure — I'd like advice" storage

Add `request_animals.service_advice_requested boolean not null default false`. This is
per-animal, so it carries straight into 2b. Grant `service_role` SELECT on the new column
where a table-level grant doesn't already cover it (check-then-grant). Admin detail adds
it to the select and schema and shows "Asked for advice on services" next to the
requested-services list.

Rejected: a "Not sure" row in `services`. The catalog lists real services for later staff
use and reporting, and a pseudo-service would distort both.

### 4.5 Validation inside the function

Shape checks (before the receipt lookup, alongside the existing `PT422` checks):

- `p_contract_version in (1, 2)`
- v1: `coalesce(cardinality(p_service_ids), 0) = 0` and `not coalesce(p_service_advice_requested, false)`
- v2: `p_service_ids is not null`, `p_service_advice_requested is not null`,
  `cardinality(p_service_ids) <= 20`, no NULL elements, no duplicates,
  `cardinality(p_service_ids) > 0 or p_service_advice_requested`,
  and `p_species <> 'other' or cardinality(p_service_ids) = 0` (D3)

Catalog checks (**after** the replay branch, before any entity insert). **IDs that are
not public request options are rejected**, along with inactive or species-mismatched ones:

```sql
if (select count(*) from public.services s
     where s.id = any(p_service_ids)
       and s.is_active
       and s.is_public_request_option
       and p_species in ('dog', 'cat')
       and s.species_scope in ('all', p_species)) <> cardinality(p_service_ids) then
  raise exception 'Invalid submission data' using errcode = 'PT422';
end if;
```

The `p_species in ('dog','cat')` guard only matters when `cardinality > 0`; an empty array
gives `0 = 0` and passes.

**Ordering matters.** If the catalog check ran before the replay branch, then retrying a
request that *already committed* would fail once one of its options was deactivated or
unpublished, and the applicant would never get their receipt. Running it after the replay
branch means a replay always returns the original receipt, and only a first-time claim is
checked against the live catalog. The rollback on raise also releases the receipt claim.

A concurrent deactivation between the check and the insert is acceptable: the option was
valid when the check ran, and `on delete restrict` prevents deletion. No row lock is needed.

Inserts, after the `request_animals` insert (which also sets `service_advice_requested`):

```sql
insert into public.request_animal_services (request_animal_id, service_id)
select v_request_animal_id, s from unnest(p_service_ids) s order by s;
```

### 4.6 Idempotency fingerprint

- **v1 (frozen):** byte-for-byte the existing `jsonb_build_object(...)` with
  `'contract_version', 1`. Computed when `p_contract_version = 1`. Every existing v1
  receipt (and any pending v1 attempt in a browser) still verifies.
- **v2:** the same fields with `'contract_version', 2`, plus
  - `'service_ids', array(select s::text from unnest(p_service_ids) s order by s)`. The
    `uuid` type normalizes case and format, and ordering by `uuid` is deterministic, so
    **reordered IDs produce the same hash**.
  - `'service_advice_requested', p_service_advice_requested`
- That is 25 key/value pairs (50 arguments), under the 100-argument limit for
  `jsonb_build_object`. Add a comment noting the limit for future fields.
- Replay comparison becomes
  `v_receipt.contract_version <> p_contract_version or v_receipt.payload_hash <> v_hash
  → PT409`. Receipts store `p_contract_version`.

Consequences: same submission ID + same options in any order → same receipt. Same ID +
different options (or advice flag flipped) → `PT409`. A v1 receipt replayed as v2 (or the
reverse) → `PT409`. That can't happen from the real client, because an attempt keeps its
contract version.

### 4.7 Privileges

The same pattern as 1012, re-asserted inside the migration:

- `revoke all on function … from public, anon, authenticated, service_role;`
  `grant execute on function … to service_role;` (`create function` grants EXECUTE to
  PUBLIC by default, and Supabase default privileges add anon/authenticated, so the
  revoke is required.)
- `security definer set search_path = ''`, with every object schema-qualified.
- DO block: trusted owner (not an app role); the overload guard (§4.2); EXECUTE only for
  `service_role`; no app role can assume the owner of the function, receipts table,
  `assistance_requests`, `services`, or `request_animal_services`; no app role has
  INSERT/UPDATE/DELETE on `request_animal_services` or `services`; receipts table still has
  no app-role access.
- `notify pgrst, 'reload schema';` before commit.

### 4.8 Rollback plan

- **Code rollback only (most likely):** redeploy the previous Vercel build. The old code
  calls the new function without the new arguments, so the defaults give v1 behavior. The
  database stays as is.
- **Database rollback:** a prepared, reviewed (not pre-applied) down migration that:
  1. stops if any v2 receipt exists (`contract_version = 2`), unless explicitly overridden
     after deciding what to do with those requests. On the demo DB with fictional data,
     the documented choice is to delete the fictional test requests first;
  2. drops the new function and recreates the exact 1012 function body and grants, with
     the same overload guard;
  3. restores `check (contract_version = 1)`;
  4. drops `request_animals.service_advice_requested`;
  5. deletes the three category rows only if no `request_animal_services` row references
     them (`on delete restrict` enforces this), then drops
     `services.is_public_request_option`.
  It ships as a forward migration, never as a manual SQL Editor edit (ROADMAP rule).
- **Last resort:** restore the pre-push backup (§6).

---

## 5. Tests

### SQL (`supabase/tests/public_submission_services.sql`, same harness as `public_submission_idempotency.sql`; everything rolls back)

1. **Single function / overload guard:** exactly one `public.submit_public_assistance_request`
   in `pg_proc`; the old 22-argument signature resolves to `null` via `to_regprocedure`;
   the new signature exists.
2. **Public options seeded by migration:** exactly three active services with
   `is_public_request_option`, slugs `surgery`, `medical-care`, `vaccine-clinic`; all 8
   detailed services are `false`.
3. Valid v2: dog + Surgery + Vaccine Clinic → one `request_animal_services` row per option,
   `service_advice_requested = false`, receipt `contract_version = 2`.
4. Advice only (empty IDs, advice true) → zero service rows, flag true. Also for species
   `other`.
5. Empty IDs and advice false → `PT422`, no rows.
6. **Not a public option:** an active seeded detailed service (e.g. Spay / Neuter
   `…0001`) → `PT422`, no rows, no receipt.
7. Inactive public option (temporarily set `is_active = false` in the test) → `PT422`.
8. Species: `other` + Surgery → `PT422`. Scope logic: a temporary dog-only public option
   created in the test is accepted for dog and rejected for cat.
9. Unknown UUID → `PT422`.
10. Duplicate IDs, NULL element, 21 IDs → `PT422`.
11. Idempotent replay with **reordered** IDs → same `assistance_request_id`, still one case
    and one row per option.
12. Same submission ID with **different** options (or advice flag flipped) → `PT409`, no new
    rows.
13. Replay after a used option is **deactivated or unpublished** → returns the original
    receipt (verifies the §4.5 ordering).
14. v1 compatibility: call with no new arguments → behaves exactly like today (receipt v1,
    no service rows). Replay of that v1 submission → same receipt. v1 call with service IDs
    → `PT422`.
15. Privileges: `anon` and `authenticated` cannot EXECUTE; `service_role` can; no app-role
    write on `request_animal_services` or `services`.

Update `public_submission_idempotency.sql` and `public_submission_privileges.sql` where they
reference the old 22-argument signature.

### Node (`node --test`)

- Schema tests: UUID validation, duplicate rejection (including case-only duplicates),
  max 20, sort/lowercase transform, the required rule with its message and path,
  `fieldsPassed` gating, and v1 legacy submission parsing.
- `assistance-submission.test.mjs`: the action sends `p_contract_version: 2` and sorted IDs;
  a legacy v1 attempt sends `1`, `[]`, `false`; `PT409` and `PT422` mappings are unchanged;
  no submitted values in logs.
- `public-submission-attempt.test.mjs`: v1 and v2 snapshots both restore; `serviceIds` is
  frozen; a tampered snapshot is rejected.
- Form rendering: the three categories show for dog and cat; only "Not sure" for other
  and for no species; species change removes invalid selections and announces it; the
  options-failure fallback shows only "Not sure"; error summary order and link target;
  no rabies-based pre-ticking.
- Options loader: selects only active public options, returns only `id`, `name`,
  `species_scope`, and logs a fixed message on failure.
- Admin: `requestDetailSchema` accepts the new flag; `CaseSummary` shows category names and
  the advice flag.

### PGlite migration rehearsal

Extend `tests/migration-privileges.test.mjs` so the full chain (all existing migrations +
the new one + seed) applies in fresh in-memory PGlite, then runs the new SQL test file.
Check that the category insert is safe to repeat: run that block a second time and
confirm there are still exactly three public options. Run on **both** PGlite 0.3.14
(PG 17.5) and 0.5.8 (PG 18.3), matching the 1b-db procedure, with `MMAC_PGLITE_MODULE`
set. Also rehearse the down migration on a database that has v1 receipts only.

Then: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `git diff --check`.

---

## 6. Rollout

### Dev Supabase project (the live demo database)

Migration history has been clean since 1b-db (24 recorded migrations), so a normal
`db push` applies only the new file. Never use the SQL Editor for schema changes.

1. **Backup:** `npx supabase db dump --linked -f <outside the repo>` for the schema, plus a
   data dump (`--data-only`), stored outside the repo and never committed. The data is
   fictional, but we treat it as if it weren't.
2. **Pre-check (read-only):** confirm `supabase migration list` shows 24 applied and 1
   pending. Run the read-only privilege queries (`unit3_privileges.sql`) and save the output.
3. **Dry run:** `npx supabase db push --dry-run`. Stop unless the only pending migration is
   the 2a file and the linked project is the dev project.
4. **Apply:** `npx supabase db push`. Save the NOTICE output (which grants were added).
5. **Verify:** migration list shows 25; exactly one `submit_public_assistance_request`
   with the new signature; EXECUTE only for `service_role`; receipts constraint is
   `in (1, 2)`; new columns present; exactly the three public options exist and are active;
   run `public_submission_services.sql` (rolls back).
6. Then deploy code (below), then an end-to-end fictional submission on phone and desktop,
   and check the admin detail view.

### Deploy order for the live demo: **migration first, then code**

- Migration first is safe because the defaults keep the running (old) app on v1 behavior.
  The only exposure is the moment between commit and PostgREST's schema-cache reload, when
  a submission may get a "function not found" error. The app reports that as
  `unconfirmed`, and **Retry** replays idempotently with the same submission ID.
- Code first would be wrong: the new app would call a function that doesn't accept the new
  arguments yet and would read a column that doesn't exist, so the form would fail until
  the migration landed.
- Merge the PR to `main` (Vercel deploys) only after step 5 passes.

### Production (Phase 4.5)

Not affected yet. When the production project is created, this migration (including the
three category rows) is applied with all others by the planned `db push`. Seed is not run
there, which is why the categories live in the migration.

---

## 7. For Stephanie's review

Confirm or change Tracy's defaults (§0, D1–D6), plus:

1. Are "Surgery", "Medical care" and "Vaccine Clinic" the right three categories and names?
   Is anything missing (for example, "Community cats / TNR")?
2. Would you like a one-line plain-language description under each category? If so, what
   should they say?
3. Before the pilot: when an option is turned off while someone is filling in the form,
   should they be asked to choose again instead of contacting MMAC (D5)?
