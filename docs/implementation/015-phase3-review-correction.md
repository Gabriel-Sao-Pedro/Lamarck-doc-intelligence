# Relatório de Implementação — Fase 3.3: correção humana + optimistic locking

## 1. Objetivo

Nesta etapa eu implementei `PATCH /reviews/:documentId` para permitir que um revisor com claim ativo corrija os campos extraídos de um documento em `NEEDS_REVIEW`.

A principal preocupação foi permitir a correção sem sobrescrever o resultado original da IA e sem deixar duas tentativas concorrentes produzirem um estado inconsistente.

## 2. Por que esta etapa existe

A Fase 3.1 criou a fila de revisão e a Fase 3.2 garantiu que apenas um revisor por vez pode assumir um documento.

Ainda faltava o passo principal do fluxo: salvar uma correção humana.

Para isso, eu precisava resolver dois problemas:

```text
preservar o resultado original da IA
evitar overwrite silencioso entre duas correções concorrentes
```

A solução foi usar `reviewVersion` com optimistic locking e manter as correções em uma entidade separada e append-only.

## 3. Contrato

Implementei:

```http
PATCH /reviews/:documentId
X-API-Key: ...
Content-Type: application/json

{
  "claimToken": "uuid",
  "version": 1,
  "corrections": {
    "fullName": "..."
  }
}
```

Em caso de sucesso:

```json
{
  "documentId": "...",
  "version": 2,
  "reviewedBy": "reviewer-01",
  "correctedFields": { "fullName": "..." },
  "aiResult": { "...": "resultado original da IA" },
  "effectiveResult": { "...": "resultado após aplicar a correção" },
  "updatedAt": "..."
}
```

Os principais erros ficaram assim:

```text
documento inexistente → 404
status diferente de NEEDS_REVIEW → 409
sem claim, token incorreto ou lease expirado → 409
version diferente da atual → 409
body inválido ou campo não permitido → 400
API key ausente ou incorreta → 401
```

## 4. Persistência

Criei `ReviewCorrection` como uma entidade append-only separada de `Document` e `DocumentResult`.

```prisma
model ReviewCorrection {
  id String @id @default(uuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  version Int
  correctedFields Json
  reviewedBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([documentId, version])
  @@index([documentId])
  @@index([reviewedBy])
}
```

Cada correção aceita cria uma nova linha. Eu não sobrescrevo correções anteriores.

Também adicionei:

```text
Document.reviewVersion Int @default(1)
```

Essa é a versão usada pelo optimistic locking.

A migration criada foi:

```text
prisma/migrations/20260901103342_add_review_correction/migration.sql
```

Ela adiciona `reviewVersion` em `Document` e cria `ReviewCorrection` com FK, índices e unicidade por `documentId + version`.

## 5. Optimistic locking

O fluxo de `ReviewCorrectionService.correct` ficou assim:

```text
BEGIN
SELECT Document FOR UPDATE
→ valida existência
→ valida NEEDS_REVIEW
→ valida claimToken e lease
→ compara version com Document.reviewVersion
→ carrega DocumentResult
→ incrementa reviewVersion
→ grava ReviewCorrection
COMMIT
```

Além do lock em `Document`, mantive uma condição de versão no `UPDATE`.

Na prática, o lock já serializa tentativas concorrentes sobre o mesmo documento, mas a condição no update funciona como uma segunda barreira defensiva.

O ponto importante foi impedir este cenário:

```text
ler versão
→ outra requisição altera
→ primeira requisição grava mesmo assim
```

Toda a decisão acontece dentro da mesma transação e sob o lock da linha de `Document`.

## 6. Validação do claim e do lease

Antes de aceitar qualquer correção, eu valido:

```text
Document.status === NEEDS_REVIEW
ReviewClaim existe
claimToken recebido === claimToken atual
leaseExpiresAt > now
```

Se qualquer condição falhar, a operação retorna `409`.

O `reviewedBy` salvo na correção vem diretamente do `ReviewClaim` válido:

```text
claim.reviewerId
```

Assim, o cliente não consegue escolher livremente quem será registrado como revisor.

## 7. Resultado original, correção e resultado efetivo

Mantive três conceitos separados:

```text
aiResult
correctedFields
effectiveResult
```

`DocumentResult` continua sendo a fonte original da IA e não é alterado por esta fase.

As correções humanas ficam em `ReviewCorrection`.

O `effectiveResult` é calculado no momento da resposta:

```text
aiResult
→ aplica correções anteriores em ordem de version
→ aplica a correção atual
```

Campos nunca corrigidos continuam com o valor original da IA. Campos corrigidos mais de uma vez ficam com o valor mais recente.

Preferi calcular o resultado efetivo em vez de persistir outra cópia para não criar uma segunda fonte de verdade.

## 8. Concorrência

O principal cenário desta fase é:

```text
mesmo documentId
mesmo claimToken
mesma version
duas PATCH concorrentes
```

O esperado é:

```text
uma vence → 200
a outra perde → 409
reviewVersion incrementa uma única vez
```

O teste HR13 dispara as duas requisições com `Promise.all` e também verifica o estado final no banco.

Assim, o teste confirma não só os códigos HTTP, mas também que apenas uma `ReviewCorrection` foi persistida para a nova versão.

## 9. Arquivos alterados

| Arquivo | Situação | O que fiz |
|---|---|---|
| `prisma/schema.prisma` | Modificado | adicionei `Document.reviewVersion` e `ReviewCorrection` |
| `prisma/migrations/20260901103342_add_review_correction/migration.sql` | Novo | migration da Fase 3.3 |
| `src/reviews/review-correction.service.ts` | Novo | optimistic locking, claim/lease e cálculo do resultado efetivo |
| `src/reviews/dto/review-correction-body.dto.ts` | Novo | validação de `claimToken`, `version` e `corrections` |
| `src/reviews/dto/review-correction-response.dto.ts` | Novo | contrato de resposta |
| `src/reviews/reviews.controller.ts` | Modificado | adicionei `PATCH /reviews/:documentId` |
| `src/reviews/reviews.module.ts` | Modificado | registrei `ReviewCorrectionService` |
| `src/reviews/review-claim.service.ts` | Modificado | passei a retornar `reviewVersion` no claim |
| `src/reviews/dto/review-claim-response.dto.ts` | Modificado | adicionei `version` |
| `test/review-correction.e2e-spec.ts` | Novo | HR1–HR13 |
| `test/review-claim.e2e-spec.ts` | Modificado | valida `version: 1` no claim inicial |
| `test/openapi.e2e-spec.ts` | Modificado | cobre a nova rota |
| `test/support/processing-fixtures.ts` | Modificado | cleanup de `ReviewCorrection` |

## 10. Testes

Implementei os cenários HR1–HR13 em `test/review-correction.e2e-spec.ts`.

| Teste | O que prova |
|---|---|
| HR1/HR7 | correção válida, persistência, incremento de versão e resposta correta |
| HR2 | documento inexistente → `404` |
| HR3 | documento fora de `NEEDS_REVIEW` → `409` |
| HR4 | sem claim → `409` |
| HR5 | `claimToken` incorreto → `409` |
| HR6 | lease expirado → `409` |
| HR8 | `version` antiga → `409` sem overwrite |
| HR9 | `DocumentResult` original é preservado |
| HR10 | `reviewedBy` vem do claim |
| HR11 | campo fora da allow-list → `400` |
| HR12 | API key ausente/incorreta → `401` |
| HR13 | duas correções concorrentes com a mesma versão → apenas uma vence |

## 11. Validações

| Check | Resultado |
|---|---|
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| Migration | PASS |
| Segunda execução da migration | PASS — nenhuma pendência |
| E2E `review-correction` | PASS — 12/12 |
| E2E completo | PASS — 109/109 |
| Smoke manual | não executado nesta tarefa |

## 12. Segurança e PII

Não loguei `corrections`, `aiResult`, `effectiveResult` ou `claimToken`.

A rota continua protegida por `ApiKeyGuard`.

Também mantive uma allow-list explícita de campos corrigíveis:

```text
fullName
parentage
birthDate
documentNumber
issuingAuthority
```

Qualquer outro campo é rejeitado com `400`, evitando mass assignment em propriedades internas.

## 13. Decisões que tomei

As principais decisões desta etapa foram:

- `ReviewCorrection` append-only;
- `reviewVersion` em `Document`;
- `reviewedBy` vindo do claim válido;
- optimistic locking dentro da mesma transação;
- `effectiveResult` calculado, não persistido;
- allow-list fixa de campos corrigíveis;
- nenhuma mudança na state machine;
- documento continua em `NEEDS_REVIEW` depois da correção.

Mantive a state machine sem alteração porque esta slice trata da correção e do controle de concorrência, não do fechamento definitivo da revisão.

## 14. Riscos e pendências

Ainda ficam conhecidos:

- não existe endpoint para consultar o histórico completo de `ReviewCorrection`;
- não existe teste de carga além da concorrência exercitada no HR13;
- o smoke manual da rota não foi executado nesta tarefa.

Nenhum desses pontos bloqueia a Fase 3.3.

## 15. O que ficou fora

Deixei para as próximas etapas:

```text
filename padronizado
provider multimodal real
segundo tipo documental
reprocessamento
```

Também não persisti `effectiveResult` como uma entidade separada, porque ele pode ser reconstruído a partir do resultado original e do histórico de correções.

## 16. Autoria e uso de IA

A implementação desta Fase 3.3 foi feita por mim.

Isso inclui:

- schema e migration;
- service de correção;
- DTOs;
- alterações no controller e módulo;
- integração de `reviewVersion` com o claim;
- testes HR1–HR13;
- ajustes de OpenAPI;
- fixtures;
- decisões e correções desta etapa.

Usei IA como apoio para orientação, revisão técnica e organização da documentação. A implementação, os testes, as decisões e as correções desta fase são de autoria humana.
