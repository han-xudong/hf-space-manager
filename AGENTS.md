# HF Space Manager Agent Guide

## Project Intent

This repository is for a Next.js-based Hugging Face Space Manager: a web application for monitoring and operating Hugging Face Spaces with multi-user support, secure Hugging Face API token management, scheduled anti-sleep wake-ups, and Docker-first deployment.

The repository is now in active implementation. Treat the documents in this repository as the source of truth, and keep code changes aligned with `README.md`, `DESIGN.md`, and `AGENTS.md` as implementation continues.

## Source Of Truth

Read these files before making architecture or product decisions:

1. `DESIGN.md`
2. `README.md`
3. `AGENTS.md`

If these files disagree, follow this precedence:

1. Explicit user instruction
2. `README.md` for scope, runtime, and release behavior
3. `DESIGN.md` for visual and interaction language
4. `AGENTS.md` for execution rules

## Product Scope

The expected core capabilities are:

- Real-time Space monitoring
- Multi-user and role-based access
- Operation controls: restart, rebuild, manual wake
- Scheduled keep-awake / anti-sleep policies
- Docker deployment
- Secure Hugging Face API token connection management

## Architecture Defaults

Unless the user directs otherwise, use these defaults:

- Framework: Next.js 16 with App Router and TypeScript
- Runtime: Node.js runtime, not Edge runtime
- Rendering split: React Server Components by default, client components only where interactivity requires them
- API boundary: Next.js Route Handlers for backend endpoints
- Background processing: dedicated worker process for polling, scheduled wake jobs, retries, and action execution
- Persistence: SQLite for application state plus a database-backed durable queue and lease model for worker coordination
- Realtime transport: SSE first; only add WebSockets if SSE becomes a proven limitation
- Deployment: Docker-first, defaulting to an embedded-runtime package that can run in one container or as split `web` / `worker` processes against the same SQLite file

## Security Rules

These rules are mandatory:

- Never expose Hugging Face tokens to the browser.
- All Hugging Face API calls must be made server-side.
- Tokens must be encrypted at rest using a server-side master key.
- Every restart, rebuild, wake, token change, and schedule change must be auditable.
- Destructive or state-changing operations must enforce authorization server-side.
- Do not assume undocumented Hugging Face metrics are stable; validate availability before productizing them.

## UX And Design Rules

Follow `DESIGN.md` closely:

- Monospace-first UI voice
- Warm near-black palette instead of generic pure black
- Sharp, restrained UI with minimal ornament
- Flat depth model; rely on borders and contrast, not heavy shadows
- Dashboard design should feel terminal-native, not generic SaaS admin

Preserve the design language even when building complex monitoring surfaces.

## Feature Sequencing

When implementation starts, prefer this order:

1. Architecture pivot and foundation: app shell, design tokens, auth, embedded persistence, local Docker environment
2. Secure connection management: users, roles, encrypted Hugging Face token vault
3. Space inventory and monitoring: import tracked Spaces, status sync, snapshots, dashboard
4. Operations control: restart, rebuild, manual wake, audit trail
5. Scheduling: wake rules, worker jobs, retries, failure handling
6. Hardening: observability, rate limiting, secrets handling, deployment polish

## Implementation Guardrails

- Prefer server-rendered pages for first paint and data loading.
- Use client components only for charts, live stream consumers, filters, and action dialogs.
- Keep business rules in server modules, not UI components.
- Treat scheduler logic as backend infrastructure, not page-level logic.
- Keep Docker deployment compatible with `next build` standalone output and a writable mounted volume for SQLite.
- Choose explicit, typed API contracts between UI, app backend, and worker.

## Validation Expectations

Before implementing monitoring metrics or action flows, validate:

- Which Hugging Face endpoints are official and stable
- Which operations require write tokens
- Which metrics are actually retrievable per Space type
- Rate limits and retry behavior
- Private Space visibility and permission handling

Document the result of that validation in `README.md` or a follow-up architecture note before broad implementation.

## Current Constraint

At this stage, this repository contains a working implementation scaffold. Future work should preserve the current logical split across `app`, `lib`, `prisma`, and `worker`, continue the embedded-runtime model described in `README.md`, and keep Docker deployment functional.
