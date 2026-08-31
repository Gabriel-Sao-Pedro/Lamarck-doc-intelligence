# Lamarck DOC Intelligence

Backend do desafio Lamarck DOC Intelligence: receber documentos, processá-los
de forma assíncrona e expor o resultado extraído por uma API REST.

**Status: apenas fase de foundation.** Este README descreve o que existe
agora — NestJS + Prisma + PostgreSQL conectados, com uma CI mínima. Ainda não
há regra de negócio: sem endpoint de upload, sem worker, sem deduplicação,
sem transições de state machine em código. Isso é implementado nas tarefas
seguintes a esta. Ver [`docs/specification.md`](docs/specification.md) e
[`docs/architecture.md`](docs/architecture.md) para o plano completo.

## Stack

- TypeScript
- Node.js 24.x
- NestJS 12
- Prisma ORM 7 (PostgreSQL, via o driver adapter `@prisma/adapter-pg`)
- PostgreSQL 16 (Docker Compose)
- Vitest (testes) / oxlint (lint)

## Pré-requisitos

- Node.js `24.x` (ver `.nvmrc`)
- npm
- Docker + Docker Compose (para o PostgreSQL)

## Configuração

1. Copie o arquivo de ambiente e ajuste se necessário:

   ```bash
   cp .env.example .env
   ```

   Se a porta `5432` já estiver em uso por outro PostgreSQL local, troque
   `POSTGRES_PORT` (e a porta no `DATABASE_URL`) em `.env` para uma porta
   livre, ex.: `5433`.

2. Suba o PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Instale as dependências:

   ```bash
   npm install
   ```

4. Gere o Prisma client:

   ```bash
   npm run prisma:generate
   ```

5. Aplique as migrations:

   ```bash
   npm run prisma:migrate:deploy
   ```

   (Use `npm run prisma:migrate:dev` se estiver alterando
   `prisma/schema.prisma` e quiser que uma nova migration seja criada
   automaticamente.)

6. Inicie a aplicação:

   ```bash
   npm run start:dev
   ```

   A aplicação escuta em `http://localhost:3000` por padrão (`PORT` em `.env`).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run start:dev` | Roda a aplicação com hot reload |
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda a aplicação compilada (`dist/main.js`) |
| `npm run lint` | Roda o oxlint em `src/` e `test/` |
| `npm run format` | Formata `src/` e `test/` com o Prettier |
| `npm test` | Roda os testes unitários (Vitest) |
| `npm run test:e2e` | Roda os testes end-to-end |
| `npm run prisma:validate` | Valida `prisma/schema.prisma` |
| `npm run prisma:generate` | Regenera o Prisma client em `src/generated/prisma` |
| `npm run prisma:migrate:dev` | Cria e aplica uma nova migration localmente |
| `npm run prisma:migrate:deploy` | Aplica as migrations existentes (usado na CI) |

## Estrutura do projeto (fase de foundation)

```
src/
├── database/          # PrismaService + DatabaseModule (global, ainda sem repositórios de domínio)
├── generated/prisma/   # saída do Prisma client (gerada, não commitada)
├── app.module.ts
├── app.controller.ts
├── app.service.ts
└── main.ts
prisma/
├── schema.prisma       # Document, ProcessingJob, ProcessingRun, DocumentResult
└── migrations/
docker-compose.yml       # só PostgreSQL
```

Os módulos de domínio (`documents`, `processing`, `intelligence`, `storage`)
de [`docs/architecture.md`](docs/architecture.md) §22 ainda não foram
criados — eles chegam com a implementação da vertical slice.

## Por que o PostgreSQL roda em Docker mas a aplicação não

A aplicação roda localmente com `npm` durante o desenvolvimento
(`docs/specification.md` / `PROJECT_CONTEXT.md`). Só o PostgreSQL fica em
container, para que qualquer pessoa que clonar o projeto consiga ter um
banco funcionando sem instalar PostgreSQL diretamente na máquina.

## Por que o Prisma precisa de um driver adapter

Este projeto usa o Prisma ORM 7, que exige um driver adapter explícito de
SQL (`@prisma/adapter-pg` + `pg`) para conectar — `new PrismaClient()` sem
um adapter não funciona nesta versão. Ver
`docs/implementation/001-project-foundation.md` para os detalhes.

## CI

`.github/workflows/ci.yml` roda a cada push e pull request: instala as
dependências, valida e gera o Prisma client, aplica as migrations contra um
container de serviço PostgreSQL, depois roda lint, build e testes.

## Documentação

- [`docs/specification.md`](docs/specification.md) — o que está sendo construído e por quê
- [`docs/architecture.md`](docs/architecture.md) — como está organizado
- [`docs/decisions/`](docs/decisions/) — ADRs de decisões individuais
- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — contexto do projeto usado pelo Claude durante a implementação
- [`docs/ai/AI_WORKFLOW.md`](docs/ai/AI_WORKFLOW.md) — como o Claude trabalha neste repositório e como o responsável pelo projeto revisa as mudanças
