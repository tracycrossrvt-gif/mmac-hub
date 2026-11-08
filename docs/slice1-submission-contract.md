# Slice 1: public submission contract hardening

The shared Zod schema preserves the existing single-animal form shape. The Server
Action now accepts a validated `{ submissionId, data }` envelope. Durable replay
protection adds a private receipt table and a required UUID parameter to the RPC.
See [idempotency acceptance](slice1-idempotency-acceptance.md) for the migration,
privacy lifecycle, rollout and test instructions. No npm dependencies are added.

## Rules grounded in the current implementation

- Species, sex, altered status, rabies status, prevention use and weekdays match
  existing form options and database CHECK constraints. Duplicate weekdays are
  rejected before the existing request/day uniqueness constraint can fail.
- Optional text is trimmed; blank strings become absent values. The action maps
  these back to the existing RPC's empty-string/null conventions. Blank contribution
  is absent; explicit zero remains zero. Booleans, nulls and arrays are not money.
- Age remains text across client validation so server revalidation accepts it.
  It must be a finite nonnegative decimal number (exponent notation is allowed).
  The 999.9 bound comes from animals.age_years numeric(4,1), not an eligibility or
  biological age rule. Existing PostgreSQL fractional rounding is unchanged.
- Contribution remains a stated amount, with the numeric(10,2) storage maximum
  of 99,999,999.99. No financial decision or payment is created.
- Email uses the existing authentication schema's 254-character bound. Names,
  phone, descriptions and narrative text have no product-approved maximum in
  this repository; their existing behavior is preserved rather than inventing
  limits. These field-specific limits remain a product question, not a claim
  that this change provides request-size or abuse protection.

## Results and failures

The explicit return union stays compatible with GetHelpForm: either
`{ success: false, code, message }` or `{ success: true, requestId, status: "new" }`.
Success requires exactly one RPC result with a valid request UUID and the RPC's
documented `new` status. Extra internal IDs are not returned to the browser.

Invalid input never creates a privileged client. RPC errors, absent/malformed
receipts and unexpected exceptions produce conservative unconfirmed-submission
feedback. They do not assert rollback or promise a safe retry. Only fixed error
categories are logged; database details and submitted data are not logged.
There are no automatic retries. Explicit retries retain the same UUID and payload;
the database receipt makes matching replays safe and rejects changed payloads.

An exception caught inside the action can be converted to this result. Loss of
the action response on its way to the browser cannot be caught by the server
afterward; the form catches transport exceptions and retains its pending attempt
for explicit retry. Storage failures and conflicts block further submission.

## Validation

Run the focused suite and existing regressions:

```bash
node --test tests/assistance-submission.test.mjs tests/admin-auth.test.mjs tests/assistance-interactions.test.mjs tests/assistance-status.test.mjs
npx tsc --noEmit
npm run lint
npm run build
node tests/unit3-http.mjs --unit4
git diff --check
```

The focused suite executes the actual schema/action through the existing loader,
with only Supabase I/O stubbed. The HTTP harness uses synthetic Auth/REST; neither
is proof of live persistence. On the intended test project, submit a fictional
request, verify its single-animal records and `new`/version-zero state, and check
the accepted form's pending/success/failure presentation. Use fictional data to test a lost response followed by an explicit same-ID retry.
Never create a new identifier to recover an uncertain attempt.
