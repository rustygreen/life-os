# Life OS 🧠🏡

![Self Hosted](https://img.shields.io/badge/self--hosted-yes-1f6feb)
![Docker Compose](https://img.shields.io/badge/docker%20compose-ready-2496ED)
![PostgreSQL](https://img.shields.io/badge/postgres-18-336791)
![Node](https://img.shields.io/badge/node-%3E%3D22-3C873A)
![TypeScript](https://img.shields.io/badge/typescript-5.x-3178C6)
![AI Router](https://img.shields.io/badge/Hermes-enabled-8A2BE2)

Privacy-first, self-hosted personal operating system for your life data.

Life OS helps you capture and connect health, home, vehicle, and personal events into one system you own end-to-end.

![Life OS Architecture](docs/assets/life-os-architecture.svg)

## Why Life OS ✨

- You own your data
- PostgreSQL is the source of truth
- AI is an intelligence layer, not storage
- Self-hosted by default with Docker Compose
- Extensible for future domains like finance and planning

## What You Get 📦

- API service (Fastify)
- Web app (React + Vite)
- Worker service (BullMQ)
- Hermes orchestration service
- PostgreSQL + Redis
- Automated PostgreSQL backups
- Ops monitor for health + backup freshness
- One-command install and update scripts

## Ask Questions About Your Life Data 💬

Life OS is built so you can query your personal data in natural language and get useful, context-aware answers.

Examples:

- "How has my weight trended over the last 90 days?"
- "When did I last change my furnace filter?"
- "Show my oil change cadence for the Highlander."
- "Are there any unusual patterns in my sleep and resting heart rate this month?"

## Real-Time AI Analysis And Recommendations 🧪

As new events and measurements are captured, Hermes can parse and classify data quickly so your timeline stays current and queryable.

The intelligence layer is designed to:

- continuously analyze incoming life signals
- detect patterns and anomalies
- surface practical recommendations
- keep AI outputs separate from canonical facts

This means insights are powerful but still regeneratable, auditable, and grounded in your own data model.

## Architecture At A Glance 🧭

```mermaid
flowchart LR
  WEB[Web UI] --> API[API Service]
  API --> PG[(PostgreSQL)]
  API -. parse quick-add .-> HERMES[Hermes]

  WORKER[Worker] --> REDIS[(Redis)]
  BACKUP[Postgres Backup] --> PG

  WORKER_NOTE["Worker also persists processed facts to PostgreSQL"]
  OPS_NOTE["Ops Monitor checks API, Web, Hermes, and backup freshness"]
```

## 60-Second Quick Start 🚀

For a production-like local stack with Docker-managed services:

Linux/macOS 🐧🍎:

```bash
cp .env.example .env
./scripts/lifeos.sh install
```

Windows PowerShell 🪟:

```powershell
Copy-Item .env.example .env
./scripts/lifeos.ps1 install
```

Open 🌐:

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Hermes health: http://localhost:4010/health

## Local Development From Zero 🧭

This is the exact workflow for coding locally.

You can run local development without creating a `.env` file if you use the default local ports and credentials.
Create `.env` only when you want custom settings, tokens, or provider keys.

### Prerequisites

1. Git
2. Node.js 22+
3. npm 11+
4. Docker + Docker Compose

### Step-by-step

1. Clone and enter the repository.

```bash
git clone <your-fork-or-repo-url>
cd life-os
```

2. (Optional) Create your local environment file.

Linux/macOS 🐧🍎:

```bash
cp .env.example .env
```

Windows PowerShell 🪟:

```powershell
Copy-Item .env.example .env
```

Skip this step if defaults are fine.

3. Start required infrastructure services with Docker (PostgreSQL + Redis).

```bash
docker compose up -d postgres redis
```

4. Install Node dependencies.

```bash
npm install
```

5. Run database migrations.

```bash
npm run db:migrate
```

6. Start all development services from source.

```bash
npm run dev
```

7. Open the app.

- Web: http://localhost:3000
- API health: http://localhost:4000/health
- Hermes health: http://localhost:4010/health

### Stop local development

1. Stop Node dev processes with Ctrl+C.
2. Stop infrastructure containers when needed:

```bash
docker compose stop postgres redis
```

### Important local dev note

- Recommended setup is Docker for infrastructure and Node for app services.
- If you run only Node, you still need reachable PostgreSQL and Redis instances.
- Defaults used by local code are:
  - PostgreSQL: `postgresql://life_os:life_os@localhost:5432/life_os`
  - Redis: `redis://localhost:6379`

## Configuration Made Simple ⚙️

Most users only need to set these in `.env`:

```env
POSTGRES_PASSWORD=change-me
API_CORS_ORIGINS=http://localhost:3000
POSTGRES_BACKUP_DIR=./backups/postgres
OPS_ALERT_WEBHOOK_URL=
```

### Key Environment Variables 🔑

| Variable                    | Purpose                                    | Example                     |
| --------------------------- | ------------------------------------------ | --------------------------- |
| `POSTGRES_DB`               | Database name                              | `life_os`                   |
| `POSTGRES_USER`             | Database user                              | `life_os`                   |
| `POSTGRES_PASSWORD`         | Database password                          | `strong-password`           |
| `API_CORS_ORIGINS`          | Allowed browser origins                    | `http://localhost:3000`     |
| `HERMES_MODE`               | Hermes behavior (`fallback` or `required`) | `fallback`                  |
| `HERMES_API_TOKEN`          | Optional API-to-Hermes token               | `super-secret-token`        |
| `POSTGRES_BACKUP_DIR`       | Backup location (can be NAS mount)         | `/mnt/nas/life-os/postgres` |
| `POSTGRES_BACKUP_KEEP_DAYS` | Backup retention                           | `14`                        |
| `OPS_ALERT_WEBHOOK_URL`     | Alert destination (Slack/Discord/etc.)     | `https://...`               |

## Update In One Command 🔄

Linux/macOS 🐧🍎:

```bash
./scripts/lifeos.sh update
```

Windows PowerShell 🪟:

```powershell
./scripts/lifeos.ps1 update
```

This automatically:

1. Creates a backup
2. Pulls latest images
3. Rebuilds app services
4. Restarts cleanly

## Immutable Release Updates (Production) 🛡️

Use tagged images with health-checked rollback.

Linux/macOS 🐧🍎:

```bash
./scripts/lifeos.sh release-update 2026.07.10
```

Windows PowerShell 🪟:

```powershell
./scripts/lifeos.ps1 release-update 2026.07.10
```

## Operations Commands 🧰

Linux/macOS 🐧🍎:

```bash
./scripts/lifeos.sh status
./scripts/lifeos.sh health
./scripts/lifeos.sh logs
./scripts/lifeos.sh backup
```

Windows PowerShell 🪟:

```powershell
./scripts/lifeos.ps1 status
./scripts/lifeos.ps1 health
./scripts/lifeos.ps1 logs
./scripts/lifeos.ps1 backup
```

## Local Development 👩‍💻

```bash
npm install
npm run db:migrate
npm run typecheck
npm run dev
npm run dev:api
npm run dev:hermes
npm run dev:web
npm run dev:worker
```

## API Endpoints 🔌

Core 🧱:

- `GET /health`
- `POST /v1/quick-add`
- `GET /v1/timeline`

Auth 🔐:

- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `GET /v1/auth/me`

Admin 🛠️:

- `GET /v1/admin/settings`
- `PUT /v1/admin/settings/self-registration`
- `GET /v1/admin/users`
- `POST /v1/admin/users`

Hermes 🤖:

- `GET /health`
- `POST /v1/parse-quick-add`

## Project Structure 🗂️

```text
apps/
  api/
  hermes/
  web/
  worker/
packages/
  ai/
  database/
  shared/
docker/
docs/
scripts/
```

## Docs 📚

- [docs/architecture.md](docs/architecture.md)
- [docs/database-schema.md](docs/database-schema.md)
- [docs/mvp-roadmap.md](docs/mvp-roadmap.md)
- [docs/operations.md](docs/operations.md)

## Open Source ❤️

Life OS is built to be understandable, portable, and fork-friendly.

If you want to contribute, start by opening an issue for:

- new integrations
- data model improvements
- deployment hardening
- Hermes provider adapters

Contribution guide 🤝:

- [CONTRIBUTING.md](CONTRIBUTING.md)

## FAQ And Troubleshooting 🩺

### Is setup really one command? ✅

Yes. After copying `.env.example` to `.env`, run one install command:

- Linux/macOS: `./scripts/lifeos.sh install`
- Windows PowerShell: `./scripts/lifeos.ps1 install`

### How do I move to a new VM quickly? 🚚

1. Copy your `.env` file.
2. Mount or copy your backup directory.
3. Restore using the built-in restore command if needed.
4. Run install on the new VM.

### Where should backups go? 💾

Set `POSTGRES_BACKUP_DIR` to a NAS-mounted path, for example `/mnt/nas/life-os/postgres`.

### How do I know if everything is healthy? 🟢

Use:

- `./scripts/lifeos.sh health` on Linux/macOS
- `./scripts/lifeos.ps1 health` on Windows PowerShell

The monitor checks API, web, Hermes, and backup freshness.

### I changed `.env` and need to apply it. What should I run? 🔧

Run update:

- `./scripts/lifeos.sh update`
- `./scripts/lifeos.ps1 update`

### My release update failed. What happened? 🧯

Release mode verifies health and automatically rolls back if checks fail. Review logs with:

- `./scripts/lifeos.sh logs`
- `./scripts/lifeos.ps1 logs`

### Can I run without Hermes? 📴

Yes. Set `HERMES_MODE=fallback` to allow API-side fallback behavior if Hermes is unavailable.
