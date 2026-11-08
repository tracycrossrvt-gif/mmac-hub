# MMAC Hub Roadmap

This is the single source of truth for where the project stands. Humans and coding agents read it at the start of every session and update it at the end of every step.

**Current step:** Phase 4 — Deployment readiness
**Launch target:** live portfolio demo by Sunday 2026-11-08 evening. Shared with MMAC and employers; test data only.
**Active branch:** `round-5-secure-admin-review`
**Last updated:** 2026-11-08

---

## How we work

Each step follows the same loop:

1. **Brief:** what we're doing, why, and what "done" means.
2. **Scoped prompt:** Claude Code does that one step only. No drive-by refactors.
3. **Verify:** run the checklist, review the diff, and only then commit.
4. **Explain:** write 2–3 sentences on how I'd describe this work in an interview.

Rules for agents:

- Work only on the **current step**. If you notice something else, add it to "Parking lot" below. Do not fix it.
- Never log or commit applicant contact or medical data. Use obviously fictional test data only.
- Never run migrations or SQL against the hosted Supabase project unless the current step explicitly says to.
- Never apply schema changes through the Supabase SQL Editor. All schema changes go through migration files and the Supabase CLI, so migration history stays accurate.
- Visual and content decisions follow docs/DESIGN.md. Don't invent copy, stats, or links — park gaps instead.
- When a step is complete, tick it here, move **Current step** forward, and update **Last updated**.

---

## Phase 0 — Housekeeping

- [x] Push Slice 1 commits to GitHub (`549ce11`, `4320e73`, `cf57251`), done 2026-11-07
- [x] Add this roadmap to the repo

## Phase 1 — Fix the intake form (immediate blocker) ✅ Complete 2026-11-07

- [x] **1a. Diagnose** why `/get-help` won't submit. Use temporary dev-only `onInvalid` logging with field names and messages only, never values. Hypotheses:
  - a saved sessionStorage attempt is locking the form
  - some fields fail validation with no visible error
  - object-level `.refine()` rules only run after field checks pass
  - Cause: dev database was four migrations behind the branch; also age errors were invisible and cross-field rules ran late.
- [x] **1b. Minimal fix** so a valid submission goes through and every invalid field shows its error. Remove all `TEMP-DIAGNOSTIC` code.
  - Code fix done in 3d91178. Done-criteria (a valid submission goes through) unblocked by 1b-db.
- [x] **1b-db. Apply the four pending migrations to the dev Supabase project** (20260916000000, 20260919000000, 20260920000000, 20261012000000) in filename order via `supabase db reset --linked`, after checking none were hand-applied and completing the read-only privilege review in docs/slice1-privilege-correction.md. Then re-test the admin history and status pages.
  - Done 2026-11-07. Migrations 0916 and 0920 had been hand-applied (unrecorded). Backed up, rehearsed all 24 migrations + seed in PGlite (18/18 tests passed), then ran db reset --linked. Verified: 24 migrations recorded, all new objects present, one uuid submit function, seed counts correct, only service_role has SELECT on request tables. Admin login recreated; end-to-end fictional submission, admin view, and audited status change all work.
- [x] **1c. Verify** on desktop and a mobile-width viewport.
  - Done 2026-11-07. Mobile: end-to-end submission. Desktop: visual check.

## Phase 2 — Slice 1 acceptance

Follow `docs/slice1-idempotency-acceptance.md`, using the development Supabase project and fictional data only.

- [x] Successful submission creates one complete record set
- [x] Retrying with the same submission ID creates no duplicate
- [x] Recovery after a page reload
- [x] The submitted case appears correctly in the admin interface (detail, timeline, status)

Verified 2026-11-07 in browser against dev DB. Retry test used DevTools Offline, so the first attempt never reached the server; the committed-but-response-lost case is covered by automated DB tests (supabase/tests/public_submission_idempotency.sql) and remains in After launch for browser verification.

## Phase 3 — Branded public frontend (live proof of concept)

Direction: photographic hero, approachable service cards, warm sage and blue palette, MMAC branding.

- [x] Build landing page (/) and intake page (/get-help) per docs/DESIGN.md
  - 3b done 2026-11-08: home (/), Our Programs (/programs) and Get Involved (/get-involved) pages built. programs.jpg pending from MMAC. Intake page (/get-help) is 3c.
- [x] Demo banner, header, stats bar, footer per docs/DESIGN.md
- [ ] Mobile + keyboard + contrast check at 375/768/1280

## Phase 4 — Deployment readiness

- [ ] Review the 14 `npm audit` findings and fix or document each
- [x] Privilege correction applied to the hosted dev project via db reset --linked (2026-11-07, see 1b-db).
- [ ] Before sharing the demo, confirm the dev database holds only fictional data (clear today's test submissions if needed).
- [ ] Final security and cross-browser checks
- [ ] Merge to `main` and deploy the demo to Vercel
- [ ] Update the README status note once `main` is current
- [ ] Record admin flow screenshots or a short video for the case study
- [ ] Smoke-test the live site on a phone
- [ ] Make the demo banner controlled by an environment setting (on for the demo, off for production).

## Phase 4.5 — MMAC pilot (live use)

Gate: Stephanie reviews the portfolio demo and signs off. Do not start until then.

- [ ] Stephanie demo review and sign-off (record date and any requested changes)
- [ ] Decide account ownership (MMAC-owned Supabase/Vercel vs Tracy's) and Supabase plan (paid tier to avoid pausing)
- [ ] New production Supabase project: link, db push all migrations (no seed), verify with the 1b-db queries (D1–D5)
- [ ] Production Vercel deployment with its own env vars; demo banner turned off via setting
- [ ] Email notification to MMAC on each new request
- [ ] Privacy notice on the form (what's collected, who sees it, retention)
- [ ] Finish the "After launch" acceptance tests (conflict, lost response, duplicate tab, storage failure, log check)
- [ ] "Submit another request" on the success card (move from Parking lot)
- [ ] Admin account for Stephanie + 20-minute walkthrough
- [ ] Go live; portfolio demo stays separate on the dev database

## After launch

Not required for the Sunday demo. Pick these up once the demo is live.

**Phase 2 acceptance (remaining):** follow `docs/slice1-idempotency-acceptance.md`.

- [ ] A conflicting payload is rejected (PT409) with no new rows
- [ ] Recovery after an interrupted response
- [ ] Duplicate-tab double send produces one case
- [ ] Storage-failure scenarios fail closed
- [ ] Console and server logs contain no contact or medical data, secrets, or raw DB errors

**Frontend:**

- [ ] Service information pages
- [ ] Accessibility pass (full audit)

**Demo access:**

- [ ] Read-only demo admin login

**Codebase walkthrough (Tracy):** Tracy can explain every part of the MVP in an interview. The walkthrough happens in the Claude planning chat, in small readable chunks. No code changes.

- [ ] Form + Zod schema, including `fieldsPassed` and the `when` gating on cross-field rules
- [ ] Server action and the public submission contract
- [ ] Idempotency: submission UUID, receipts table, sessionStorage recovery
- [ ] Database migrations and privileges
- [ ] Admin auth (allowlist, protected routes) and the audited status workflow
- [ ] Write a one-paragraph interview explanation for each area above

## Phase 5 — Phased rollout of the full ERD

After the pilot is live and in use, break the target ERD into modules and ship one at a time, each with its own brief, migrations, tests, and Stephanie review. Order to be decided with MMAC.

These are product capabilities, not prerequisites for the demo:

- Multiple animals and services per request
- Granular assistance decisions
- Provider coordination
- Bookings
- Service-delivery reporting
- Community cat / TNR projects, vaccine clinics, volunteer and donate flows

---

## Open product decisions

- **Server-rejected submissions lock the form permanently**, with no "start over" option. This protects the data, but it's a dead end for a stressed user. Decide before Phase 3.
  - Launch: locked card points to MMAC contact with demo note (per DESIGN.md); revisit before real use.
- ~~**No verified public MMAC contact method is in the repo.**~~ **Resolved:** Contact method: MMAC's public phone/email (from maconmovesanimalcare.com) shown in footer and on the failure/locked card.
- **sessionStorage holds unresolved contact and medical data** until the submission resolves. Confirm this is acceptable and say so on the form.
- ~~**Demo database:** a separate Supabase project, or the existing hosted test project?~~ **Resolved:** Demo database: existing dev Supabase project, test data only.

## End-of-project cleanup

- [ ] Correct the stack on the portfolio case study: Next.js App Router, TypeScript, React, Tailwind, Supabase Auth + PostgreSQL, React Hook Form, Zod
- [ ] Use one organization name everywhere. Some diagrams say "Macon Moves Animal Coalition."
- [ ] Regenerate or redraw the Target ERD images, which have garbled table names
- [ ] Relabel the "Core Workflows (MVP)" image as product vision. Clinics and volunteer/donate are not in the MVP.

## Parking lot

Things noticed during a step but out of scope. Triage these between steps.

- ~~Show one Retry message instead of two on submission failure (Phase 3 polish)~~ Done in 3c (2026-11-08).
- Free Supabase projects pause after inactivity — plan for keeping the demo awake or upgrading (Phase 4)
- Supabase CLI v3.0.0 is available (pinned at 2.116.0) — evaluate upgrading between phases, not mid-step.
- Ask MMAC for the original logo file (SVG or high-res transparent PNG).
- Get Involved page is one section for launch — add volunteer sign-up and other ways to help later.
- Service tiles have names only — add one-line descriptions from MMAC.
