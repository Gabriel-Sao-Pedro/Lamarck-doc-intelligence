# Fase 3.3 — Revisão e documentação da correção humana

## 1. Ação

Quero que você revise criticamente a implementação da Fase 3.3 e, depois, documente o que foi feito.

A implementação já foi feita por mim.

Você deve atuar como reviewer e como apoio para registrar a implementação, sem se atribuir autoria do código, testes, migrations, decisões ou correções.

Depois da revisão, crie:

```text
docs/implementation/015-phase3-review-correction.md
docs/implementation/reviews/16-phase3-review-correction-review.md
```

Não haverá uma revisão humana adicional depois disso.

---

## 2. Contexto

A Fase 3.3 adicionou:

```text
Document.reviewVersion iniciando em 1
ReviewCorrection append-only
PATCH /reviews/:documentId
claimToken
lease válido
optimistic locking por version
reviewedBy vindo do ReviewClaim
DocumentResult original preservado
aiResult
correctedFields
effectiveResult
version retornada no claim
```

A state machine não foi alterada.

As validações já realizadas foram:

```text
Prisma validate: PASS
Prisma generate: PASS
Build: PASS
Lint: PASS
Unit: 15/15
Migration real: PASS
Review correction E2E: 12/12
E2E total: 109/109
```

---

## 3. Papel

Atue como reviewer adversarial.

Tente encontrar problema real principalmente em:

```text
optimistic locking
concorrência
claimToken
lease
reviewVersion
preservação do resultado original
ReviewCorrection
campos corrigíveis
PII
OpenAPI
```

Não invente finding e não trate preferência de estilo como bug.

A autoria é uma premissa desta tarefa:

```text
implementação → minha
código → meu
testes → meus
correções → minhas

Claude → orientação/revisão/documentação
```

Não reabra essa discussão.

---

## 4. Dados de entrada e referências

Leia o diff e os arquivos da Fase 3.3, principalmente:

```text
prisma/schema.prisma
prisma/migrations/
src/reviews/
test/review-correction.e2e-spec.ts
test/review-claim.e2e-spec.ts
test/openapi.e2e-spec.ts
docs/specification.md
docs/architecture.md
docs/decisions/
```

Confirme:

```text
duas PATCH com mesma version → uma vence e uma recebe 409
reviewVersion incrementa uma única vez
claimToken precisa ser o atual
lease precisa estar ativo
reviewedBy vem do claim
DocumentResult original continua intacto
ReviewCorrection mantém histórico
effectiveResult combina IA + correções
campos internos não podem ser corrigidos
```

Rode novamente as validações se o ambiente estiver disponível.

---

## 5. Formato de saída

Primeiro entregue a revisão com:

### 1. Resultado

```text
APTA PARA COMMIT/PUSH/CI
```

ou:

```text
NÃO APTA PARA COMMIT/PUSH/CI
```

### 2. Estado revisado

Branch, HEAD, working tree e arquivos principais.

### 3. Optimistic locking

Explique se a proteção por version é realmente atômica.

### 4. Claim e lease

Confirme token, lease e `reviewedBy`.

### 5. Persistência

Confirme `ReviewCorrection`, histórico e preservação de `DocumentResult`.

### 6. Concorrência

Confirme o teste com duas correções na mesma versão.

### 7. Findings confirmados

Somente problemas reais.

### 8. Findings descartados

Hipóteses investigadas que não se confirmaram.

### 9. Validações

Mostre Prisma, build, lint, unit, migration e E2E.

### 10. Autoria

Registre que a implementação é humana e que o Claude atuou somente como apoio de orientação/revisão.

### 11. Decisão

Apta ou não para commit/push/CI.

Depois crie o relatório de implementação em primeira pessoa, com linguagem natural:

```text
eu implementei
eu optei
eu decidi
eu validei
eu deixei fora do escopo
```

E crie a revisão técnica final.

---

## 6. Restrições e limites

Não altere código, testes, schema ou migration.

Pode criar somente:

```text
docs/implementation/015-phase3-review-correction.md
docs/implementation/reviews/16-phase3-review-correction-review.md
```

Não atribua a si mesmo a implementação.

Não diga que haverá outra review humana.

Não faça commit.

Não faça push.

Não faça merge.

Não inicie Fase 3.4.

Pare depois da revisão e da criação dos dois documentos.
