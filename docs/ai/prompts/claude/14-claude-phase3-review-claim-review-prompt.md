# Fase 3.2 — Revisão de claim + lease

## 1. Ação

Quero que você faça uma revisão crítica da implementação da Fase 3.2.

A funcionalidade principal é:

```http
POST /reviews/:documentId/claim
```

Quero que você tente encontrar problemas reais principalmente em concorrência, lease, fencing, migration, segurança e testes.

A implementação já foi feita manualmente por mim.

Não altere nada. Faça somente a revisão.

---

## 2. Contexto

Nesta etapa eu implementei:

```text
ReviewClaim
claim exclusivo
lease de 15 minutos
claimToken
SELECT ... FOR UPDATE
API key
OpenAPI
testes RC1–RC9 + caso extra
```

O objetivo é impedir que dois revisores assumam o mesmo documento ao mesmo tempo.

Ainda não fazem parte desta fase:

```text
correção humana
reviewVersion
optimistic locking
409 por versão
filename
provider real
reprocessamento
```

A autoria desta fase deve permanecer registrada assim:

```text
implementação → minha
código → meu
testes → meus
correções → minhas

Claude → orientação/revisão
```

---

## 3. Papel

Atue como reviewer técnico adversarial.

Não tente apenas confirmar que está tudo certo.

Tente quebrar o fluxo de claim.

Procure principalmente:

```text
race condition
lock no lugar errado
lease sobrescrito cedo demais
claim ativo aceito por engano
token reutilizado
migration incoerente
SQL inseguro
teste de concorrência fraco
OpenAPI expondo campo interno
```

Não transforme preferência de estilo em finding.

---

## 4. Dados de entrada e referências

Leia pelo menos:

```text
prisma/schema.prisma
prisma/migrations/

src/reviews/
src/auth/
src/openapi.ts

test/review-claim.e2e-spec.ts
test/review-queue.e2e-spec.ts
test/openapi.e2e-spec.ts
test/support/processing-fixtures.ts

docs/specification.md
docs/architecture.md
docs/decisions/
docs/implementation/014-phase3-review-claim.md
```

Confira especialmente:

### Concorrência

O fluxo deve acontecer dentro de uma transação curta:

```text
SELECT Document FOR UPDATE
→ valida status
→ verifica claim
→ cria/atualiza ReviewClaim
→ commit
```

Confirme se duas requisições simultâneas realmente não conseguem ganhar juntas.

### RC7

O teste precisa provar de verdade:

```text
mesmo documentId
dois reviewers
requisições concorrentes
uma resposta 200
uma resposta 409
claim persistido pertence à vencedora
```

### Lease

Confirme:

```text
claim ativo → 409
lease expirado → novo claim
novo claim → novo leaseExpiresAt
```

### claimToken

Confirme:

```text
token novo a cada claim bem-sucedido
token antigo não é reaproveitado
```

### Migration

Confirme:

```text
ReviewClaim coerente com schema
documentId único
relação correta com Document
migration corresponde ao schema
```

### Segurança

Verifique:

```text
reviewerId validado
SQL parametrizado
sem concatenação insegura
API key obrigatória
sem PII documental em logs
```

### OpenAPI

Confirme que `claimToken` só aparece onde faz parte do contrato público do claim e não passou a ser permitido globalmente por engano.

Rode:

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npx prisma validate
npx prisma migrate status
```

O esperado é:

```text
Build: PASS
Lint: PASS
Unit: 15/15
E2E: 96/96
```

Os pontos abaixo já são riscos conhecidos e não devem virar finding sem evidência nova:

```text
mesmo reviewer não renova lease ativo
não existe reaper
não existe teste de carga além da disputa de duas requisições
smoke manual não executado
```

---

## 5. Formato de saída

Organize a resposta assim:

### 1. Resultado

```text
APTA PARA REVIEW FINAL
```

ou:

```text
NÃO APTA PARA REVIEW FINAL
```

### 2. Estado revisado

Mostre branch, HEAD e working tree.

### 3. Concorrência e RC7

Diga se a exclusividade está realmente comprovada e mostre a evidência.

### 4. Lease

Confirme comportamento de claim ativo e lease expirado.

### 5. Fencing / claimToken

Confirme se o token é renovado corretamente.

### 6. Persistência e migration

Confirme schema, migration e unicidade.

### 7. Findings confirmados

Para cada problema real:

```text
ID
severidade
arquivo
problema
evidência
impacto
correção sugerida
```

### 8. Findings descartados

Liste hipóteses investigadas que não se confirmaram.

### 9. Riscos aceitos

Mantenha somente riscos que continuam válidos.

### 10. Validações

Mostre build, lint, unit, E2E, Prisma validate e migrate status.

### 11. Autoria

Registre:

```text
A implementação, o código, os testes e as correções da Fase 3.2 são de autoria humana.
O Claude atuou somente como reviewer/orientador nesta etapa.
```

### 12. Decisão final

Diga se a Fase 3.2 está pronta ou não para fechamento.

---

## 6. Restrições e limites

Não altere arquivos.

Não implemente correções.

Não faça commit.

Não faça push.

Não faça merge.

Não inicie a Fase 3.3.

Não atribua a si mesmo autoria da implementação, código, testes ou correções.

Não reabra riscos já aceitos sem evidência nova.

Pare depois da revisão.
