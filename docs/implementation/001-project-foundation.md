# Relatório de Implementação — Project Foundation

## 1. Escopo

### Implementado
- Projeto NestJS inicializado na raiz do repositório (TypeScript, ESM, sem pasta aninhada).
- Node 24.x padronizado: `.nvmrc`, `engines.node` em `package.json`, mesmo major na CI.
- Prisma ORM 7 configurado para PostgreSQL, com o driver adapter `@prisma/adapter-pg` (exigido nesta versão).
- Schema inicial completo com os 4 modelos aprovados (`Document`, `ProcessingJob`, `ProcessingRun`, `DocumentResult`) e os enums `DocumentStatus`/`ProcessingRunStatus`.
- Primeira migration (`20260831183416_init`) criada e aplicada contra um PostgreSQL local limpo.
- `docker-compose.yml` para PostgreSQL (porta configurável via `.env`, healthcheck, volume persistente, sem exposição além do necessário para dev local).
- `.env.example` com valores fictícios seguros.
- `PrismaService`/`DatabaseModule` (global) integrando Prisma ao NestJS.
- `README.md` inicial, executável e honesto — todo comando nele foi executado e verificado antes de ser documentado.
- CI mínima (`.github/workflows/ci.yml`): checkout, Node via `.nvmrc`, `npm ci`, validate/generate do Prisma, PostgreSQL de serviço, migrations, lint, build, testes. Roda em `push` e `pull_request`.

### Deliberadamente não implementado
- Tudo listado na seção 3 do prompt (`POST /documents`, upload, SHA-256 na aplicação, deduplicação, `DocumentStorage`, worker, claim SQL, state machine em código, retry em código, fake provider, validação de campos, PDF, listagem, API key, Swagger de negócio, review queue, provider real, reprocessamento, frontend).

## 2. Por que isso existe

Esta tarefa prepara a base técnica (aplicação reproduzível, schema compartilhado, CI) para que as próximas tarefas — ingestão/API (Claude) e processamento/worker (Codex) — possam ser implementadas sobre uma fundação já validada, sem que cada uma precise reinventar a configuração de NestJS/Prisma/Docker.

## 3. Fluxo de execução

`git switch feat/project-foundation` → `npm install` → `prisma generate` → `prisma migrate dev` (local) → `nest build` → `node dist/main.js` → `PrismaService.onModuleInit` conecta ao Postgres via `@prisma/adapter-pg` → aplicação escuta em `PORT`.

## 4. Arquivos

| Arquivo | Criado/Modificado | Finalidade |
|---|---|---|
| `package.json` | Criado (a partir do scaffold do `@nestjs/cli`, editado) | Nome/descrição do projeto, `engines.node`, scripts de Prisma, remoção de `@nestjs/mau` (deploy fora de escopo) |
| `.nvmrc` | Criado | Fixar Node `24.16.0` |
| `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json` | Criados (scaffold) | Configuração padrão do NestJS/TypeScript |
| `oxlint.json`, `.prettierrc` | Criados (scaffold) | Lint e formatação |
| `vitest.config.ts`, `vitest.config.e2e.ts` | Criados (scaffold) | Testes unitários e e2e |
| `src/app.module.ts`, `app.controller.ts`, `app.service.ts`, `main.ts` | Criados (scaffold, `app.module.ts`/`main.ts` editados) | Bootstrap padrão do Nest; `main.ts` carrega `dotenv/config`; `app.module.ts` importa `DatabaseModule` |
| `src/database/prisma.service.ts` | Criado | `PrismaClient` com driver adapter `@prisma/adapter-pg`, lifecycle `onModuleInit`/`onModuleDestroy` |
| `src/database/database.module.ts` | Criado | Módulo global expondo `PrismaService` |
| `prisma/schema.prisma` | Criado | Os 4 modelos + 2 enums (ver seção 6) |
| `prisma/migrations/20260831183416_init/` | Criado | Migration inicial, aplicada e verificada |
| `prisma7.config.ts` | Criado (scaffold do `prisma init`) | Configuração do Prisma CLI (schema path, migrations path, `DATABASE_URL`) |
| `docker-compose.yml` | Criado | PostgreSQL local |
| `.env.example` | Criado | Contrato de variáveis de ambiente |
| `.github/workflows/ci.yml` | Criado | CI mínima |
| `README.md` | Criado | Documentação executável |
| `.gitignore` | Modificado | Adiciona `/src/generated/prisma` e `*.tsbuildinfo` |

## 5. Dependências adicionadas

| Dependência/import | Categoria | Motivo |
|---|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` | runtime | Framework NestJS |
| `@prisma/client` | runtime | Client gerado do Prisma |
| `@prisma/adapter-pg`, `pg` | runtime | Driver adapter exigido pelo Prisma 7 para PostgreSQL |
| `dotenv` | runtime | Carregar `.env` no boot da aplicação (`main.ts`) |
| `reflect-metadata`, `rxjs` | runtime | Dependências padrão do NestJS |
| `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing` | dev | Build/scaffold/testing do Nest |
| `prisma` | dev | CLI do Prisma |
| `typescript`, `vitest`, `@vitest/coverage-v8`, `oxlint`, `prettier` | dev | Compilação, testes, lint, formatação (defaults do scaffold atual do NestJS) |
| `@types/node`, `@types/express`, `@types/supertest`, `@types/pg` | dev | Tipos |

**Removida do scaffold padrão:** `@nestjs/mau` (ferramenta de deploy do Nest) — não usada, `deploy` está fora de escopo desta tarefa e das fases aprovadas.

## 6. Schema Prisma

**Modelos:**
- `Document` — `id`, `sha256` (único), `storageKey` (único), `documentType` (string livre — só `IDENTITY_DOCUMENT` aprovado hoje, mas um segundo tipo é previsto na Fase 3), `status` (`DocumentStatus`), `originalFilename`/`mimeType`/`sizeBytes`, timestamps. Índice em `status`.
- `ProcessingJob` — 1:1 com `Document` (`documentId` único: retries reaproveitam a mesma linha, só `ProcessingRun` cresce por tentativa). `attemptCount` é a fonte de verdade operacional (ADR-002/architecture.md §5). Campos de claim/lease: `claimedBy`, `claimedAt`, `leaseExpiresAt`. Índice em `leaseExpiresAt` (usado pela query de claim).
- `ProcessingRun` — 1:N com `Document`. Histórico imutável (ADR-005): `attemptNumber`, `status` (`ProcessingRunStatus`), proveniência (`provider`/`model`/`modelVersion`/`promptId`/`promptVersion`/`promptHash`/`outputSchemaVersion`), `technicalErrorType` (string livre, só categoria técnica — nunca conteúdo/PII), `startedAt`/`finishedAt`.
- `DocumentResult` — ligado a `Document` e (1:1) ao `ProcessingRun` que o produziu. `documentType`, `schemaVersion`, `data` (`Json`, flexível — validação forte fica na aplicação, ainda não implementada).

**Enums:**
- `DocumentStatus` — os 6 estados aprovados, exatamente como em `specification.md`/`architecture.md`.
- `ProcessingRunStatus` (`STARTED`, `SUCCEEDED`, `TECHNICAL_FAILURE`, `SEMANTIC_MISMATCH`) — decisão nova de scaffolding, ver seção 13.

**Constraints/índices:** `Document.sha256` único, `Document.storageKey` único, `ProcessingJob.documentId` único, `DocumentResult.processingRunId` único; índices em `Document.status`, `ProcessingJob.leaseExpiresAt`, `ProcessingRun.documentId`, `DocumentResult.documentId`.

**Relações principais:** `Document 1—1 ProcessingJob`, `Document 1—N ProcessingRun`, `Document 1—N DocumentResult`, `ProcessingRun 1—0..1 DocumentResult`.

### Por que `attemptCount` fica no `ProcessingJob`

Porque ele precisa ser incrementado atomicamente no mesmo claim que marca o worker como dono do job (`FOR UPDATE SKIP LOCKED`), sem depender de contar linhas de outra tabela — exatamente a decisão registrada em `architecture.md` §5/§13 e `ADR-002` para evitar duas fontes de verdade divergentes sobre o número de tentativas.

### Relação entre `attemptCount` e `ProcessingRun.attemptNumber`

`ProcessingJob.attemptCount` decide operacionalmente se ainda cabe uma tentativa (comparado ao limite de 3). Quando uma tentativa realmente começa, o worker cria um `ProcessingRun` com `attemptNumber` igual ao valor atual do contador — isso é só para explicar o histórico depois; a lógica de limite nunca deve contar `ProcessingRun`s.

### Campos de lease/claim escolhidos

`claimedBy` (quem), `claimedAt` (quando pegou) e `leaseExpiresAt` (até quando o claim vale) são exatamente os três dados que a query de claim (`WHERE claimedBy IS NULL OR leaseExpiresAt < now()`) e a lógica de recuperação de worker (architecture.md §11) precisam.

### Como o schema permite fencing/validação de ownership posteriormente

`claimedBy` funciona como token de propriedade: antes de gravar um resultado final, a aplicação (ainda não implementada) pode comparar o `claimedBy` que ela tem em mão com o valor atual da linha — se não bater (outro worker já reclamou o job por lease expirado), a escrita é rejeitada. O schema já guarda o dado necessário; a verificação em si é lógica de aplicação, fora do escopo desta tarefa.

### Como `DocumentResult` será flexível sem abandonar validação na aplicação

O campo `data` é `Json` — aceita qualquer estrutura no banco. A validação forte (campos obrigatórios, tipos, formatos — Check 1/Check 2 de `specification.md` §16) é responsabilidade da aplicação antes de decidir que um resultado é válido; o schema não impõe essa validação porque tipos de documento diferentes (Fase 3) terão estruturas diferentes.

## 7. Migration

Nome: `20260831183416_init`
Aplicada localmente?: Sim, contra PostgreSQL limpo (`docker compose up`, porta 5433 nesta máquina)
Resultado: Sucesso — `prisma migrate dev --name init` aplicou sem erro; `prisma migrate deploy` (o comando usado pela CI) confirmado como idempotente logo depois (`No pending migrations to apply`).

## 8. Docker/PostgreSQL

Compose válido?: Sim
Container saudável?: Sim (`healthy` confirmado via `docker compose ps`)
Conexão Prisma funcionando?: Sim — aplicação real (`node dist/main.js`) conectou e logou `Connected to PostgreSQL via Prisma`; `GET /` retornou HTTP 200.

**Nota:** a porta padrão `5432` já estava em uso por outro processo nesta máquina (não relacionado a este projeto). Usei `5433` localmente via `.env`; `.env.example` mantém `5432` como default (mais comum para quem clonar em outra máquina) com um comentário explicando a troca caso necessário. A CI usa `5432` dentro do runner isolado do GitHub Actions, sem esse conflito.

## 9. Scripts

`start`, `start:dev`, `start:debug`, `start:prod`, `build`, `format`, `lint`, `test`, `test:watch`, `test:cov`, `test:debug`, `test:e2e`, `prisma:validate`, `prisma:generate`, `prisma:migrate:dev`, `prisma:migrate:deploy`.

## 10. CI

Workflow: `CI` (`.github/workflows/ci.yml`)
Run: `33426215959` (branch `feat/project-foundation`)
Primeiro resultado: SUCCESS — todos os 11 passos do job `build-and-test` passaram na primeira execução, sem falha real, em 56s.
Resultado final: SUCCESS. Nenhuma correção foi necessária.

Única anotação (informativa, não bloqueante): GitHub avisa que `actions/checkout@v4`/`actions/setup-node@v4` têm runtime interno em Node 20, forçado para Node 24 pelo runner — isso é sobre o runtime interno da action em si, não sobre a configuração de Node do projeto (`.nvmrc`/`engines`), e não exige nenhuma mudança nossa.

Nenhuma falha real ocorreu — não houve etapa de correção nesta tarefa.

## 11. Validação

| Check | Comando/ação | Resultado |
|---|---|---|
| Install | `npm install` | PASS |
| Prisma validate | `npm run prisma:validate` | PASS |
| Prisma generate | `npm run prisma:generate` | PASS |
| Migration | `npm run prisma:migrate:dev` (local) + `npm run prisma:migrate:deploy` | PASS |
| Docker | `docker compose up -d` + `docker compose ps` (healthy) | PASS |
| Build | `npm run build` | PASS |
| Lint | `npm run lint` | PASS (sem achados) |
| Tests | `npm test`, `npm run test:e2e` | PASS (1/1 e 1/1) |
| Smoke manual | `node dist/main.js` + `curl http://localhost:3000/` | PASS (200, log de conexão Prisma real) |
| GitHub CI | `gh run watch` | Ver seção 10/17 |

Nenhum PASS foi marcado sem execução real.

## 12. O que o responsável deve saber explicar em entrevista

- **Por que Prisma 7 precisa de um driver adapter**: essa major mudou a arquitetura do client — sem `@prisma/adapter-pg` + `pg`, `new PrismaClient()` simplesmente não conecta. Isso não é opcional nem uma escolha de design nossa, é um requisito da versão.
- **Por que `ProcessingJob` é 1:1 com `Document`** (não 1:N): retries não criam jobs novos, reaproveitam a mesma linha — só o histórico (`ProcessingRun`) cresce por tentativa. Isso evita duas filas concorrentes para o mesmo documento.
- **Por que `attemptCount` vive no job e não é derivado contando `ProcessingRun`**: são conceitos diferentes por design — um é controle operacional (rápido, atômico, decide "ainda posso tentar?"), o outro é auditoria histórica (explica "o que aconteceu"). Misturá-los criaria uma fonte de verdade frágil.
- **Por que `documentType` é string e não enum**: o enum `DocumentStatus` é a state machine formalmente aprovada e travada por ADR; `documentType` ainda vai ganhar um segundo valor na Fase 3, e um enum Postgres exigiria migration só para isso — optei por não travar um contrato que já está planejado para mudar.
- **Alternativas consideradas para o driver adapter**: nenhuma real — é exigência da versão do Prisma, não escolha de arquitetura.
- **Trade-offs**: schema já reflete decisões de concorrência (SKIP LOCKED, lease, fencing) que ainda não têm código nenhum por trás — é intencional, a fundação prepara o terreno sem implementar a lógica.
- **O que quebraria em maior escala**: nada específico desta tarefa — a fundação não faz suposição de volume; isso é discutido em `architecture.md` §24.

## 13. Proveniência de IA

### Gerado pelo agente
Toda a foundation (scaffold NestJS, schema Prisma, migration, Docker Compose, README, CI, `PrismaService`/`DatabaseModule`) foi gerada por mim nesta tarefa, a partir do prompt em `docs/ai/prompts/claude/01-claude-project-foundation-prompt.md`.

### Modificações humanas posteriores
Nenhuma até o momento deste relatório.

### Revisão cruzada
- Revisor: pendente (Codex, conforme `PROJECT_CONTEXT.md` §18)
- Findings: N/A ainda
- Correções: N/A ainda

## 14. Divergências da especificação

Nenhuma. O schema foi verificado seção por seção contra `specification.md`, `architecture.md` e os 6 ADRs antes de ser escrito (ver seção 6).

## 15. Segurança/PII

- Nenhum dado pessoal ou documental foi logado — os únicos logs desta tarefa são de lifecycle do Nest/Prisma (conexão, rotas).
- Secrets: `.env` não foi commitado (confirmado via `git status --short` antes do commit); `.env.example` só tem valores fictícios.
- Entradas externas: nenhuma ainda — esta tarefa não recebe nenhuma entrada de usuário/rede além de uma requisição `GET /` de smoke test local.
- Riscos restantes: nenhum introduzido por esta tarefa; os riscos de segurança relevantes (upload, PII em processamento) só existem a partir da vertical slice.

## 16. Riscos conhecidos / pendências

- **`prisma init` instalou 9 skills próprias do Prisma + diretórios `.windsurf/`/`.agents/`/`skills-lock.json` sem pedido.** Removi tudo antes do commit (não fazem parte do escopo, e o projeto já tem uma disciplina deliberada de só manter skills justificadas e rastreadas). Se uma tarefa futura rodar `prisma init` de novo (não deveria ser necessário), o mesmo comportamento vai se repetir.
- **`prisma` CLI instalou por padrão como `8.0.0-rc.12` (release candidate)**, divergindo de `@prisma/client` (`7.10.0` estável). Corrigi fixando as duas em `7.10.0` exato. Deixo registrado porque um `npm install prisma` futuro sem `@7.10.0` explícito vai puxar a RC de novo.
- **Vulnerabilidade `high` em `deepmerge-ts`** (via `@prisma/config`, dependência transitiva do CLI `prisma`) — é dependência de desenvolvimento (não roda em produção, não processa input de usuário), risco real baixo para este projeto. Não rodei `npm audit fix --force` para não arriscar quebrar a versão pinada do Prisma sem necessidade.
- **Porta 5432 já ocupada nesta máquina** por outro processo — usei 5433 localmente; não afeta CI nem outras máquinas, mas documentei a troca no README/`.env.example`.
- Docker Desktop não estava rodando no início da tarefa (achado já conhecido do inventário do ambiente) — precisei iniciá-lo manualmente para validar localmente. Não é um problema do projeto, é do ambiente local.

## 17. Git

Ver seção "17. Git" do relatório de resposta (fora deste arquivo), com `git status --short`, `git log --oneline -5` e `git branch -vv` capturados após o commit e o push.

## 18. Próximo passo recomendado

`revisar a foundation e, depois de aprovada, iniciar Claude em ingestion/API e Codex em processing em branches separadas`

Não executei esse próximo passo.
