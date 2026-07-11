# MVP Roadmap

## Phase 0: Foundation

Deliverables:

- Docker Compose stack
- PostgreSQL and Redis services
- API, web, and worker apps
- initial schema and migrations
- Quick Add capture path
- basic timeline query and UI

Success criteria:

- a fresh machine can run the stack with one compose command
- a user can submit simple natural language inputs
- those inputs become queryable timeline records

## Phase 1: Single-User Product Loop

Deliverables:

- real authentication
- entity management basics
- manual correction of parsed results
- timeline filtering
- stable event and measurement creation flows

Success criteria:

- one user can safely run Life OS as their private system of record
- capture, review, and correction are reliable

## Phase 2: Integrations And Enrichment

Deliverables:

- calendar integration
- Home Assistant integration
- health data import paths
- asynchronous enrichment pipeline
- document references and extraction workflows

Success criteria:

- external systems can contribute structured facts without compromising data ownership

## Phase 3: Intelligence Layer

Deliverables:

- provider-neutral AI interface
- model routing
- semantic search
- Hermes orchestration
- AI-generated summaries and insights

Success criteria:

- AI improves understanding and actionability without becoming the source of truth

## Near-Term Implementation Order

1. stabilize the current schema and domain contracts
2. add real authentication and workspace bootstrapping
3. upgrade Quick Add from rule-based parsing to staged AI parsing
4. add entity linking and correction workflows
5. add first external integrations
