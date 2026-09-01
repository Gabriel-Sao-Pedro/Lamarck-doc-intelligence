# 05 — Review humana — correções do processamento

## 1. Resultado

**APROVADO PARA MERGE**

Após a primeira revisão humana do processamento, a implementação havia sido reprovada até correção por três findings confirmados:

- `PROC-001` — a falha final persistia `PROCESSING -> FAILED` diretamente, contrariando a state machine aprovada;
- `PROC-002` — a finalização não vinculava de forma suficiente `documentId` e `processingRunId` ao `ProcessingJob` efetivamente claimado;
- `PROC-003` — o intervalo de polling do worker aceitava valores inválidos e poderia resultar em polling agressivo.

As correções foram implementadas pelo **Claude**, a partir do prompt técnico de correção preparado para esses findings.

Depois da implementação das correções, fiz uma checagem humana focada especificamente nos três pontos, nas regressões mais sensíveis e nas validações de build, testes e CI.

Resultado da checagem:

```text
PROC-001: CORRIGIDO
PROC-002: CORRIGIDO
PROC-003: CORRIGIDO

Findings novos: nenhum

PODE FAZER MERGE
```

A implementação corrigida preserva os principais invariantes de concorrência, fencing, retry, recovery e consistência entre `ProcessingJob`, `ProcessingRun`, `Document` e `DocumentResult`.

---

## 2. Estado revisado

### Branch

`feat/document-processing`

### HEAD revisado

`e56f91c18a9e17904e938caabb93feb03e8c8563`

### Commits das correções

- `2fc3570` — correções de código;
- `62682e6` — testes das correções;
- `e56f91c` — documentação das correções.

### CI

- run: `33457178813`
- resultado: `SUCCESS`
- `headSha`: confirmado como correspondente ao HEAD revisado
- E2E executado: SIM
- E2E: `24/24`
- unit tests: `9/9`

### Working tree durante a checagem

A implementação estava limpa, com a review humana anterior mantida intacta e fora das alterações de código feitas pelo Claude.

Não houve alteração de schema ou migration nesta correção.

---

## 3. O que eu conferi

A segunda checagem não repetiu toda a revisão original. O foco foi confirmar se os três findings anteriores haviam sido realmente eliminados e se a correção não introduziu regressões nos invariantes centrais da feature.

Conferi diretamente:

- `src/processing/finalization.service.ts`;
- `src/processing/job-claim.service.ts`;
- `src/processing/processing.service.ts`;
- `src/processing/processing.constants.ts`;
- `src/processing/processing.worker.ts`;
- `src/processing/processing.constants.spec.ts`;
- `test/processing.e2e-spec.ts`;
- `docs/implementation/005-document-processing-findings-fix.md`.

Também confrontei o comportamento corrigido com:

- state machine aprovada;
- regras de claim e lease;
- fencing por `claimToken`;
- limite de 3 tentativas;
- recuperação de lease expirado;
- uso de `ProcessingRun` como histórico;
- responsabilidade de `ProcessingJob.attemptCount`;
- escopo atual do processamento;
- testes P1–P15 já existentes.

Além dos três findings, fiz uma checagem de regressão focada em:

- P1 — claim exclusivo;
- P3 — fencing;
- P9 — retry técnico;
- P11 — recuperação de lease;
- P13 — stale worker;
- P14 — corrida de recuperação;
- P15 — ingestão até resultado persistido.

Todos permaneceram verdes.

---

## 4. Findings confirmados e correções

### PROC-001 — state machine no esgotamento

**Severidade original:** ALTO  
**Status atual:** CORRIGIDO  
**Correção implementada por:** Claude  
**Validação final:** humana

#### Problema original

A implementação anterior permitia que uma falha técnica na última tentativa terminasse em:

```text
PROCESSING -> FAILED
```

Isso contrariava a state machine definida para o projeto:

```text
PROCESSING -> RETRYING
RETRYING -> FAILED
```

O mesmo problema aparecia no cenário de lease expirado quando o job já havia consumido as três tentativas permitidas.

Os testes anteriores validavam corretamente que o estado final era `FAILED`, mas não provavam que `RETRYING` havia sido realmente persistido antes.

#### Correção feita

O Claude alterou a lógica para que uma falha técnica sempre finalize a tentativa atual persistindo primeiro:

```text
PROCESSING -> RETRYING
```

O `ProcessingRun` daquela tentativa é encerrado como falha técnica nesse momento.

A transição posterior para `FAILED` ocorre apenas em uma etapa posterior do claim/resolution:

```text
RETRYING -> FAILED
```

A transição intermediária agora é um estado real no banco, e não apenas uma validação conceitual executada dentro da mesma operação.

#### Comportamento validado

Na terceira falha técnica:

```text
attempt 3
PROCESSING
    ↓
falha técnica
    ↓
RETRYING
    ↓
commit
    ↓
nova resolução do job
    ↓
FAILED
```

Não existe quarta chamada ao provider.

No cenário de lease expirado na tentativa 3:

```text
PROCESSING
lease expirado
attemptCount = 3
    ↓
RETRYING
    ↓
commit
    ↓
FAILED
```

Também sem nova chamada ao provider.

#### Resiliência a crash

Um estado intermediário:

```text
RETRYING + attemptCount >= 3
```

é agora recuperável.

Se o processo cair depois de gravar `RETRYING` e antes de gravar `FAILED`, uma execução posterior consegue concluir:

```text
RETRYING -> FAILED
```

sem chamar novamente o provider e sem criar tentativa adicional.

#### ProcessingRun

A correção não reabre um `ProcessingRun` já terminal.

O run segue o ciclo:

```text
STARTED
→ TECHNICAL_FAILURE
```

uma única vez.

A passagem posterior do documento/job de `RETRYING` para `FAILED` não reescreve o run da tentativa já encerrada.

#### Evidência

A checagem confirmou que:

- `FinalizationService.finalize` não grava `FAILED`;
- falha técnica grava somente `RETRYING`;
- a única escrita de `FAILED` restante ocorre no `JobClaimService`;
- essa escrita é precedida por validação `RETRYING -> FAILED`;
- o job já precisa estar persistido em `RETRYING`.

Foi conferido por busca no código que não permaneceu outro ponto de escrita que gere `PROCESSING -> FAILED`.

#### Testes

P10 foi fortalecido para provar:

- terceira falha técnica;
- `RETRYING` persistido;
- resolução posterior para `FAILED`;
- exatamente 3 chamadas ao provider;
- nenhuma quarta chamada.

P12 foi fortalecido para provar:

- lease expirado na última tentativa;
- `RETRYING` persistido;
- resolução posterior para `FAILED`;
- nenhuma chamada adicional ao provider.

**Conclusão PROC-001:** corrigido.

---

### PROC-002 — vínculo entre job, documento e ProcessingRun

**Severidade original:** ALTO  
**Status atual:** CORRIGIDO  
**Correção implementada por:** Claude  
**Validação final:** humana

#### Problema original

A finalização recebia dados redundantes de identidade da tentativa.

O fencing validava corretamente:

- `jobId`;
- `claimToken`;
- lease;
- status atual.

Porém, `documentId` e `processingRunId` eram recebidos separadamente e não estavam suficientemente vinculados ao `ProcessingJob` claimado.

Isso permitia, em caso de erro interno de chamada, um cenário conceitual como:

```text
job A
claimToken A
documentId B
processingRunId B
```

Mesmo sem ser uma entrada HTTP controlada por usuário, esse cenário violava o princípio de que o job claimado deve ser a raiz de confiança da finalização.

#### Correção feita — documentId

O Claude removeu `documentId` como parâmetro independente da finalização.

Agora:

```text
documentId = job.documentId
```

O documento é derivado diretamente do `ProcessingJob` que passou pelas validações de fencing.

Isso elimina essa classe de inconsistência por construção.

#### Correção feita — ProcessingRun

O `processingRunId` continua identificando o run iniciado para a tentativa, mas o run é carregado e validado dentro da transação de finalização.

Antes de qualquer escrita, o código confirma que:

```text
run.documentId === job.documentId
run.attemptNumber === job.attemptCount
run.status === STARTED
```

Somente depois dessas verificações a finalização pode:

- atualizar o run;
- criar `DocumentResult`;
- mudar o status do documento;
- limpar claim/lease.

#### Cenário adverso conferido

Foi testado:

```text
job A + claimToken A válidos
+
processingRunId pertencente ao job/documento B
```

Resultado esperado e confirmado:

- finalização rejeitada;
- documento A não alterado;
- documento B não alterado;
- run B não alterado;
- nenhum `DocumentResult` indevido criado;
- claim de A preservado.

Isso é importante porque uma finalização inválida não pode consumir ou limpar o ownership válido do job.

#### Relação com fencing

O fencing permanece baseado em:

- `jobId`;
- `claimToken`;
- status;
- lease ainda válido.

A correção de `PROC-002` não substitui fencing. Ela adiciona a validação de integridade relacional entre:

```text
ProcessingJob
    ↓
Document
    ↓
ProcessingRun
    ↓
DocumentResult
```

#### Regressão de stale worker

P3 e P13 continuaram passando.

Um worker antigo, com token substituído ou lease perdido, continua sem conseguir:

- criar resultado;
- alterar run;
- mudar status;
- limpar o claim atual.

**Conclusão PROC-002:** corrigido.

---

### PROC-003 — sanitização do polling interval

**Severidade original:** BAIXO  
**Status atual:** CORRIGIDO  
**Correção implementada por:** Claude  
**Validação final:** humana

#### Problema original

A configuração:

`PROCESSING_WORKER_POLL_INTERVAL_MS`

era convertida diretamente com `Number(...)`.

Isso permitia resultados como:

- `NaN`;
- `0`;
- número negativo;
- decimal;
- `Infinity`.

Uma configuração ruim poderia causar comportamento imprevisível ou polling excessivamente agressivo.

#### Correção feita

Foi criada uma regra explícita de parsing.

O valor só é aceito quando:

- é uma representação numérica válida;
- é inteiro;
- é seguro;
- é maior que zero.

Caso contrário, o worker usa o fallback:

`1000 ms`

Não foi adicionada dependência nova para isso.

#### Casos conferidos

| Entrada | Resultado |
|---|---|
| variável ausente | fallback 1000 ms |
| valor válido | valor configurado |
| `0` | fallback |
| negativo | fallback |
| texto inválido | fallback |
| decimal | fallback |
| `Infinity` | fallback |

O worker usa a constante já sanitizada e não faz parsing paralelo do ambiente.

#### Testes

Foram adicionados testes unitários específicos em `processing.constants.spec.ts`.

A suíte unitária final passou:

`9/9`

**Conclusão PROC-003:** corrigido.

---

## 5. Decisões técnicas relevantes

### A state machine continua sendo a fonte de verdade

A correção não alterou architecture ou ADR para acomodar o código.

Foi o código que passou a respeitar:

```text
RECEIVED -> PROCESSING
PROCESSING -> COMPLETED
PROCESSING -> NEEDS_REVIEW
PROCESSING -> RETRYING
RETRYING -> PROCESSING
RETRYING -> FAILED
```

Isso preserva a decisão arquitetural original.

### RETRYING agora é observável

A principal diferença da correção do `PROC-001` é que `RETRYING` deixou de ser apenas uma etapa lógica transitória do código.

Ele é persistido e pode ser observado entre duas operações.

Isso melhora:

- rastreabilidade;
- auditoria;
- recuperação após crash;
- aderência à state machine;
- previsibilidade para futuros consumidores de status.

### O job claimado é a raiz de confiança

A correção do `PROC-002` simplificou a finalização.

Em vez de confiar em IDs independentes, a lógica deriva o documento do próprio job.

Isso reduz o número de invariantes que o chamador precisa manter manualmente.

### ProcessingRun continua histórico

A correção não transformou `ProcessingRun` em fonte operacional.

Continuam válidas as responsabilidades:

```text
ProcessingJob.attemptCount
→ número operacional da tentativa

ProcessingJob + claimToken + lease
→ ownership

ProcessingRun
→ histórico/proveniência
```

### Nenhuma mudança de schema

As correções couberam no modelo já existente.

Não houve:

- migration nova;
- alteração de migration anterior;
- campo novo;
- redesign de entidade.

### Escopo continuou controlado

Não entrou nesta correção:

- consulta HTTP;
- listagem;
- fila humana de revisão;
- autenticação;
- PDF;
- provider real;
- frontend;
- nome padronizado.

---

## 6. Riscos não bloqueantes

### Audit conhecido

`npm audit` e `npm audit --omit=dev` continuam reportando 3 vulnerabilidades `high` associadas a `deepmerge-ts` via tooling do Prisma.

Esse finding já era conhecido antes desta correção e não foi introduzido por ela.

Não foi usado `npm audit fix --force`.

### Provider/proveniência

A proveniência continua sendo fixada no momento do claim.

Isso permanece aceitável para o provider fake e estático desta fase.

Quando existir provider real ou configuração dinâmica de modelo/prompt, essa decisão deverá ser revisitada para garantir que a proveniência persistida corresponda exatamente à execução realizada.

### Worker simples

O worker continua com concorrência baixa e um `processOnce` por ciclo/instância.

Isso é suficiente para a fatia vertical atual, mas não representa ainda uma configuração de produção para picos elevados.

Nenhum desses riscos impede o merge desta etapa.

---

## 7. Validações / CI

### Validações locais

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit tests | PASS — 9/9 |
| E2E | PASS — 24/24 |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Docker Compose | PASS |
| `npm audit` | FAIL — finding conhecido em `deepmerge-ts` |
| `npm audit --omit=dev` | FAIL — mesmo finding conhecido |

### Regressões críticas conferidas

| Caso | Resultado |
|---|---|
| P1 — claim exclusivo | PASS |
| P3 — fencing | PASS |
| P9 — retry técnico | PASS |
| P11 — lease recovery | PASS |
| P13 — stale worker | PASS |
| P14 — recovery concorrente | PASS |
| P15 — ingestão até resultado persistido | PASS |

### Correções específicas

| Caso | Resultado |
|---|---|
| P10 — terceira falha técnica | PASS |
| P12 — lease expirado esgotado | PASS |
| nenhuma quarta chamada ao provider | PASS |
| mismatch de ProcessingRun | PASS |
| claim preservado em finalização inválida | PASS |
| polling válido | PASS |
| polling inválido -> fallback | PASS |

### CI

Run:

`33457178813`

Resultado:

`SUCCESS`

HEAD confirmado:

`e56f91c18a9e17904e938caabb93feb03e8c8563`

A CI executou a suíte E2E com PostgreSQL e terminou verde.

---

## 8. Decisão de merge

**PODE FAZER MERGE**

Os três findings levantados na primeira revisão foram corrigidos pelo Claude e depois verificados em uma checagem humana focada.

Situação final:

```text
PROC-001
→ corrigido

PROC-002
→ corrigido

PROC-003
→ corrigido

regressões críticas
→ não encontradas

findings novos
→ nenhum

CI
→ verde
```

Não identifiquei motivo técnico restante para impedir o merge da etapa de processamento.

A decisão não se baseia apenas na CI verde. Os invariantes que haviam causado a reprovação anterior foram conferidos diretamente no código e nos testes.

---

## 9. Próximo passo

Versionar esta review humana junto com a review anterior, preservando as duas etapas da história:

```text
04-document-processing-review.md
→ primeira revisão
→ REPROVADO ATÉ CORREÇÃO
→ PROC-001 / PROC-002 / PROC-003

05-document-processing-findings-review.md
→ checagem após correções implementadas pelo Claude
→ três findings corrigidos
→ PODE FAZER MERGE
```

Depois:

```text
commit das reviews/rastreabilidade
        ↓
push da branch feat/document-processing
        ↓
CI verde
        ↓
merge fast-forward em main
        ↓
push de main
        ↓
CI verde em main
```

Somente depois do processamento estar incorporado em `main` deve começar a próxima etapa funcional da vertical slice: consulta do resultado.
