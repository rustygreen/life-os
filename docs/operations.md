# Operations Guide

Life OS is designed for repeatable, low-maintenance deployment on any VM with Docker and Docker Compose.

## Prerequisites

- Linux server (recommended) or Windows host
- Docker Engine with Compose plugin
- Git
- A NAS path mounted on the host for backups (optional but recommended)

## One-command setup

Linux/macOS:

```bash
./scripts/lifeos.sh install
```

Windows PowerShell:

```powershell
./scripts/lifeos.ps1 install
```

The install command does all of the following:

1. Creates `.env` from `.env.example` if needed
2. Pulls base images
3. Builds app images
4. Starts the stack with Docker Compose

Installed core services include:

- postgres
- postgres-backup
- redis
- hermes
- api
- worker
- web
- ops-monitor

## One-command update

Linux/macOS:

```bash
./scripts/lifeos.sh update
```

Windows PowerShell:

```powershell
./scripts/lifeos.ps1 update
```

The update command automatically:

1. Creates an immediate PostgreSQL backup
2. Pulls newest images
3. Rebuilds app images
4. Restarts the stack

## Immutable release update mode

Use immutable image tags for production updates:

Linux/macOS:

```bash
./scripts/lifeos.sh release-update 2026.07.10
```

Windows PowerShell:

```powershell
./scripts/lifeos.ps1 release-update 2026.07.10
```

Release update behavior:

1. Creates immediate database backup
2. Pulls tagged API/worker/web images
3. Pulls tagged Hermes image
4. Deploys without local build (`--no-build`)
5. Verifies service health
6. Rolls back to previous tag automatically if health checks fail

Image references are configured with:

- `LIFE_OS_IMAGE_API`
- `LIFE_OS_IMAGE_WORKER`
- `LIFE_OS_IMAGE_WEB`
- `LIFE_OS_IMAGE_TAG`

## Backup strategy

Backups run automatically in the `postgres-backup` service.

Environment variables:

- `POSTGRES_BACKUP_DIR`: host path or relative project path for backups
- `POSTGRES_BACKUP_KEEP_DAYS`: retention in days
- `POSTGRES_BACKUP_INTERVAL_SECONDS`: backup frequency in seconds

For NAS backups, set `POSTGRES_BACKUP_DIR` to a mounted NAS path in `.env`, for example:

```env
POSTGRES_BACKUP_DIR=/mnt/nas/life-os/postgres
```

## Scheduled monitoring and alerting

The `ops-monitor` service runs continuously and checks:

- API health
- Web health
- Hermes health
- backup freshness

If a check fails, it logs the failure and optionally posts to `OPS_ALERT_WEBHOOK_URL`.

Relevant settings:

- `OPS_MONITOR_INTERVAL_SECONDS`
- `OPS_MONITOR_MAX_BACKUP_AGE_SECONDS`
- `OPS_ALERT_WEBHOOK_URL`
- `OPS_ALERT_MIN_SECONDS_BETWEEN_NOTIFICATIONS`
- `OPS_API_HEALTH_URL`
- `OPS_WEB_HEALTH_URL`
- `OPS_HERMES_HEALTH_URL`

## Manual backup and restore

Linux/macOS:

```bash
./scripts/lifeos.sh backup
./scripts/lifeos.sh restore ./backups/postgres/life_os_manual_20260710T000000Z.sql.gz
```

Windows PowerShell:

```powershell
./scripts/lifeos.ps1 backup
./scripts/lifeos.ps1 restore .\backups\postgres\life_os_manual_20260710T000000Z.sql.gz
```

## Day-2 commands

- `status`: list services
- `logs`: tail all logs
- `stop`: stop and remove running containers
- `health`: run one-shot health and backup freshness checks
