# 06 — Implementar consulta do resultado do documento

## 1. Ação

Implemente a consulta individual do documento para fechar a vertical slice mínima do backend.

Crie:

```http
GET /documents/:id
```

A consulta deve retornar o status atual do documento e, quando existir, o resultado persistido.

O objetivo é completar o fluxo:

```text
receber
→ processar
→ persistir
→ consultar
```

Não implemente listagem nem revisão humana nesta tarefa.

## 2. Contexto

A etapa de processamento já deve estar mergeada em `main` e com CI verde.

Antes de começar:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
git rev-parse HEAD
git log --oneline -15
```

Confirme que:

- processing está presente em `main`;
- `PROC-001`, `PROC-002` e `PROC-003` estão corrigidos;
- reviews finais estão versionadas;
- CI de `main` está verde;
- working tree está limpa.

Depois crie:

```bash
git checkout -b feat/document-query
```

Antes de alterar código, leia:

- `CLAUDE.md`;
- `AGENTS.md`;
- `PROJECT_CONTEXT.md`;
- specification;
- architecture;
- ADRs;
- relatórios 003, 004 e 005;
- reviews do processing;
- schema Prisma;
- controllers/services atuais;
- testes existentes.

Se houver conflito entre este prompt e os documentos humanos, pare e me mostre antes de implementar.

## 3. Papel

Atue como implementador do backend.

Mantenha a solução pequena, previsível e compatível com o padrão atual do projeto.

A revisão final e a decisão de merge serão feitas por mim.

## 4. Dados de entrada e referências

Implemente:

```http
GET /documents/:id
```

A operação é somente leitura.

Não deve:

- disparar processamento;
- alterar status;
- fazer retry;
- fazer claim;
- alterar lease.

A consulta deve funcionar para:

- `RECEIVED`;
- `PROCESSING`;
- `RETRYING`;
- `COMPLETED`;
- `NEEDS_REVIEW`;
- `FAILED`.

Para documento existente, retorne `200`.

Para documento inexistente, retorne `404`.

Quando ainda não existir resultado:

```json
{
 "documentId": "...",
 "status": "PROCESSING",
 "createdAt": "...",
 "updatedAt": "...",
 "result": null
}
```

Quando o documento estiver concluído, retorne o resultado persistido, respeitando o schema existente.

Quando estiver em `NEEDS_REVIEW`, preserve e retorne o resultado original da IA, se ele existir.

Quando estiver em `FAILED` e não houver resultado útil:

```json
{
 "documentId": "...",
 "status": "FAILED",
 "createdAt": "...",
 "updatedAt": "...",
 "result": null
}
```

Não exponha:

- `storageKey`;
- caminho local;
- `claimToken`;
- `claimedBy`;
- `claimedAt`;
- `leaseExpiresAt`;
- estrutura interna de `ProcessingJob`;
- erro bruto do provider;
- stack trace;
- secrets;
- bytes do documento;
- prompt completo.

Não exponha automaticamente a lista de `ProcessingRun`. Essa informação continua sendo interna/proveniência, salvo se a specification exigir explicitamente.

Não implemente nome padronizado nesta etapa se os documentos humanos ainda deixarem isso para uma fase futura.

Use somente dados fictícios nos testes.

Quero testes para:

- Q1 — documento inexistente → `404`;
- Q2 — `RECEIVED` → `200`, `result = null`;
- Q3 — `PROCESSING` → `200`, `result = null`;
- Q4 — `RETRYING` → `200`, `result = null`;
- Q5 — `COMPLETED` → `200`, resultado presente;
- Q6 — `NEEDS_REVIEW` → `200`, resultado original presente quando aplicável;
- Q7 — `FAILED` → `200`, sem erro interno;
- Q8 — resposta não expõe campos de infraestrutura;
- Q9 — vertical slice completa:

```text
POST /documents
→ ProcessingJob
→ worker/fake provider
→ COMPLETED + DocumentResult
→ GET /documents/:id
→ 200 + resultado persistido
```

Q9 deve usar a aplicação real e PostgreSQL real, seguindo o padrão E2E atual.

## 5. Formato de saída

Depois da implementação, crie:

`docs/implementation/006-document-query.md`

Explique:

- endpoint criado;
- contrato;
- status HTTP;
- estados suportados;
- regra de `result = null`;
- comportamento de `COMPLETED`;
- comportamento de `NEEDS_REVIEW`;
- comportamento de `FAILED`;
- campos internos omitidos;
- segurança/PII;
- testes Q1–Q9;
- vertical slice completa;
- validações;
- CI;
- audit;
- limitações;
- o que ficou fora;
- assistência do Claude.

Execute:

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
npm run test:e2e
docker compose config
npm audit
npm audit --omit=dev
```

Antes do commit:

```bash
git status --short
git diff --stat
git diff
```

Faça commits claros e push para:

`origin/feat/document-query`

Acompanhe a CI.

No final informe:

- branch;
- HEAD;
- endpoint;
- estados suportados;
- contrato;
- testes Q1–Q9;
- regressões;
- validações;
- CI;
- arquivos alterados;
- relatório criado;
- se houve mudança de schema/migration.

Depois pare para minha revisão.

## 6. Restrições e limites

Não implemente:

- `GET /documents` com listagem;
- filtros;
- paginação;
- download/preview;
- endpoint de conteúdo;
- fila de revisão humana;
- claim de reviewer;
- correção humana;
- optimistic locking de reviewer;
- autenticação;
- PDF;
- provider real;
- frontend;
- nome padronizado;
- deploy.

Não altere migrations existentes.

A expectativa é não precisar de migration nova.

Se o schema atual não suportar a consulta corretamente, pare e explique antes de criar qualquer migration.

Não use `npm audit fix --force`.

Não faça merge.

Não altere prompts históricos ou reviews anteriores.

Ao terminar, aguarde minha revisão humana.
