# Relatório de Implementação — Fase 3.1: fila de revisão humana

## 1. Objetivo

Nesta etapa eu implementei `GET /reviews`, uma fila somente leitura para documentos em `NEEDS_REVIEW`.

Mantive o escopo pequeno de propósito. Claim de revisor, lease, correção humana, optimistic locking, `409`, filename, provider real e reprocessamento ficaram para as próximas etapas da Fase 3.

## 2. Contrato

```http
GET /reviews?page=1&pageSize=20
```

| Parâmetro | Default | Regra |
|---|---:|---|
| `page` | `1` | inteiro `>= 1` |
| `pageSize` | `20` | inteiro entre `1` e `100` |

Não adicionei `status`, porque a rota já representa exclusivamente `NEEDS_REVIEW`.

## 3. Ordenação

Usei:

```text
createdAt ASC, id ASC
```

A fila mostra primeiro o trabalho mais antigo. O `id` funciona como desempate quando dois registros têm o mesmo `createdAt`, deixando a ordenação determinística.

## 4. Resposta

Mantive a convenção de `GET /documents`, com `items` e `pagination`.

Cada item retorna:

```text
documentId
documentType
status
createdAt
updatedAt
result
```

Reaproveitei `DocumentResultResponseDto` e `DocumentResultFieldsDto` porque o conceito de resultado é o mesmo.

Não exponho `sha256`, `storageKey`, `claimToken`, `ProcessingJob`, `ProcessingRun` nem IDs internos de job/run.

## 5. Banco

Não precisei alterar o schema nem criar migration. A fila usa `Document.status` e `DocumentResult`, que já existiam.

## 6. Consulta

No `ReviewQueueService.list`, `count` e `findMany` rodam na mesma `$transaction`, seguindo o padrão da listagem de documentos.

Também evitei N+1: os `DocumentResult` da página são buscados em uma única consulta e, para cada documento, considero o resultado mais recente.

## 7. Organização do código

Criei um módulo próprio em `src/reviews/`, porque revisão humana é uma responsabilidade diferente de ingestão e listagem.

Arquivos principais:

- `reviews.module.ts`
- `reviews.controller.ts`
- `review-queue.service.ts`
- `dto/review-queue-query.dto.ts`
- `dto/review-queue-response.dto.ts`

O `ReviewsController` reaproveita o mesmo `ApiKeyGuard` das rotas de documentos.

## 8. Estilo de código

Nesta slice mantive um estilo mais direto: funções exportadas como `const` quando fazia sentido, `type` para estruturas simples sem decorator e poucos comentários, apenas onde havia uma decisão que não era óbvia pelo próprio código.

## 9. OpenAPI

Documentei `GET /reviews` com os mesmos decorators já usados no restante da API.

Não alterei a configuração global do Swagger. Validei em `/docs-json` que `/reviews` aparece com parâmetros e segurança corretos.

## 10. Testes

Implementei RQ1–RQ9 em `test/review-queue.e2e-spec.ts`, usando PostgreSQL real.

| Teste | O que prova |
|---|---|
| RQ1 | fila vazia retorna `200` e `items: []` |
| RQ2 | `NEEDS_REVIEW` aparece |
| RQ3 | `COMPLETED` não aparece |
| RQ4 | `FAILED` não aparece |
| RQ5 | paginação |
| RQ6 | `createdAt ASC, id ASC` |
| RQ7 | sem API key → `401` |
| RQ8 | API key errada → `401` |
| RQ9 | resultado correto e ausência de campos internos |

No RQ9 usei o fluxo real de processamento para produzir `DocumentResult`, em vez de inserir um estado artificial direto no banco.

## 11. Regressões

```text
npm test
→ 15/15 PASS

npm run test:e2e
→ 86/86 PASS
```

## 12. Schema, processing e storage

Não alterei migrations, `src/processing/` nem `src/storage/`.

## 13. README

Atualizei o README para incluir a fila de revisão e a rota `/reviews` entre as rotas protegidas por API key.

## 14. Rastreabilidade

Esta slice começou a partir de um roteiro de orientação para que eu implementasse manualmente a funcionalidade.

Não criei um prompt de implementação artificial só para preencher uma numeração. Preferi manter a rastreabilidade fiel ao que realmente aconteceu.

## 15. Validações

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 86/86 |
| Smoke real (`GET /reviews`, API key e `/docs-json`) | PASS |

O processo usado no smoke foi encerrado ao final e a porta `3000` ficou livre.

## 16. Riscos conhecidos

- `reviews` reutiliza DTOs de `documents`, criando acoplamento leve;
- ainda não existe teste de carga da fila;
- reprocessamento pode exigir revisar a escolha do `DocumentResult` mais recente;
- claim e correção humana vão exigir revisitar consistência e concorrência.

Nenhum desses pontos bloqueia esta slice.

## 17. O que ficou fora

Deixei para as próximas etapas:

```text
claim de reviewer
lease
claimedBy
correção humana
optimistic locking
409 por conflito de versão
filename padronizado
provider real
segundo tipo documental
reprocessamento
```

Preferi concluir esta slice inteira, testada e validada, antes de avançar.

## 18. Autoria e uso de IA

A implementação desta Fase 3.1 foi feita por mim.

Isso inclui o código em `src/reviews/`, a alteração em `src/app.module.ts`, os testes E2E, os ajustes no README e as correções de RQ-001 e RQ-002.

Usei IA como apoio para orientação e revisão técnica. A implementação e as correções desta etapa são de autoria humana.
