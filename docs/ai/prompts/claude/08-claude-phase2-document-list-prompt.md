# 08 — Fase 2.1: listar documentos

## 1. Ação

Comece a Fase 2 implementando somente:

```http
GET /documents
```

com:

- paginação;
- filtro opcional por status;
- ordenação estável;
- resposta resumida.

Não implemente ainda PDF, API key ou Swagger.

## 2. Contexto

A Fase 1 está encerrada e verde em `main`.

HEAD esperado:

`8957cff50f2a4d6963e81ee6fb38546cbfcc495e`

Antes de começar:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --short
```

Confirme que a working tree está limpa e crie:

```bash
git checkout -b feat/document-list
```

Leia specification, architecture, ADRs, PROJECT_CONTEXT, relatório 007, módulo atual de documents, schema e testes.

A Fase 2 prevista pelos documentos inclui PDF, listagem/paginação/filtro, API key, OpenAPI, hardening e testes adicionais. Esta tarefa cobre somente a listagem.

## 3. Papel

Atue como implementador da superfície de API da Fase 2.

Mantenha a Fase 1 intacta.

A revisão e o merge serão feitos por mim depois.

## 4. Dados de entrada e referências

Implemente:

```http
GET /documents?page=1&pageSize=20&status=COMPLETED
```

Defaults:

```text
page = 1
pageSize = 20
```

Limites:

```text
page >= 1
1 <= pageSize <= 100
```

Status aceitos:

```text
RECEIVED
PROCESSING
RETRYING
COMPLETED
NEEDS_REVIEW
FAILED
```

Resposta esperada:

```json
{
 "items": [
 {
 "documentId": "uuid",
 "status": "COMPLETED",
 "documentType": "IDENTITY_DOCUMENT",
 "createdAt": "ISO-8601",
 "updatedAt": "ISO-8601"
 }
 ],
 "pagination": {
 "page": 1,
 "pageSize": 20,
 "total": 1,
 "totalPages": 1
 }
}
```

Ordene por:

```text
createdAt DESC
id DESC
```

Não retorne dados extraídos ou campos internos.

A listagem deve ser somente leitura.

Quero testes para lista vazia, defaults, duas páginas, ordenação, filtro por status, parâmetros inválidos, página além do fim, ausência de PII/infraestrutura e regressão da Fase 1.

## 5. Formato de saída

Crie:

`docs/implementation/008-phase2-document-list.md`

Explique contrato, paginação, filtro, ordenação, privacidade, testes, validações e riscos.

Rode:

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

Faça push para:

`origin/feat/document-list`

Acompanhe a CI e informe HEAD, run id e resultados.

Depois pare para minha revisão.

## 6. Restrições e limites

Não:

- implemente PDF;
- implemente API key;
- implemente Swagger/OpenAPI;
- implemente Idempotency-Key;
- altere schema/migrations;
- altere processing;
- altere state machine;
- exponha PII;
- exponha storage/claim/lease/job/run;
- faça merge.

Se acreditar que precisa alterar contrato compartilhado ou schema, pare e me mostre antes.
