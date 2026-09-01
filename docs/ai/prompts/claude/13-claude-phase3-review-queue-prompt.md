# Fase 3.1 — Revisão da fila de revisão humana

## 1. Ação

Quero que você revise de forma crítica a implementação da Fase 3.1, principalmente o endpoint:

```http
GET /reviews
```

A implementação já foi feita manualmente por mim.

Não quero que você altere nada agora. Quero somente uma revisão tentando encontrar problemas reais antes da review humana final.

Confirme também se os dois pontos que já foram corrigidos realmente ficaram resolvidos:

```text
RQ-001
→ desempate por id ASC realmente testado

RQ-002
→ uso de DocumentStatus.NEEDS_REVIEW no lugar da string solta
```

---

## 2. Contexto

Esta etapa adiciona somente a fila de documentos que precisam de revisão humana.

Ela deve:

```text
listar apenas NEEDS_REVIEW
ter paginação
ordenar por createdAt ASC e id ASC
usar API key
não expor campos internos
aparecer corretamente no OpenAPI
```

Ainda não fazem parte desta etapa:

```text
claim
lease
claimedBy
correção humana
optimistic locking
409
filename padronizado
reprocessamento
```

A autoria desta fase deve ficar registrada corretamente:

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

Leia o código e os testes tentando encontrar:

```text
bug
contrato inconsistente
ordenação não determinística
paginação errada
vazamento de campo interno
problema de API key
acoplamento desnecessário
teste que não prova o que diz provar
regressão
```

Se encontrar apenas preferência de estilo, não trate como finding.

---

## 4. Dados de entrada e referências

Leia pelo menos:

```text
src/reviews/
src/documents/
src/auth/
src/openapi.ts
prisma/schema.prisma
test/review-queue.e2e-spec.ts
test/document-list.e2e-spec.ts
docs/specification.md
docs/architecture.md
docs/decisions/
```

Confira especialmente:

- `GET /reviews` retorna somente `NEEDS_REVIEW`;
- paginação está correta;
- ordenação é `createdAt ASC, id ASC`;
- RQ6 realmente força empate de `createdAt`;
- `id ASC` é realmente comprovado;
- `DocumentStatus.NEEDS_REVIEW` é usado;
- nenhum campo interno aparece na resposta;
- API key protege a rota;
- nenhuma escrita acontece;
- Prisma, processing e storage não foram alterados sem necessidade;
- OpenAPI está coerente.

Os findings anteriores `RQ-003` e `RQ-004` são riscos futuros aceitos. Só volte a tratá-los como problema se encontrar alguma evidência nova de bug atual.

Rode também:

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

O esperado é:

```text
Build: PASS
Lint: PASS
Unit: 15/15
E2E: 86/86
```

---

## 5. Formato de saída

Organize a resposta assim:

### 1. Resultado

```text
APTA PARA REVIEW HUMANA FINAL
```

ou:

```text
NÃO APTA PARA REVIEW HUMANA FINAL
```

### 2. Estado revisado

Mostre branch, HEAD e working tree.

### 3. RQ-001

Diga se foi corrigido e mostre a evidência.

### 4. RQ-002

Diga se foi corrigido e mostre a evidência.

### 5. Findings confirmados

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

### 6. Findings descartados

Liste hipóteses que você investigou e não se confirmaram.

### 7. Riscos aceitos

Registre `RQ-003` e `RQ-004` sem tentar corrigi-los, salvo se surgir evidência nova.

### 8. Validações

Mostre build, lint, unit e E2E.

### 9. Autoria

Registre explicitamente:

```text
A implementação, o código, os testes e as correções da Fase 3.1 são de autoria humana.
O Claude atuou somente como reviewer/orientador nesta etapa.
```

### 10. Decisão final

Diga se a implementação está pronta ou não para a review humana final.

---

## 6. Restrições e limites

Não altere arquivos.

Não implemente correções.

Não faça commit.

Não faça push.

Não faça merge.

Não inicie a Fase 3.2.

Não atribua a si mesmo autoria da implementação, código, testes ou correções.

Pare depois da revisão.
