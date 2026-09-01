# Relatório de Implementação — Fase 2.5: fechamento formal da Fase 2

## 1. Objetivo

Provar que tudo que a Fase 2 entregou (2.1 listagem, 2.2 PDF, 2.3 API key,
2.4 OpenAPI) continua reproduzível, coerente e rastreável em `main`, e
fechar as duas pendências documentais que ficaram abertas na auditoria de
pontuação anterior (`PROMPT_HISTORY.md` parado em "Fase 1"; `ADR-007` sem
deixar explícito que formaliza uma decisão anterior). Escopo definido em
`docs/ai/prompts/claude/12-claude-phase2-closure-prompt.md`. Nenhuma
feature nova foi implementada.

## 2. Estado inicial

- branch: `main`
- HEAD: `5bfca61841965ccc804477c2de5c9a8cf93dbdb6`
- CI de `main`: run `33489686915` — `SUCCESS`
- Confirmado antes de qualquer alteração: HEAD correto, working tree
  limpa, `main` local == `origin/main`.

## 3. Fresh clone

Clone real via `git clone` (não cópia de arquivos locais) numa pasta
temporária fora da working tree principal, a partir de `origin/main`.

- caminho temporário: `.../scratchpad/fresh-clone-phase2-closure`
- HEAD do clone: `5bfca61841965ccc804477c2de5c9a8cf93dbdb6` (idêntico ao
  esperado)
- working tree: limpa
- `npm ci`: PASS
- Prisma validate: PASS
- Prisma generate: PASS
- PostgreSQL: container isolado próprio (`fresh-clone-phase2-closure-postgres-1`,
  porta `5432`, sem relação com o container do projeto principal na
  porta `5433`), banco vazio
- migrations: as 2 migrations existentes aplicadas do zero
  (`20260831183416_init`, `20260831214321_add_processing_job_claim_token`);
  confirmado "No pending migrations to apply" depois
- build: PASS
- lint: PASS
- unit: **PASS — 15/15**
- E2E: **PASS — 77/77**

Os números batem exatamente com o estado informado no início da tarefa —
nenhuma mudança precisou de explicação.

## 4. Smoke real (processo novo, banco do fresh clone)

Confirmei porta `3000` livre antes de subir e subi a aplicação com
`node dist/main.js` num processo em segundo plano (worker de
processamento habilitado, para o smoke poder observar o processamento
até o estado final). `.env` criado a partir de `.env.example` sem
nenhuma edição de `API_KEY` — usei o próprio valor fictício `change-me`
que o arquivo já traz, confirmando que copiar o `.env.example` como o
README instrui já é suficiente.

- **API key:** `GET /documents` sem `X-API-Key` → `401`; com a chave
  fictícia do `.env.example` → `200`. (valor da chave não registrado
  neste relatório)
- **Imagem:** `POST /documents` com PNG fictício mínimo → `202`,
  `deduplicated: false`; consultado depois até `COMPLETED`, com
  resultado fictício e sem nenhum campo interno na resposta.
- **PDF:** `POST /documents` com PDF fictício mínimo (assinatura
  `%PDF-`) → `202`, `deduplicated: false`.
- **Deduplicação:** o mesmo PDF enviado de novo → `202`, mesmo
  `documentId`, `deduplicated: true`.
- **Processing:** os dois documentos do smoke chegaram a `COMPLETED`
  sozinhos, via o worker em segundo plano, sem intervenção manual no
  claim.
- **Detail:** `GET /documents/:id` confirmado para os dois documentos —
  `status`, `result` presente quando aplicável, sem `storageKey`,
  `sha256`, `claimToken` ou IDs de job/run na resposta.
- **List:** `GET /documents` (default) e `GET /documents?status=COMPLETED`
  confirmados — paginação default (`pageSize: 20`) e filtro por status
  funcionando, os dois documentos do smoke aparecendo corretamente.
- **Swagger UI:** `GET /docs` → `200`.
- **OpenAPI JSON:** `GET /docs-json` → `200`; conferido no JSON real:
  `paths` com `POST/GET /documents` e `GET /documents/{id}`; `security`
  presente nas três operações; `securitySchemes.api-key` com
  `type: apiKey`/`in: header`/`name: X-API-Key`; propriedade `file` do
  multipart como `string`/`binary`; `page`/`pageSize`/`status`
  documentados; `id` como `path`/`uuid`; busca por `change-me`,
  `storageKey`, `sha256`, `claimToken`, `ProcessingJob`, `ProcessingRun`
  no JSON bruto — nenhuma ocorrência.

Depois do smoke: processo encerrado explicitamente (`taskkill`, PID
confirmado), porta `3000` confirmada livre (`netstat` sem `LISTENING`),
container e volume do Postgres isolado do fresh clone removidos
(`docker compose down -v`). Nenhum arquivo do smoke (`.env`, fixtures
`.png`/`.pdf`, JSON baixado) pertence ao repositório principal — tudo
ficou dentro da pasta temporária do fresh clone, que não foi commitada.

## 5. Documentação

### README

Lido do início ao fim como quem clona o projeto pela primeira vez,
comparando instrução por instrução com o fresh clone: `cp .env.example`,
`docker compose up -d`, `npm ci`, `prisma generate`, `prisma migrate
deploy`, `npm run start:dev`, upload de imagem, consulta, listagem, PDF,
API key, Swagger. **Nenhuma divergência factual encontrada** — todos os
comandos e exemplos de resposta do README bateram exatamente com o
comportamento observado no smoke. Nenhuma correção foi necessária.

### `PROMPT_HISTORY.md`

Atualizado para deixar de ser um índice só da Fase 1:

- título mudou de "Histórico de prompts — Fase 1" para "Histórico de
  prompts — Fases 1 e 2";
- adicionadas as linhas `08` (listagem), `09` (PDF), `10` (API key),
  `11` (OpenAPI) e `12` (este fechamento), preservando o mesmo formato
  das linhas anteriores — arquivo real, status `USADO`, finalidade,
  observação com o resultado da review e achados relevantes (`LIST-001`
  em 08, `AUTH-001` descartado em 10);
- **achado durante a checagem, corrigido:** a linha `04A` apontava para
  `04A-claude-document-processing-scope-clarification-pormpt.md`, nome
  que não existe mais — o arquivo foi renomeado (só o nome, sem mudar
  conteúdo) durante a consolidação documental da Fase 2.2, mas o índice
  nunca foi atualizado, deixando um link quebrado. Corrigido para o nome
  real atual, com uma nota explicando a origem da divergência.

### `ADR-007-fencing-claimtoken.md`

Adicionada uma frase curta logo após `## Status`, deixando explícito que
o `claimToken` já havia sido implementado na foundation (correção do
finding `F-001`) e que esta ADR foi versionada mais tarde, durante a
consolidação da Fase 2.2, para formalizar por escrito uma decisão já em
produção. Decisão, alternativas e consequências não foram alteradas.

### `specification.md` / `architecture.md` / demais ADRs

Verifiquei se continuam refletindo o estado real depois de listagem,
PDF, API key e OpenAPI. `docs/architecture.md §29` ("Atualizações
confirmadas depois da implementação") já registrava, desde a
consolidação da Fase 2.2, que "a API key simples e OpenAPI continuam
sendo incrementos de superfície de API, não mudanças na arquitetura
central" — uma afirmação escrita antes de as duas features existirem de
fato. Agora que as duas foram implementadas e verificadas neste
fechamento, confirmo que essa previsão se sustentou: nenhuma das duas
alterou fila, worker, persistência ou state machine. `specification.md
§23` continua listando exatamente as cinco entregas da Fase 2 (PDF,
listagem, paginação, filtro, API key, Swagger) sem nenhuma divergência.
Os demais ADRs (001–006) não tiveram nenhuma decisão contrariada pelas
fatias 2.1–2.4. **Nenhuma divergência material confirmada** — nenhuma
reescrita retroativa foi feita.

## 6. Segurança / invariantes

Confirmados como continuando verdadeiros — via a suíte automatizada
existente (77/77, sem necessidade de teste novo) e via o smoke real
desta tarefa:

- limite de 10 MB aplicado no parser multipart antes de bufferizar
  (`FileInterceptor`);
- validação por magic bytes (nunca extensão/`Content-Type` do cliente);
- SHA-256 sobre bytes crus para deduplicação;
- corrida de duplicata protegida por constraint única;
- `Document`+`ProcessingJob` atômicos na mesma transação;
- provider chamado fora da transação de claim (P4);
- lease + `claimToken` como fencing (ADR-007);
- retry até 3 tentativas, `ProcessingRun` como histórico imutável;
- PII fora de logs (confirmado por busca em `src/`, sem ocorrência);
- API key fora do banco — nunca persistida em nenhuma tabela;
- documento OpenAPI sem segredos, `storageKey`, `sha256`, `claimToken`
  ou nomes de entidade interna operacional (confirmado no smoke real).

## 7. `npm audit`

| Check | Resultado |
|---|---|
| `npm audit` | FAIL — 3 `high` conhecidos (`deepmerge-ts`, tooling do Prisma) |
| `npm audit --omit=dev` | FAIL — mesmos 3 |
| Finding novo? | Não |

Nenhum `npm audit fix --force` foi executado.

## 8. Divergências

Uma divergência documental foi encontrada e corrigida nesta mesma tarefa
(link quebrado do `04A` em `PROMPT_HISTORY.md` — seção 5). Fora essa,
**nenhuma outra divergência material confirmada**.

Um ponto foi identificado mas **não corrigido**, por estar fora do
escopo explícito desta tarefa (que listava só os prompts `08`–`12` para
indexação): três arquivos já versionados em
`docs/ai/prompts/claude/` — `04-claude-document-ingestion-review-prompt.md`,
`05-claude-document-ingestion-findings-fix-prompt.md` e
`06-claude-document-ingestion-findings-verification-prompt.md` —
cobrindo o ciclo de revisão/correção da ingestão (achados
`ING-001`/`ING-002`) continuam sem entrada própria em
`PROMPT_HISTORY.md`. Registrei essa pendência dentro do próprio
`PROMPT_HISTORY.md` (nova seção "Outros prompts versionados") para não
escondê-la, mas não ampliei o escopo desta tarefa para resolvê-la —
decisão fica para quem revisar este fechamento.

## 9. Fora de escopo

Conforme o prompt: `AuthModule`, teste de borda de 10 MB exato, qualquer
parte da Fase 3 (`Idempotency-Key`, provider real, fila de revisão
humana, claim de reviewer, correção humana, nome padronizado, segundo
tipo documental, reprocessamento). Nenhum ADR novo foi criado. Nenhuma
refatoração por estética foi feita. Nenhuma alteração em
`src/`/`prisma/schema.prisma`/migrations/`package.json`/`.github/`/testes.

## 10. Assistência do Claude nesta implementação

Toda a validação desta tarefa — fresh clone real via `git clone`, subida
e queda do PostgreSQL isolado, smoke real da aplicação em processo novo
(API key, imagem, PDF, deduplicação, processamento, consulta, listagem,
Swagger UI, OpenAPI JSON), leitura comparativa do README, a correção do
link quebrado em `PROMPT_HISTORY.md`, a extensão da tabela com os
prompts 08–12, a frase adicionada ao `ADR-007`, e este relatório — foi
executada por mim (Claude) nesta tarefa, a partir do prompt em
`docs/ai/prompts/claude/12-claude-phase2-closure-prompt.md`. Não fiz
revisão humana desta implementação — essa revisão ainda não aconteceu e
não é responsabilidade minha realizá-la. O resultado desta tarefa é uma
recomendação técnica (apto/não apto para review humana final), não uma
aprovação de fechamento da Fase 2.
