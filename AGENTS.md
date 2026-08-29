# MMAC Hub — Agent Instructions

MMAC Hub is a production-oriented full-stack operations platform and public website for Macon Moves Animal Care (MMAC), a 501(c)(3) animal-welfare nonprofit.

This repository is not a generic animal-rescue website. It supports real operational workflows involving community assistance, animal-care coordination, TNR/community cats, community veterinary clinics, forms and documents, volunteers, resources, and nonprofit financial activity.

When making changes, preserve the product and architectural rules below.

---

## Product North Star

> The system should reduce administrative work, not create it.

Additional principles:

> Collect first. Organize automatically. Ask Stephanie only when a human decision is required.

> Make it extremely easy to ask for help. Do not make it easy to consume a scarce resource until MMAC has decided to give it to you.

> MMAC does not have to personally solve every problem to help someone reach a solution.

> MMAC Hub records the financial story of MMAC's work without trying to become its accounting software.

Prefer simple workflows, low cognitive load, plain language, and minimal administrative ceremony.

---

## Technology

Primary stack:

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- PostgreSQL via Supabase
- Supabase Auth
- Supabase Storage
- Supabase Realtime where justified
- React Hook Form
- Zod
- Vercel

Do not introduce major frameworks, state-management systems, databases, ORMs, component libraries, or infrastructure without a clear architectural reason.

Do not introduce microservices.

MMAC Hub is a modular monolith.

---

## Code Organization

Application code belongs under `src/`.

Prefer domain-oriented organization:

```text
src/
  app/
  features/
    assistance/
    care-cases/
    colonies/
    clinics/
    finances/
    forms/
    resources/
    volunteers/
    partners/
    service-areas/
    auth/

  components/
    ui/
    layout/

  lib/
    supabase/
    permissions/
    validation/
    audit/
    documents/