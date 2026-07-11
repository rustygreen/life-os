# Contributing To Life OS

Thanks for helping build Life OS.

This guide keeps contributions fast to review, easy to maintain, and aligned with the project philosophy.

## Project Principles

- Privacy first
- PostgreSQL is the source of truth
- AI is assistive, not canonical storage
- Keep deployment simple and repeatable
- Optimize for low maintenance and clear operations

## Development Setup

1. Fork and clone the repository.
2. Install dependencies.
3. Run typecheck and build before opening a PR.

```bash
npm install
npm run typecheck
npm run build
```

For service-level development:

```bash
npm run dev:api
npm run dev:hermes
npm run dev:web
npm run dev:worker
```

## Branch Naming

Use clear branch names:

- `feature/<short-description>`
- `fix/<short-description>`
- `docs/<short-description>`
- `chore/<short-description>`

Examples:

- `feature/apple-health-import`
- `fix/auth-session-expiry`
- `docs/readme-quickstart`

## Commit Message Style

Use concise, descriptive commit messages.

Recommended format:

- `feat: add hermes provider routing stub`
- `fix: enforce owner check on admin endpoint`
- `docs: improve operations troubleshooting`

## Pull Request Checklist

Before opening a pull request, make sure:

1. `npm run typecheck` passes.
2. `npm run build` passes.
3. Changes are scoped to one problem area.
4. New configuration variables are documented in `.env.example` and docs.
5. Behavior changes are described clearly in the PR body.

## What To Include In A PR

- Why this change is needed
- What changed
- Risks and compatibility notes
- Validation steps and outputs
- Follow-up work (if any)

## Good First Contributions

- Add integration adapters behind clear interfaces
- Improve reliability and observability around operations
- Add tests around auth, timeline, and quick-add parsing
- Improve docs and setup ergonomics

## Reporting Security Issues

Please do not open public issues for security vulnerabilities.

Open a private security advisory in GitHub Security for this repository.
