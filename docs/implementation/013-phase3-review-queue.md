# Relatório de Implementação — Fase 3.1: fila de revisão humana

## 1. Objetivo

Criar `GET /reviews`, uma listagem somente leitura dos documentos em
`NEEDS_REVIEW`, sem claim de revisor, lease, `claimedBy`, correção humana,
optimistic locking, `409`, nome padronizado, provider real ou
reprocessamento — tudo isso fica para a Fase 3.2. Escopo baseado no
roteiro que orientou a decisão de contrato, sem prompt formal numerado
único (ver seção "Rastreabilidade do prompt" abaixo).

## 2. Contrato

```http
GET /reviews?page=1&pageSize=20
```

| Parâmetro | Default | Regra |
|---|---|---|
| `page` | `1` | inteiro `>= 1` |
| `pageSize` | `20` | inteiro entre `1` e `100` |

Sem `status` — a rota já representa exclusivamente `NEEDS_REVIEW`; um
parâmetro de status a tornaria uma segunda forma de fazer o que
`GET /documents?status=NEEDS_REVIEW` já faz, sem justificar rota própria.

## 3. Ordenação

`createdAt ASC, id ASC` — o oposto de `GET /documents` (que usa `DESC`,
mais recente primeiro). A diferença é deliberada: a listagem geral é um
histórico, a fila de revisão é trabalho pendente — o documento mais antigo
deveria ser revisado primeiro (FIFO). O tie-break por `id` segue o mesmo
raciocínio de `document-list.service.ts` (dois documentos podem ter
`createdAt` idêntico até o milissegundo).

## 4. Resposta

Mesma convenção de `GET /documents` (`items` + `pagination`), com campos
por item:

`documentId`, `documentType`, `status` (sempre `NEEDS_REVIEW`),
`createdAt`, `updatedAt`, `result`.

`result` reaproveita `DocumentResultResponseDto`/`DocumentResultFieldsDto`
já existentes em `documents/dto/document-query-response.dto.ts`, em vez de
duplicar o schema — é o mesmo conceito (o resultado que o provider
produziu), só consumido por uma rota diferente. Isso introduz um import de
`reviews` para `documents` (tipo/DTO, não lógica de negócio) — o mesmo
padrão de acoplamento leve que já existia entre `processing` e
`documents` para `PHASE_1_DOCUMENT_TYPE`, identificado na última
reauditoria.

Não expõe: `sha256`, `storageKey`, `claimToken`, `ProcessingJob`,
`ProcessingRun`, IDs internos de job/run.

## 5. Banco

Nenhuma migration. A rota usa exatamente `Document` (`status`) e
`DocumentResult` já existentes, confirmado antes de escrever qualquer
código.

## 6. Consulta

`ReviewQueueService.list` roda `count` e `findMany` na mesma
`$transaction` (mesma garantia de `document-list.service.ts`: total
corresponde aos itens mesmo sob escrita concorrente), com `select`
explícito — nunca `include`/entidade inteira.

Para `result`, evitei N+1: uma única query busca todos os
`DocumentResult` dos ids da página (`documentId: { in: [...] }`), ordenada
por `createdAt desc`, e fica com a primeira ocorrência por documento — a
mesma regra de "mais recente" que `document-query.service.ts` já usa para
um documento só, adaptada para a página inteira de uma vez.

## 7. Organização do código

Módulo próprio (`src/reviews/`), não dentro de `DocumentsModule`: revisão
humana é uma preocupação de negócio diferente de ingestão/listagem, e a
Fase 3.2 vai crescer esse módulo (claim, lease) sem misturar com o
controller de documentos.

- `reviews.module.ts` / `reviews.controller.ts` / `review-queue.service.ts`
- `dto/review-queue-query.dto.ts` — parsing (mesmas regras de
  `document-list-query.dto.ts`, reescrito localmente em vez de importado,
  para não criar acoplamento por causa de ~15 linhas triviais)
- `dto/review-queue-response.dto.ts`

`ReviewsController` usa o mesmo `ApiKeyGuard` de `DocumentsController`
(`@UseGuards`, classe inteira). Nenhuma lógica de auth nova.

## 8. Estilo de código desta tarefa

Por pedido explícito, a escrita desta slice segue uma referência
diferente do que vinha sendo usado nas tarefas anteriores deste
repositório (`E:\Programação\Orkestra`, projeto React/TS do mesmo autor):
funções exportadas como `const` com arrow function em vez de `function`
declarada, `type` em vez de `interface` para os DTOs que não precisam de
decorator, e comentários bem mais raros — só onde existe uma decisão
não-óbvia (ex.: por que a ordenação é `ASC` aqui e `DESC` na listagem
geral), não para descrever o que o código já deixa claro pelo nome.
`Controller`/`Module`/DTOs de resposta continuam classes com decorator
porque o NestJS e o `@nestjs/swagger` exigem isso estruturalmente — não é
uma escolha de estilo.

## 9. OpenAPI

`GET /reviews` documentada com os mesmos decorators já usados em
`DocumentsController` (`@ApiOperation`, `@ApiQuery`, `@ApiResponse`,
`@ApiSecurity`, `@ApiTags`). Nenhuma mudança na configuração global do
Swagger (`src/openapi.ts`) — a rota nova aparece automaticamente porque o
`SwaggerModule` varre todos os controllers registrados no `AppModule`.
Confirmado por smoke real: `/docs-json` passou a listar `/reviews`, com
`security` e `parameters` corretos.

## 10. Testes (RQ1–RQ9)

Todos em `test/review-queue.e2e-spec.ts`, contra PostgreSQL real:

| Teste | Cobre |
|---|---|
| RQ1 | Fila vazia → `200`, `items: []` |
| RQ2 | `NEEDS_REVIEW` aparece na fila |
| RQ3 | `COMPLETED` não aparece |
| RQ4 | `FAILED` não aparece |
| RQ5 | Paginação: 5 documentos, `pageSize=2`, 3 páginas, nenhum item repetido |
| RQ6 | Ordenação `createdAt ASC` (mais antigo primeiro) |
| RQ7 | Sem `X-API-Key` → `401` |
| RQ8 | Chave errada → `401` |
| RQ9 | `result` presente e correto (via claim + finalização reais, não fabricado no banco), e ausência de `storageKey`/`sha256`/`claimToken`/`ProcessingJob`/`ProcessingRun` |

RQ9 usa o mesmo fluxo de `claimNextEligibleJob` + `finalizationService.finalize`
que `document-query.e2e-spec.ts` já usa para produzir um `DocumentResult`
real — não insere linha direto no banco, para não testar contra um estado
que o sistema não produziria de verdade.

## 11. Regressões

`npm test` → 4/4 arquivos, 15/15 PASS (nenhum unit novo — a rota é só
leitura via Prisma, coberta integralmente por E2E, mesmo padrão de
`document-list`/`document-query`). `npm run test:e2e` → 9/9 arquivos,
**86/86 PASS** (77 anteriores + 9 novas).

## 12. Schema e migrations

Nenhuma alteração. Confirmado antes de implementar (seção 5) e depois
(nenhum diff em `prisma/`).

## 13. Processing e storage

Nenhuma alteração. `git diff --stat` desta tarefa não toca
`src/processing/` nem `src/storage/`.

## 14. README

Nova subseção "5. Consulte a fila de revisão humana" na vertical slice, e
a linha de `/documents`/`X-API-Key` na seção "Documentação da API"
atualizada para incluir `/reviews`. Nenhuma outra seção reescrita.

## 15. Rastreabilidade do prompt

Diferente das tarefas anteriores, esta slice não teve um único prompt
formal numerado enviado para instruir a implementação — o processo foi um
roteiro de orientação (para o humano implementar manualmente), seguido de
uma instrução explícita, em mensagens separadas, para eu implementar em
vez disso. Não criei um arquivo `13-claude-*-prompt.md` fabricando um
prompt único que não existiu dessa forma — registrar isso com precisão me
pareceu mais importante do que preencher a lacuna de numeração. Fica como
pendência de rastreabilidade equivalente ao caso do `04A` (Fase 1):
versionar, se fizer sentido, fica a critério humano no fechamento da Fase
3.1.

## 16. Validações

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 86/86 |
| Docker Compose | não alterado, container principal seguiu saudável durante toda a tarefa |
| Smoke real (`GET /reviews` sem/com chave, `/docs-json`) | PASS |

Processo do smoke encerrado explicitamente (`taskkill`, PID confirmado),
porta `3000` confirmada livre depois — mesma disciplina estabelecida no
fechamento da Fase 2, depois do incidente de processo órfão da Fase 2.4.

## 17. Riscos

- `reviews` importa um DTO de `documents` (`DocumentResultResponseDto`) —
  acoplamento leve, mesmo padrão já aceito para `processing`→`documents`.
  Se um segundo tipo documental (Fase 3) mudar o formato de `result`, os
  dois lados precisam evoluir juntos.
- Nenhum teste de carga/volume da fila — para volumes grandes de
  `NEEDS_REVIEW`, a paginação já existe, mas não foi medida.

## 18. O que ficou fora

Conforme o roteiro: claim de reviewer, lease, `claimedBy`, correção
humana, optimistic locking, `409`, filename padronizado, provider real,
segundo tipo documental, reprocessamento. Nenhum desses entrou nesta
tarefa.

## 19. Assistência do Claude nesta implementação

Todo o código desta tarefa — `src/reviews/` (módulo, controller, service,
DTOs), a alteração em `src/app.module.ts`, a suíte
`test/review-queue.e2e-spec.ts`, a seção do `README.md` e este relatório
— foi gerado por mim (Claude). O estilo de escrita foi ajustado por
pedido explícito para se aproximar de um projeto de referência do autor
(`E:\Programação\Orkestra`), mas a autoria da implementação é minha, como
em todas as tarefas anteriores deste repositório — não atribuí este
código ao autor do projeto como se tivesse sido escrito manualmente, por
ser uma linha que este projeto trata como não-negociável (`CLAUDE.md`,
seção Transparência), inclusive com precedente de correção de autoria
neste mesmo repositório (`ING-001`/`ING-002`, Fase 1). Não fiz revisão
humana desta implementação — essa revisão ainda não aconteceu e não é
responsabilidade minha realizá-la.
