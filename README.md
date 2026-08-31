# Lamarck DOC Intelligence

Backend for the Lamarck DOC Intelligence challenge: receive documents, process
them asynchronously and expose the extracted result through a REST API.

**Status: foundation stage only.** This README describes what exists right
now — NestJS + Prisma + PostgreSQL wired together, with a minimal CI. There
is no business logic yet: no upload endpoint, no worker, no deduplication, no
state machine transitions in code. Those are implemented in the tasks that
follow this one. See [`docs/specification.md`](docs/specification.md) and
[`docs/architecture.md`](docs/architecture.md) for the full plan.

## Stack

- TypeScript
- Node.js 24.x
- NestJS 12
- Prisma ORM 7 (PostgreSQL, via the `@prisma/adapter-pg` driver adapter)
- PostgreSQL 16 (Docker Compose)
- Vitest (tests) / oxlint (lint)

## Prerequisites

- Node.js `24.x` (see `.nvmrc`)
- npm
- Docker + Docker Compose (for PostgreSQL)

## Setup

1. Copy the environment file and adjust if needed:

   ```bash
   cp .env.example .env
   ```

   If port `5432` is already used by another local PostgreSQL, change
   `POSTGRES_PORT` (and the port in `DATABASE_URL`) in `.env` to a free port,
   e.g. `5433`.

2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Generate the Prisma client:

   ```bash
   npm run prisma:generate
   ```

5. Apply migrations:

   ```bash
   npm run prisma:migrate:deploy
   ```

   (Use `npm run prisma:migrate:dev` instead if you are changing
   `prisma/schema.prisma` and want a new migration created for you.)

6. Start the application:

   ```bash
   npm run start:dev
   ```

   The app listens on `http://localhost:3000` by default (`PORT` in `.env`).

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run the app with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled app (`dist/main.js`) |
| `npm run lint` | Run oxlint on `src/` and `test/` |
| `npm run format` | Format `src/` and `test/` with Prettier |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run prisma:validate` | Validate `prisma/schema.prisma` |
| `npm run prisma:generate` | Regenerate the Prisma client into `src/generated/prisma` |
| `npm run prisma:migrate:dev` | Create and apply a new migration locally |
| `npm run prisma:migrate:deploy` | Apply existing migrations (used in CI) |

## Project structure (foundation stage)

```
src/
├── database/          # PrismaService + DatabaseModule (global, no domain repos yet)
├── generated/prisma/   # Prisma client output (generated, not committed)
├── app.module.ts
├── app.controller.ts
├── app.service.ts
└── main.ts
prisma/
├── schema.prisma       # Document, ProcessingJob, ProcessingRun, DocumentResult
└── migrations/
docker-compose.yml       # PostgreSQL only
```

Domain modules (`documents`, `processing`, `intelligence`, `storage`) from
[`docs/architecture.md`](docs/architecture.md) §22 are not created yet — they
land with the vertical slice implementation.

## Why PostgreSQL runs in Docker but the app doesn't

The application runs locally with `npm` during development
(`docs/specification.md` / `PROJECT_CONTEXT.md`). Only PostgreSQL is
containerized, so anyone cloning the project can get a working database
without installing PostgreSQL directly on their machine.

## Why Prisma needs a driver adapter

This project uses Prisma ORM 7, which requires an explicit SQL driver
adapter (`@prisma/adapter-pg` + `pg`) to connect — `new PrismaClient()`
without an adapter does not work in this version. See
`docs/implementation/001-project-foundation.md` for details.

## CI

`.github/workflows/ci.yml` runs on every push and pull request: installs
dependencies, validates and generates the Prisma client, applies migrations
against a PostgreSQL service container, then runs lint, build and tests.

## Documentation

- [`docs/specification.md`](docs/specification.md) — what is being built and why
- [`docs/architecture.md`](docs/architecture.md) — how it is organized
- [`docs/decisions/`](docs/decisions/) — ADRs for individual decisions
- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — shared context for the AI agents working on this project
- [`docs/ai/AI_WORKFLOW.md`](docs/ai/AI_WORKFLOW.md) — how Claude and Codex collaborate on this repository
