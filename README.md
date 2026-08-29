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

Current phase: application scaffold and backend foundation.