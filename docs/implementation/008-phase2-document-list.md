# Relatório de Implementação — Fase 2.1: listagem de documentos

## 1. Objetivo da slice

Implementar `GET /documents` com paginação e filtro opcional por status,
primeira fatia da Fase 2 (`docs/specification.md` §23). Escopo definido em
`docs/ai/prompts/claude/08-claude-document-list-prompt.md`. Nenhuma
funcionalidade além de listagem/paginação/filtro entrou nesta tarefa.

## 2. Contrato de `GET /documents`

Query params, todos opcionais:

| Param | Default | Regra |
|---|---|---|
| `page` | `1` | inteiro `>= 1` |
| `pageSize` | `20` | inteiro entre `1` e `100` |
| `status` | sem filtro | um dos 6 estados públicos (`RECEIVED`, `PROCESSING`, `RETRYING`, `COMPLETED`, `NEEDS_REVIEW`, `FAILED`) |

Qualquer valor fora dessas regras (`0`, negativo, decimal, texto, status
desconhecido) retorna `400 Bad Request` — nunca cai silenciosamente num
default. A validação é feita por `parseDocumentListQuery`
(`src/documents/dto/document-list-query.dto.ts`), parsing manual e
explícito, seguindo o mesmo padrão já usado no resto do projeto (ex.:
`ParseUUIDPipe` nativo do Nest para `:id`, `parsePositiveIntervalMs` em
`processing.constants.ts`) — o projeto não usa `class-validator`/
`ValidationPipe` em nenhum lugar, então não introduzi essa dependência
nova só para esta rota.

## 3. Formato da resposta

```json
{
  "items": [
    {
      "documentId": "uuid",
      "status": "COMPLETED",
      "documentType": "IDENTITY_DOCUMENT",
      "createdAt": "2026-09-01T...",
      "updatedAt": "2026-09-01T..."
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

## 4. Decisões de privacidade

`DocumentListService.list` (`src/documents/document-list.service.ts`) usa
`select` explícito no Prisma — só `id`, `status`, `documentType`,
`createdAt`, `updatedAt` são lidos do banco, não apenas omitidos na
resposta. Isso significa que campos extraídos (`fields`), `storageKey`,
`sha256`, `claimToken`/`claimedBy`/`claimedAt`/`leaseExpiresAt`,
`attemptCount`, e qualquer estrutura de `ProcessingJob`/`ProcessingRun`
nunca chegam a ser buscados nesta consulta — não é uma filtragem que
poderia falhar e vazar algo por engano, é uma seleção positiva do que é
público. A consulta detalhada (`GET /documents/:id`) continua sendo a
única superfície para o resultado extraído.

## 5. Ordenação

`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` — a página mais recente
vem primeiro, com desempate determinístico por `id` quando dois
documentos têm exatamente o mesmo `createdAt`. Não depende de ordem
implícita do PostgreSQL.

## 6. Paginação

`skip = (page - 1) * pageSize`, `take = pageSize`, `totalPages =
Math.ceil(total / pageSize)` (naturalmente `0` quando `total` é `0`, sem
caso especial). `count` e `findMany` rodam na mesma `$transaction` do
Prisma e usam exatamente o mesmo objeto `where`, garantindo que o total
corresponda aos itens retornados mesmo sob escrita concorrente. Uma
página além do total de resultados retorna `200` com `items: []`, nunca
`404` — o filtro/paginação em si é sempre uma operação válida.

## 7. Filtro por status

Quando `status` está presente, o mesmo objeto `where: { status }` é usado
tanto no `count` quanto no `findMany` — não há filtragem em memória depois
de paginar.

## 8. Testes (L1–L11)

Todos em `test/document-list.e2e-spec.ts`, contra PostgreSQL real:

| Teste | Cobre |
|---|---|
| L1 | Lista vazia → `200`, `items: []`, `total: 0`, `totalPages: 0` |
| L2 | Sem query params → `page=1`, `pageSize=20` |
| L3 | Paginação: 5 documentos, `pageSize=2`, 3 páginas, nenhum item repetido |
| L4 | Ordenação `createdAt DESC` com desempate por `id DESC` |
| L5 | Filtro por status, `total`/`totalPages` corretos para o subconjunto filtrado |
| L6 | Status inválido → `400` |
| L7 | `page` inválido (`0`, negativo, texto) → `400` |
| L8 | `pageSize` inválido (`0`, `101`, negativo, texto) → `400` |
| L9 | Página além do fim → `200`, `items: []` |
| L10 | Resposta não contém `fullName`/`parentage`/`birthDate`/`documentNumber`/`issuingAuthority`/`fields`/`storageKey`/`sha256`/`claimToken`/`claimedBy`/`claimedAt`/`leaseExpiresAt`/`attemptCount`/estrutura de job/run/`stack` |
| L11 | `GET /documents/:id` continua funcionando (regressão do contrato da Fase 1) |

L12 (regressão da suíte de ingestão/processing) não é um teste novo — é
coberto pela execução completa de `npm run test:e2e`, que inclui as
suítes de ingestão (T1–T10) e processamento (P1–P15, PROC-002) sem
nenhuma alteração de comportamento nelas.

Os fixtures de teste usam `createDocumentWithStatus`
(`test/support/processing-fixtures.ts`, nova função) — cria um `Document`
isolado, sem `ProcessingJob`, com `status`/`createdAt` controlados
diretamente, o suficiente para testar listagem sem depender do fluxo real
de claim/finalização.

## 9. Regressões

`npm test` → 3/3 arquivos, 9/9 PASS. `npm run test:e2e` → 5/5 arquivos,
44/44 PASS (33 anteriores + 11 novos desta tarefa).

## 10. Ausência de schema/migration

Nenhuma migration nova. A listagem usa exatamente os campos já existentes
em `Document` (`id`, `status`, `documentType`, `createdAt`, `updatedAt`).
Não avaliei necessidade de índice novo — o volume atual (fase de
demonstração) não justifica uma mudança estrutural; se o volume crescer,
um índice composto em `(status, createdAt, id)` seria o candidato natural
para acelerar o filtro + ordenação + desempate juntos, mas isso fica para
quando houver medição real de necessidade.

## 11. Validações

Ver seção de validações da resposta final (git, CI, resultados reais de
cada comando).

## 12. CI

Nenhuma alteração de workflow foi necessária — a nova suíte
`test/document-list.e2e-spec.ts` é coletada automaticamente pela
configuração `test:e2e` já existente.

## 13. Riscos

- Nenhum índice novo foi criado; para o volume desta fase isso é
  aceitável, mas fica registrado como ponto a revisitar se o volume
  crescer (seção 10).
- `npm audit`/`npm audit --omit=dev` continuam reportando as mesmas 3
  vulnerabilidades `high` conhecidas em `deepmerge-ts` (tooling do
  Prisma), sem mudança — nenhuma dependência nova foi adicionada nesta
  tarefa.

## 14. O que ficou fora

Conforme o prompt: PDF, API key, Swagger/OpenAPI, `Idempotency-Key`,
provider real, revisão humana, nome padronizado, reprocessamento,
autenticação mais forte, frontend, download/preview, filtros adicionais
por data/tipo, busca textual, cursor pagination. Nenhum desses entrou
nesta tarefa.

## 15. Assistência do Claude nesta implementação

Todo o código desta tarefa — `src/documents/document-list.service.ts`,
`src/documents/dto/document-list-query.dto.ts`,
`src/documents/dto/document-list-response.dto.ts`, as alterações em
`src/documents/documents.controller.ts` e `src/documents/documents.module.ts`,
a função `createDocumentWithStatus` em
`test/support/processing-fixtures.ts`, a suíte
`test/document-list.e2e-spec.ts` e este relatório — foi gerado por mim
(Claude) nesta tarefa, a partir do prompt em
`docs/ai/prompts/claude/08-claude-document-list-prompt.md`. Não fiz
revisão humana desta implementação — essa revisão ainda não aconteceu e
não é responsabilidade minha realizá-la.
