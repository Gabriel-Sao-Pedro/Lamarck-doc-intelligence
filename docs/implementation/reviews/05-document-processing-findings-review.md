# 05 — Review — correções do processamento

## 1. Resultado

**APROVADO PARA MERGE**

Na primeira revisão do processamento eu tinha confirmado três problemas:

- `PROC-001` — o esgotamento de tentativas podia chegar em `FAILED` sem persistir `RETRYING`;
- `PROC-002` — a finalização aceitava IDs que não estavam suficientemente amarrados ao job claimado;
- `PROC-003` — o intervalo de polling aceitava valores inválidos.

As correções foram feitas e eu voltei nesses três pontos para conferir o
comportamento final. Não encontrei finding novo.

## 2. Estado revisado

- branch: `feat/document-processing`
- HEAD das correções: `e56f91c18a9e17904e938caabb93feb03e8c8563`
- CI: `33457178813` — `SUCCESS`
- unit: `9/9`
- E2E: `24/24`

## 3. O que eu conferi

Eu não repeti toda a review anterior. Foquei no que tinha sido reprovado e nas
regressões que poderiam ser afetadas:

- passagem real por `RETRYING`;
- limite de três tentativas;
- recuperação depois de lease expirado;
- `claimToken`;
- stale worker;
- vínculo entre `ProcessingJob`, `Document` e `ProcessingRun`;
- sanitização do polling;
- ausência de migration nova;
- regressões de ingestão e processing.

## 4. Findings confirmados

### PROC-001 — corrigido

Uma falha técnica termina a tentativa atual em `RETRYING`.

Quando não existe nova tentativa disponível, a evolução para `FAILED` acontece
depois, partindo de `RETRYING`.

Com isso a state machine continua coerente:

```text
PROCESSING -> RETRYING -> FAILED
```

Também conferi que a recuperação de lease não cria uma quarta chamada ao
provider.

### PROC-002 — corrigido

A finalização deixou de confiar em um `documentId` recebido separadamente.

O documento agora é obtido a partir do job claimado e o `ProcessingRun` é
validado antes das escritas finais.

O cenário adverso de run incompatível não grava resultado e não libera o claim
como se estivesse tudo certo.

### PROC-003 — corrigido

O polling interval agora só aceita inteiro positivo e seguro.

Valores ausentes, zero, negativos, texto, decimal e `Infinity` usam o fallback
de `1000 ms`.

## 5. Decisões técnicas relevantes

A correção preservou as decisões que já estavam aprovadas:

- PostgreSQL continua sendo a fila;
- `SKIP LOCKED` continua limitado ao claim;
- provider continua fora da transação;
- `ProcessingJob` continua sendo a fonte operacional;
- `ProcessingRun` continua sendo histórico;
- `claimToken` continua protegendo finalização de stale worker;
- nenhuma migration foi necessária.

## 6. Riscos não bloqueantes

Continuam conhecidos:

- provider fake;
- worker simples no mesmo processo;
- finding de `npm audit` em `deepmerge-ts` ligado ao tooling do Prisma.

Nenhum deles foi introduzido por esta correção.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 9/9 |
| E2E | PASS — 24/24 |
| CI | PASS — `33457178813` |
| `npm audit` | FAIL — finding conhecido |

Os testes específicos dos três findings também passaram.

## 8. Decisão de merge

**PODE FAZER MERGE**

Os três problemas que bloquearam a primeira review foram corrigidos e a
regressão principal ficou verde.

## 9. Próximo passo

Versionar esta review junto da primeira para deixar visível a sequência:

```text
review inicial
→ reprovação

correção
→ nova checagem
→ aprovação
```

Depois disso, fechar a branch de processing e seguir para a consulta HTTP.
