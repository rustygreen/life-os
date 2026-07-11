# Initial Database Schema

## Schema Strategy

The schema should support many life domains while staying queryable and maintainable.

The main pattern is:

- stable typed columns for core filtering and joins
- JSONB for extensible metadata
- a small number of generic primitives
- explicit foreign keys where relationships matter

## Initial Tables

### `workspaces`

The top-level ownership boundary. All core facts belong to a workspace.

Key columns:

- `id`
- `slug`
- `name`
- `metadata`

### `users`

Reserved for authentication and memberships.

Key columns:

- `id`
- `email`
- `display_name`
- `metadata`

### `memberships`

Associates users to workspaces.

Key columns:

- `workspace_id`
- `user_id`
- `role`

### `captures`

Stores the original raw input and parser state.

Key columns:

- `workspace_id`
- `channel`
- `raw_text`
- `parser_status`
- `parsed_payload`
- `source_metadata`

This table is critical because it keeps the source input separate from created facts.

### `entities`

Generic connected objects such as people, assets, vehicles, locations, and systems.

Key columns:

- `workspace_id`
- `kind`
- `name`
- `status`
- `metadata`

Examples of `kind` values:

- `person`
- `asset`
- `vehicle`
- `location`
- `system`

### `relationships`

Connects entities to each other.

Key columns:

- `workspace_id`
- `from_entity_id`
- `to_entity_id`
- `relationship_type`
- `metadata`

Examples:

- house `contains` hvac
- person `owns` vehicle
- person `lives_at` location

### `documents`

Stores structured metadata and references to original external documents.

Key columns:

- `workspace_id`
- `provider`
- `external_uri`
- `document_type`
- `metadata`

### `events`

Represents things that happened.

Key columns:

- `workspace_id`
- `entity_id`
- `capture_id`
- `event_type`
- `title`
- `occurred_at`
- `metadata`

Examples:

- `maintenance.filter_changed`
- `vehicle.oil_changed`
- `health.workout_completed`
- `life.vacation_started`

### `measurements`

Represents time-series facts.

Key columns:

- `workspace_id`
- `entity_id`
- `capture_id`
- `metric`
- `value_numeric`
- `unit`
- `measured_at`
- `metadata`

Examples:

- `body.weight`
- `home.temperature`
- `vehicle.odometer`

### `tags` and `tag_links`

Allows cross-cutting organization without changing the schema.

## Timeline Read Model

The timeline should initially be a SQL union over `events` and `measurements` sorted by time. Do not introduce a separate timeline storage table until query patterns prove it necessary.

## Why This Schema Fits The Vision

- It supports many domains through generic primitives.
- It preserves original capture input.
- It allows AI parsing to be improved without rewriting history.
- It keeps PostgreSQL central.
- It avoids a specialized schema for every life category.

## Deferred Additions

These are intentionally not required in the first schema:

- embeddings tables and `pgvector`
- geographic columns and PostGIS
- materialized search projections
- audit/event bus persistence beyond the capture trail
- provider-specific integration tables for each external system

Those should be added when real query or ingestion needs justify them.
