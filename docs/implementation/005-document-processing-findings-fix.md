# Relatório de Implementação — Correção dos findings do processamento

## 1. Objetivo

Corrigir os três findings confirmados na revisão humana do processamento
(`docs/implementation/reviews/04-document-processing-review.md`), sem
reabrir a feature inteira e sem implementar consulta HTTP. A implementação
principal anterior (`docs/implementation/004-document-processing.md`) foi
feita por mim (Claude); esta tarefa é uma correção baseada exclusivamente
nos três findings recebidos da revisão humana.

## 2. PROC-001 — `PROCESSING -> FAILED` direto

### Causa

Na terceira falha técnica e na recuperação de lease expirado na última
tentativa, o código validava `PROCESSING -> RETRYING -> FAILED` só
conceitualmente (chamadas a `assertValidTransition`), mas persistia
`FAILED` diretamente, numa única escrita, dentro da mesma transação que
detectava o esgotamento. Na prática, o banco nunca via `RETRYING` — o que
divergia da state machine aprovada e comprometia a auditabilidade.

### Correção

`FinalizationService.finalize` (`src/processing/finalization.service.ts`)
agora, para `TECHNICAL_FAILURE`, **sempre** persiste `Document.status =
RETRYING`, nunca `FAILED` — independentemente de a tentativa ser a última
ou não. Essa é uma transação própria, que sempre commita `RETRYING` como
estado real e observável.

A resolução de "`RETRYING` esgotado → `FAILED`" passou a acontecer
**numa transação separada e posterior**, dentro de
`JobClaimService.claimNextEligibleJob`
(`src/processing/job-claim.service.ts`): quando a busca de trabalho
encontra um job em `RETRYING` (sem `claimedBy`) cujo `attemptCount` já
esgotou o limite (`nextAttempt > MAX_ATTEMPTS`), ela resolve
`RETRYING -> FAILED` ali mesmo, sem chamar o provider, e retorna sem
reivindicar nada.

O mesmo princípio se aplica à recuperação de lease expirado, que também
foi dividida em duas fases (dois commits separados, não duas escritas na
mesma transação):

1. **Fase 1** (`recoverExpiredLease`): encontra o job em `PROCESSING` com
   lease vencido, fecha o `ProcessingRun` da tentativa anterior como
   `TECHNICAL_FAILURE`/`LEASE_EXPIRED`, persiste `PROCESSING -> RETRYING` e
   limpa claim/lease. Retorna `null` — não reivindica nada nesta chamada.
2. **Fase 2**: a *próxima* chamada a `claimNextEligibleJob` (do mesmo
   worker, ou de outro) encontra o job já em `RETRYING` e resolve, na
   lógica unificada acima: nova tentativa (`RETRYING -> PROCESSING`, se
   ainda houver tentativa) ou `RETRYING -> FAILED` (se esgotado) — nunca
   chamando o provider nesse segundo caso.

Como as duas fases são transações comitadas separadamente, o estado
`RETRYING` é real e recuperável mesmo se o processo cair exatamente entre
elas — a próxima busca de trabalho (de qualquer worker) simplesmente
encontra o job em `RETRYING` e continua da fase 2, sem repetir a fase 1
(o `ProcessingRun` da tentativa antiga já está fechado).

### `RETRYING` é persistido?
Sim, em uma transação própria e commitada — tanto no caminho normal de
falha técnica quanto na recuperação de lease expirado.

### Como chega a `FAILED`
Só via `RETRYING -> FAILED`, dentro de `JobClaimService`, na chamada de
claim seguinte ao esgotamento — nunca dentro da mesma transação que
persistiu `RETRYING`.

### Existe `PROCESSING -> FAILED` direto?
Não. Confirmado por inspeção (`grep -n "'FAILED'" src/processing/*.ts`): a
única escrita de `status: 'FAILED'` do código está em
`job-claim.service.ts`, imediatamente após `assertValidTransition('RETRYING',
'FAILED')`, e só é alcançada quando o job já estava lido como `RETRYING`
nesta mesma transação — nunca a partir de `PROCESSING`.

### Quarta chamada ao provider é possível?
Não. A resolução de esgotamento (fase 2, tanto para falha técnica normal
quanto para lease expirado) nunca chama `provider.process(...)` — ela
retorna `null` do claim antes de qualquer chance de chamada ao provider.
Confirmado no teste P10 com um provider que conta chamadas.

## 3. PROC-002 — IDs não vinculados ao job claimado

### Causa

`FinalizationService.finalize` recebia `documentId` e `processingRunId`
como parâmetros independentes do `jobId`/`claimToken`. O fencing validava
corretamente o job (via `jobId` + `claimToken` + lease + status), mas nada
impedia, numa chamada interna incorreta, que `documentId`/`processingRunId`
apontassem para outro documento — o fencing do job passaria, mas a escrita
poderia atingir o `ProcessingRun`/`Document`/`DocumentResult` errados.

### Correção

`documentId` deixou de existir como parâmetro de `finalize`
(`FinalizeParams` agora só tem `jobId`, `processingRunId`, `claimToken`,
`outcome`) — **essa classe de erro foi eliminada por construção**, não
apenas validada. `documentId` é sempre derivado do `ProcessingJob` já
carregado e validado pelo fencing (`const documentId = job.documentId`).

`processingRunId` continua vindo do claim/orquestrador (não há como evitar
isso sem redesenhar o fluxo claim → provider → finalize, fora de escopo),
mas agora é carregado dentro da própria transação de finalização e validado
contra o job antes de qualquer escrita:

```ts
const run = await tx.processingRun.findUnique({ where: { id: params.processingRunId } });
const runValid =
  run !== null &&
  run.documentId === documentId &&        // pertence ao mesmo documento do job
  run.attemptNumber === job.attemptCount && // é a tentativa atual do job, não uma antiga
  run.status === 'STARTED';                 // ainda aguarda finalização
```

Se qualquer uma dessas condições falhar, `finalize` retorna `'STALE'` sem
gravar nada — mesmo resultado usado para fencing de worker antigo, já que
semanticamente também é "esta finalização não é válida, abandone".

### Ordem de segurança implementada

1. carregar job (por `jobId`);
2. validar `claimToken`, lease, `Document.status === PROCESSING`;
3. derivar `documentId` do job;
4. carregar e validar `ProcessingRun` contra job/documento/tentativa;
5. só então gravar `ProcessingRun`/`DocumentResult`/`Document.status`;
6. limpar claim/lease.

Nenhuma escrita acontece antes do passo 4 confirmar as relações.

### `documentId` derivado do job?
Sim — não é mais aceito como parâmetro.

### `ProcessingRun` validado?
Sim — `documentId`, `attemptNumber` e `status` conferidos contra o job
antes de qualquer escrita.

### Tentativa validada?
Sim — `run.attemptNumber === job.attemptCount` garante que o run pertence
à tentativa **atual** do job, não a uma tentativa antiga/de outro job.

### Mismatch rejeitado antes de escrita?
Sim — a validação do run acontece antes de qualquer `update`/`create`;
testado explicitamente (seção 5).

### Claim preservado em finalização inválida?
Sim — como a rejeição acontece antes de qualquer escrita, `claimedBy`,
`claimToken` e `leaseExpiresAt` do job legítimo continuam intactos.

## 4. PROC-003 — intervalo de polling não sanitizado

### Causa

`WORKER_POLL_INTERVAL_MS` era `Number(process.env.PROCESSING_WORKER_POLL_INTERVAL_MS ?? 1000)`
— sem validar o resultado. `NaN`, `"0"`, negativo, decimal ou `"Infinity"`
passariam direto, podendo causar polling imediato ou agressivo.

### Regra de parsing

`parsePositiveIntervalMs(rawValue, fallbackMs)`
(`src/processing/processing.constants.ts`), pura e testável:

1. se `rawValue` for `undefined`, usa o fallback;
2. o valor (após `trim()`) precisa bater com `/^\d+$/` (só dígitos —
   rejeita sinal negativo, ponto decimal, texto, `Infinity`, vazio);
3. depois de convertido, precisa ser um inteiro seguro e `> 0`;
4. qualquer falha nos passos 2–3 usa o fallback.

### Fallback

`DEFAULT_WORKER_POLL_INTERVAL_MS = 1000` (mesmo valor padrão já usado
antes da correção).

### Casos inválidos cobertos

`0`, negativo, texto inválido, variável ausente, decimal, `Infinity` — 7
testes de unidade em `src/processing/processing.constants.spec.ts`.

## 5. Testes adicionados/alterados

| Teste | O que mudou/foi adicionado |
|---|---|
| P3 | Ajustado para o claim de recuperação em duas fases (PROC-001) |
| P10 | Reescrito: prova `RETRYING` persistido antes de `FAILED`, conta chamadas ao provider (exatamente 3, nunca 4) |
| P11 | Reescrito: prova a fase 1 (`RETRYING` persistido, observável) separada da fase 2 (nova tentativa) |
| P12 | Reescrito: mesma separação em duas fases; confirma `FAILED` sem provider na fase 2 |
| P13 | Ajustado para o claim de recuperação em duas fases |
| P14 | Ajustado: a corrida testada agora é na fase 2 (nova tentativa a partir de `RETRYING`), que é onde duas tentativas duplicadas poderiam nascer |
| PROC-002 (novo) | Prova que `finalize` rejeita um `processingRunId` que pertence a outro job/documento, sem alterar nenhum dos dois documentos, sem criar `DocumentResult` indevido e sem limpar o claim do job legítimo |
| `processing.constants.spec.ts` (novo, 7 casos) | `parsePositiveIntervalMs`: valor válido, `0`, negativo, texto inválido, ausente, decimal, `Infinity` |

Nenhum teste P1–P15 foi removido ou teve cobertura reduzida — todos
continuam presentes, ajustados apenas onde o novo fluxo em duas fases
exigia uma chamada adicional ao claim.

O mismatch de `documentId` não tem teste dedicado porque deixou de ser
parametrizável — não há mais como uma chamada externa fornecer um
`documentId` divergente, então essa classe de erro não existe mais para
testar (eliminada por construção, não por validação).

## 6. Resultados reais

- `npm test` → 3/3 arquivos, 9/9 testes PASS (7 novos de
  `processing.constants.spec.ts`).
- `npm run test:e2e` → 3/3 arquivos, 24/24 testes PASS (23 anteriores + 1
  novo teste PROC-002; P10–P14 continuam contados como estavam, ajustados
  em conteúdo, não em quantidade).
- `npm run build`, `npm run lint`, `npm run prisma:validate`, `npm run
  prisma:generate`, `docker compose config`: todos PASS.
- `npm audit` / `npm audit --omit=dev`: continuam reportando as mesmas 3
  vulnerabilidades `high` conhecidas em `deepmerge-ts` (tooling do Prisma).
  Nenhuma dependência mudou nesta correção; não apliquei
  `npm audit fix --force` nem atualizei o Prisma.

## 7. CI

Nenhuma alteração de workflow foi necessária — a suíte `test:e2e` já
executava contra o PostgreSQL de serviço; os testes ajustados/adicionados
entram automaticamente nela.

## 8. Riscos restantes

- A recuperação de lease expirado e o esgotamento de retry agora exigem
  duas chamadas de claim (duas transações) em vez de uma. Isso adiciona
  uma pequena latência (até um ciclo de polling) entre um job ficar em
  `RETRYING` esgotado e efetivamente virar `FAILED`, ou entre um lease
  expirar e a nova tentativa realmente começar. Aceitável para esta fase —
  é justamente o preço de `RETRYING` ser um estado real, não uma
  passagem invisível.
- `npm audit` continua reportando `deepmerge-ts` (tooling, não runtime) —
  risco já conhecido e registrado nos relatórios anteriores, sem mudança.
- Os demais riscos já registrados no relatório 004 (proveniência estática
  do provider fake, concorrência simples do worker, `CONFIDENCE_THRESHOLD`
  como configuração determinística) continuam válidos e não foram afetados
  por esta correção.

## 9. Escopo

Alterados apenas: `src/processing/finalization.service.ts`,
`src/processing/job-claim.service.ts`, `src/processing/processing.constants.ts`,
`src/processing/processing.service.ts` (uma linha, removendo `documentId`
da chamada a `finalize`), `test/processing.e2e-spec.ts` e o novo
`src/processing/processing.constants.spec.ts`. Nenhuma alteração em
ingestão, controllers HTTP, schema, migrations, documentos humanos
(`specification.md`, `architecture.md`, ADRs), review humana ou prompt
histórico 04. Nenhuma consulta HTTP, autenticação, PDF, provider real,
frontend ou nome padronizado foi implementado.

## 10. Proveniência

A implementação principal anterior do processamento
(`docs/implementation/004-document-processing.md`) foi feita por mim
(Claude). Esta correção também foi feita por mim, a partir dos três
findings (`PROC-001`, `PROC-002`, `PROC-003`) confirmados na revisão
humana em `docs/implementation/reviews/04-document-processing-review.md`.
Não fiz — nem faço — a checagem de que esses findings foram efetivamente
corrigidos; essa confirmação é humana e vem depois deste relatório.
