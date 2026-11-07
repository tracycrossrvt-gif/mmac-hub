# MMAC Hub Roadmap

This is the single source of truth for where the project stands. Humans and coding agents read it at the start of every session and update it at the end of every step.

**Current step:** Phase 2 — Slice 1 acceptance (first item: successful submission creates one complete record set)
**Active branch:** `round-5-secure-admin-review`
**Last updated:** 2026-11-07

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

- [ ] Successful submission creates one complete record set
- [ ] Retrying with the same submission ID creates no duplicate
- [ ] A conflicting payload is rejected (PT409) with no new rows
- [ ] Recovery after an interrupted response and after a page reload
- [ ] Duplicate-tab double send produces one case
- [ ] Storage-failure scenarios fail closed
- [ ] Console and server logs contain no contact or medical data, secrets, or raw DB errors
- [ ] The submitted case appears correctly in the admin interface (detail, timeline, status)

## Phase 3 — Branded public frontend (live proof of concept)

Direction: photographic hero, approachable service cards, warm sage and blue palette, MMAC branding.

- [ ] Collect inputs from Tracy: logo, brand colors, photos with permission
- [ ] Homepage
- [ ] Service information pages
- [ ] Navigation and layout
- [ ] `/get-help` polish:
  - styled error messages
  - an error summary at the top that receives focus
  - `aria-invalid` on invalid fields
  - complete loading, success and failure states
- [ ] Responsive polish
- [ ] Accessibility pass (keyboard, screen reader, contrast)

## Phase 3.5 — Codebase walkthrough (Tracy)

Goal: Tracy can explain every part of the MVP in an interview. Walkthrough happens in the Claude planning chat, in small readable chunks. No code changes in this phase.

- [ ] Form + Zod schema, including `fieldsPassed` and the `when` gating on cross-field rules
- [ ] Server action and the public submission contract
- [ ] Idempotency: submission UUID, receipts table, sessionStorage recovery
- [ ] Database migrations and privileges
- [ ] Admin auth (allowlist, protected routes) and the audited status workflow
- [ ] Write a one-paragraph interview explanation for each area above

## Phase 4 — Deployment readiness

- [ ] Review the 14 `npm audit` findings and fix or document each
- [ ] Decide how to apply the privilege-correction migration to the hosted Supabase project (it holds test data only)
- [ ] Set up a demo database with seed data only and no real applicant data
- [ ] Final security and cross-browser checks
- [ ] Merge to `main` and deploy the demo to Vercel
- [ ] Update the README status note once `main` is current

## Phase 5 — Post-MVP (not now)

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
- **No verified public MMAC contact method is in the repo.** The recovery and conflict messages need one.
- **sessionStorage holds unresolved contact and medical data** until the submission resolves. Confirm this is acceptable and say so on the form.
- **Demo database:** a separate Supabase project, or the existing hosted test project?

## End-of-project cleanup

- [ ] Correct the stack on the portfolio case study: Next.js App Router, TypeScript, React, Tailwind, Supabase Auth + PostgreSQL, React Hook Form, Zod
- [ ] Use one organization name everywhere. Some diagrams say "Macon Moves Animal Coalition."
- [ ] Regenerate or redraw the Target ERD images, which have garbled table names
- [ ] Relabel the "Core Workflows (MVP)" image as product vision. Clinics and volunteer/donate are not in the MVP.

## Parking lot

Things noticed during a step but out of scope. Triage these between steps.

- Show one Retry message instead of two on submission failure (Phase 3 polish)
- Free Supabase projects pause after inactivity — plan for keeping the demo awake or upgrading (Phase 4)
- Supabase CLI v3.0.0 is available (pinned at 2.116.0) — evaluate upgrading between phases, not mid-step.
