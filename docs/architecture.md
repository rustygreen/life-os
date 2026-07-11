# Life OS Architecture

## Goals

The first foundation should optimize for these properties:

- Easy self-hosted deployment with `docker compose up -d`
- PostgreSQL as the canonical record of facts
- Flexible schema for many domains without a table explosion
- AI-assisted capture without making AI output canonical by default
- Clean paths to future integrations, model routing, and event processing

## Recommended Foundation

Use a modular monorepo with three deployable services and shared packages:

- `apps/web`: user-facing application
- `apps/api`: HTTP API and synchronous orchestration layer
- `apps/worker`: asynchronous job processing and future integration syncs
- `packages/database`: migrations, SQL access, and schema contracts
- `packages/shared`: shared types and domain contracts

This is a service-oriented modular monolith, not a microservice system. That is the right tradeoff for the MVP because the product surface is broad while the initial deployment target is small.

## Core Principles Refined

### 1. Facts first, insights second

Canonical facts go into structured tables. AI-produced interpretations are stored separately from those facts and can be regenerated.

### 2. Event-driven inside the platform

The first version can expose synchronous HTTP APIs while still treating important writes as domain events internally. That means:

- captures are recorded first
- parsing results are recorded second
- facts are created from accepted parsing results
- async enrichment is pushed to Redis-backed jobs

### 3. Flexible data model with strong anchors

Avoid hundreds of domain tables. Keep a small number of durable primitives:

- `entities`
- `relationships`
- `events`
- `measurements`
- `documents`
- `captures`
- `tags`

Use JSONB only where the shape is genuinely variable. Use typed columns for fields that drive filtering, ordering, joins, and constraints.

### 4. External files remain external

Life OS stores metadata, extracted fields, and references to original files. It does not become a second file system.

### 5. AI is pluggable

Parsing, summarization, embeddings, and orchestration live behind service interfaces. Provider-specific code should never leak into core domain models.

## Service Boundaries

### Web

Responsibilities:

- authentication UI later
- quick capture UI
- timeline and search UI
- settings and integrations UI

Non-responsibilities:

- direct database access
- long-running ingestion logic

### API

Responsibilities:

- request validation
- auth enforcement
- domain write orchestration
- timeline queries
- quick add capture and parse flow
- enqueueing background work

The API should be the only synchronous writer for user-facing actions.

### Worker

Responsibilities:

- heavy parsing jobs
- imports from integrations
- enrichment and summarization
- future embedding generation
- retries and backoff for external systems

The worker should never invent canonical facts without either deterministic rules or a tracked parse result.

## Domain Flow For Quick Add

1. Web sends raw text to API.
2. API stores a `capture` record.
3. API parses using deterministic rules first, then AI later.
4. API writes resulting `event` or `measurement` facts.
5. API emits a job for optional follow-up enrichment.
6. Timeline reads facts directly from PostgreSQL.

This design preserves the original input while making facts queryable immediately.

## Authentication Direction

Authentication should be introduced early, but the domain schema should key data by `workspace_id`, not `user_id`. That avoids tying canonical facts to a future auth implementation.

Recommended shape:

- `users`
- `workspaces`
- `memberships`
- session-based web auth with API token verification later

For the initial foundation, a seeded default workspace is acceptable before a full auth flow is added.

## Data Access Direction

For the MVP foundation, plain SQL with strong TypeScript contracts is sufficient and keeps behavior explicit. If the schema grows significantly, introduce a lightweight typed query layer or ORM selectively rather than forcing the entire model into one abstraction too early.

## Future Extensions

The architecture leaves room for:

- `pgvector` for semantic search
- PostGIS for location-aware events and assets
- an MCP-compatible tool layer
- Hermes as an orchestration service or package
- multiple model providers behind a provider-neutral AI interface

Those should be phase-two additions, not day-one requirements.
