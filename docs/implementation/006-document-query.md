# Relatório de Implementação — Consulta do resultado do documento

## 1. Objetivo

Implementar `GET /documents/:id`, fechando a vertical slice mínima do
backend: `receber -> processar -> persistir -> consultar`
(`docs/specification.md` §10, §22; `docs/architecture.md` §18). Escopo
definido em `docs/ai/prompts/claude/06-claude-document-result-query-prompt.md`.

## 2. Endpoint criado

`GET /documents/:id`, em `src/documents/documents.controller.ts`, delegando
para `DocumentQueryService.findById` (`src/documents/document-query.service.ts`).
Operação somente leitura: nenhum claim, nenhuma transição de estado, nenhum
disparo de processamento.

## 3. Contrato da resposta

```json
{
  "documentId": "uuid",
  "documentType": "IDENTITY_DOCUMENT",
  "status": "COMPLETED",
  "createdAt": "2026-08-31T...",
  "updatedAt": "2026-08-31T...",
  "result": {
    "documentType": "IDENTITY_DOCUMENT",
    "fields": {
      "fullName": "...",
      "parentage": "...",
      "birthDate": "1990-01-01",
      "documentNumber": "...",
      "issuingAuthority": "..."
    },
    "confidence": 0.95
  }
}
```

Além do contrato exato pedido no prompt, incluí `documentType` no nível
raiz da resposta (vindo de `Document.documentType`, não do resultado):
`docs/specification.md` §10 lista "o tipo" como algo que a consulta deve
permitir saber, e o tipo é conhecido desde a ingestão — independente de o
processamento já ter terminado ou não. Manter isso só dentro de `result`
deixaria o tipo invisível para documentos ainda em `RECEIVED`/`PROCESSING`/`RETRYING`.

`createdAt`/`updatedAt` são `Date` no código; a serialização JSON padrão do
Express (sem interceptor adicional, conforme `src/main.ts` já existente)
já produz ISO-8601 automaticamente.

## 4. Status HTTP

- Documento existente: sempre `200 OK`, independente do `status` interno
  (`RECEIVED`, `PROCESSING`, `RETRYING`, `COMPLETED`, `NEEDS_REVIEW`,
  `FAILED`) — o estado do processamento vive no corpo, não no HTTP status.
- Documento inexistente: `404 Not Found` via `NotFoundException` do
  NestJS, mesmo padrão de exceção já usado no restante da API (ingestão).
- `id` que não é UUID v4: `400 Bad Request` via `ParseUUIDPipe({ version:
  '4' })` — pipe padrão do NestJS, sem convenção nova.

## 5. Regra de `result = null`

`result` é `null` sempre que não existe `DocumentResult` persistido para o
documento — isso cobre `RECEIVED`, `PROCESSING`, `RETRYING` e também
`FAILED` (que nunca gera `DocumentResult`, conforme
`docs/implementation/004-document-processing.md` §11/§16).

### `COMPLETED`
`result` presente com `documentType`, `fields` (os cinco campos fictícios)
e `confidence`, vindos do `DocumentResult` da tentativa que teve sucesso.

### `NEEDS_REVIEW`
`result` presente com o resultado original produzido pela IA — a
finalização já preserva esse resultado para revisão humana
(`docs/architecture.md` §17, `docs/implementation/004-document-processing.md`
§13). Não inventei nenhuma correção humana, porque ela ainda não existe
nesta fase (Fase 3, `docs/specification.md` §24).

### `FAILED`
`result = null`. Nenhum erro técnico bruto do provider é exposto — o
`technicalErrorType` de `ProcessingRun` nunca aparece na resposta (testado
em Q7).

## 6. Campos de infraestrutura omitidos

A resposta nunca inclui: `storageKey`, caminho local, `sha256`,
`claimToken`, `claimedBy`, `claimedAt`, `leaseExpiresAt`, estrutura de
`ProcessingJob`, erro técnico bruto, stack trace, metadata de concorrência,
secrets, prompt completo ou bytes do documento — testado explicitamente em
Q8, verificando que a resposta serializada não contém nenhuma dessas
strings.

## 7. Como `DocumentResult` é carregado

`DocumentQueryService.loadResult` busca via
`prisma.documentResult.findFirst({ where: { documentId }, orderBy: {
createdAt: 'desc' } })`.

Verifiquei a possível ambiguidade citada no prompt (§7): o schema não
impõe `@unique` em `DocumentResult.documentId` (só em
`DocumentResult.processingRunId`), então estruturalmente mais de um
`DocumentResult` poderia existir para o mesmo `Document`. Na prática,
porém, isso nunca acontece nesta fase: a finalização só cria
`DocumentResult` junto com uma transição para um estado terminal
(`COMPLETED` ou `NEEDS_REVIEW`), e um documento em estado terminal nunca
mais é selecionado pelo claim (`src/processing/job-claim.service.ts`) —
logo nenhuma tentativa futura pode gerar um segundo resultado. Não é uma
ambiguidade real do fluxo atual, mas documento a regra explicitamente
(`findFirst` + `orderBy: createdAt desc`, não uma escolha arbitrária) para
que, se reprocessamento for adicionado numa fase futura, o comportamento
("mostrar o resultado mais recente") já esteja definido e não seja
descoberto por acidente.

## 8. Segurança / PII

Os campos extraídos (fictícios) são devolvidos porque são o próprio
resultado funcional da consulta — isso é esperado e não é um vazamento.
`DocumentQueryService` não loga nada (nenhum `Logger` usado nele): não há
log de campos extraídos, número de documento, parentage ou resultado
bruto. Erros de "não encontrado" e "id inválido" usam as exceções padrão
do NestJS, sem detalhe interno na mensagem. Nenhuma autenticação foi
implementada (fora de escopo desta tarefa).

## 9. Testes (Q1–Q9)

Todos em `test/document-query.e2e-spec.ts`, contra PostgreSQL real, worker
desabilitado (mesma suíte `test:e2e` já existente):

| Teste | Cobre |
|---|---|
| Q1 | `GET` com id inexistente → `404` |
| Q2 | `RECEIVED` → `200`, `result: null` |
| Q3 | `PROCESSING` → `200`, `result: null` |
| Q4 | `RETRYING` → `200`, `result: null` |
| Q5 | `COMPLETED` → `200`, resultado com tipo/campos/confiança corretos |
| Q6 | `NEEDS_REVIEW` → `200`, resultado original preservado |
| Q7 | `FAILED` → `200`, `result: null`, sem erro técnico bruto na resposta |
| Q8 | resposta não contém `storageKey`/`claimToken`/`claimedBy`/`claimedAt`/`leaseExpiresAt`/`attemptCount`/`sha256`/`stack`/etc. |
| Q9 | vertical slice completa: `POST /documents` → `Document + ProcessingJob` → `processingService.processOnce` (fake provider) → `COMPLETED + DocumentResult` → `GET /documents/:id` → `200` + resultado persistido |

Os estados intermediários (`PROCESSING`, `RETRYING`, `COMPLETED`,
`NEEDS_REVIEW`, `FAILED`) são preparados chamando `JobClaimService` e
`FinalizationService` diretamente (mesmo padrão já usado em
`test/processing.e2e-spec.ts`), para controle determinístico sem depender
de timing real do worker.

## 10. Vertical slice completa

Q9 é a prova de ponta a ponta: upload real via `POST /documents` (fixture
PNG válida gerada em memória, sem documento real), confirmação do estado
inicial `RECEIVED` com `result: null`, execução de uma tentativa real via
`ProcessingService.processOnce` (fake provider em modo `SUCCESS`), e
finalmente `GET /documents/:id` confirmando `COMPLETED` com o
`DocumentResult` persistido e consultável.

## 11. Regressões

`npm test` e `npm run test:e2e` completos, incluindo todos os testes de
ingestão (T1–T10) e processamento (P1–P15, PROC-002), sem nenhuma
alteração de comportamento nesses módulos.

## 12. Validações

Ver seção de validações da resposta final da tarefa (git, CI e resultados
reais de cada comando).

## 13. CI

Nenhuma alteração de workflow foi necessária — a nova suíte
`test/document-query.e2e-spec.ts` é automaticamente coletada pela
configuração `test:e2e` já existente.

## 14. Limitações conhecidas

- `DocumentQueryService.loadResult` assume, por design do processamento
  atual, que no máximo um `DocumentResult` existe por documento (seção 7)
  — se reprocessamento for adicionado no futuro sem revisar essa
  suposição, `findFirst` + `orderBy: desc` continuará funcionando (mostra
  o mais recente), mas a decisão de qual resultado "é o atual" precisará
  ser revisitada explicitamente nessa fase futura.
- Não há paginação, filtro ou listagem — fora de escopo desta tarefa.
- Não há cache: cada consulta lê o banco diretamente, adequado para o
  volume desta fase.

## 15. O que ficou fora

Conforme o prompt (§16): listagem `GET /documents`, filtros, paginação,
download/preview de arquivo, endpoint de conteúdo, fila humana de revisão,
claim de reviewer, correção humana, optimistic locking de reviewer,
autenticação, PDF, provider real, frontend, nome padronizado, deploy.
Nenhum desses entrou nesta tarefa.

## 16. Assistência do Claude nesta implementação

Todo o código desta tarefa — `src/documents/document-query.service.ts`,
`src/documents/dto/document-query-response.dto.ts`, a alteração em
`src/documents/documents.controller.ts` e `src/documents/documents.module.ts`,
a suíte `test/document-query.e2e-spec.ts` e este relatório — foi gerado
por mim (Claude), a partir do prompt em
`docs/ai/prompts/claude/06-claude-document-result-query-prompt.md`. Não
fiz revisão humana desta implementação — essa revisão ainda não aconteceu
e não é responsabilidade minha realizá-la.
