# MMAC Hub

**A full-stack assistance intake and case-management application for Macon Moves Animal Care (MMAC).**

[View source repository](https://github.com/tracycrossrvt-gif/mmac-hub) · [Explore the MMAC product case study](https://dev-portfolio-woad-seven.vercel.app/case-studies/mmac-hub)

> **Project status:** In active development as a portfolio demo (test data only). `main` includes the branded public site, assistance intake, secure administrator review, the case interaction timeline, and the audited status workflow. See [docs/ROADMAP.md](docs/ROADMAP.md) for current progress. The case-study link is not a live demo of the admin application.

## The problem

Community animal-welfare assistance involves more than collecting a form. Requests must connect people, animals, services, prescreening information, authorized reviewers, and a trustworthy record of decisions. MMAC Hub is designed to reduce manual coordination while keeping sensitive administrative actions under server-side control.

## Implemented

- **Branded public website:** Home, Our Programs, Get Involved, and Get Help pages with a shared header, footer, and accessible mobile navigation.
- **Public assistance intake:** Structured request submission, input validation with an error summary, and retry-safe submission feedback states.
- **Relational data foundation:** PostgreSQL/Supabase tables for people, households, animals, assistance requests, services, prescreening, and related records.
- **Restricted administration:** Supabase Auth sessions and server-side authorization using an allowlist of verified user IDs.
- **Request review:** Authorized administrators can inspect incoming requests and associated details.
- **Case interaction timeline:** Append-only interaction records with verified actor attribution.
- **Audited status workflow:** Defined request-status transitions with status history recorded as part of the workflow.
- **Reliability checks:** TypeScript and lint checks, focused automated tests, and manual acceptance verification during development.

## Engineering decisions

**Server authority over sensitive workflows.** Permissions and status-transition rules are enforced on the backend rather than trusting a client-provided role or state.

**Traceability as a product requirement.** Review actions and workflow changes are modeled so administrators can understand what happened and who performed an action.

**Intake before expansion.** The MVP prioritizes reliable public submissions and secure request review over building every future nonprofit operations module at once.

## Technology

- Next.js App Router, React, TypeScript, Tailwind CSS
- React Hook Form and Zod validation
- Supabase Auth and PostgreSQL
- Server-side actions and relational database migrations
- Node.js tooling, ESLint, and focused automated tests

## Planned product areas — not yet implemented in the MVP

Broader clinic coordination, community cat/TNR workflows, volunteer and partner management, resource navigation, document workflows, and nonprofit financial reporting are part of the longer-term product vision. Their inclusion here does **not** imply that these modules are production-ready.

## Local development

This project uses environment-specific Supabase configuration. Refer to `.env.example` and the repository's development instructions before running locally; never commit credentials or production secrets.

```bash
npm install
npm run dev
```

Run available verification commands from `package.json` before deploying changes.

## Role and approach

I am developing MMAC Hub from operational problem discovery through data modeling, frontend flows, server-side authorization, and workflow reliability. My veterinary operations background helps identify real-world constraints, while the implementation emphasizes maintainable software and explicit, testable rules.

## Author

**Tracy Cross** — Software Developer  
[Portfolio](https://dev-portfolio-woad-seven.vercel.app/) · [GitHub](https://github.com/tracycrossrvt-gif) · [LinkedIn](https://www.linkedin.com/in/tracy-cross-dev/)

## Developer documentation

Detailed development notes for each delivered unit: [docs/development-notes.md](docs/development-notes.md).
