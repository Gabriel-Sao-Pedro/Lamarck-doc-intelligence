# Relatório de Implementação — Processamento de documentos

## 1. Objetivo

Implementar a segunda parte funcional da vertical slice: consumir um
`ProcessingJob` pendente, fazer claim seguro no PostgreSQL, processar por um
provider fake, validar o resultado, persistir histórico e resultado, e levar
o `Document` até `COMPLETED`, `NEEDS_REVIEW` ou `FAILED`. Escopo definido em
`docs/ai/prompts/claude/04-claude-document-processing-prompt.md` e ajustado
por `docs/ai/prompts/claude/04A-claude-document-processing-scope-clarification-pormpt.md`
(ver seção 20 abaixo).

## 2. Fluxo do worker

```
ProcessingWorker (loop de polling, mesmo processo NestJS)
  -> ProcessingService.processOnce(workerId)
     -> JobClaimService.claimNextEligibleJob(workerId)   [transação curta]
     -> DocumentAiProvider.process(input)                [fora de transação]
     -> validateResult(resultado)                        [pura, em memória]
     -> FinalizationService.finalize(...)                [transação curta, com fencing]
```

O worker roda no mesmo processo NestJS, mas separado por código
(`src/processing/`) da API (`src/documents/`), como previsto em
`docs/architecture.md` §4.

## 3. Claim atômico e `SKIP LOCKED`

`JobClaimService.claimNextEligibleJob` (`src/processing/job-claim.service.ts`)
abre uma única transação Prisma curta que:

1. seleciona o job elegível mais antigo com SQL parametrizado
   (`SELECT ... FOR UPDATE OF pj SKIP LOCKED`), dentro de `tx.$queryRaw`;
2. se ninguém for elegível, retorna `null` sem mais nenhuma escrita;
3. grava `claimToken`, `claimedBy`, `claimedAt`, `leaseExpiresAt` e
   incrementa `attemptCount`;
4. cria o `ProcessingRun` da nova tentativa (`status: STARTED`);
5. muda `Document.status` para `PROCESSING`;
6. commita.

Um job é elegível quando: `Document.status` é `RECEIVED` ou `RETRYING` e
`ProcessingJob.claimedBy` é nulo, **ou** `Document.status` é `PROCESSING` e
`leaseExpiresAt` já passou (recuperação de lease, seção 7). O
`FOR UPDATE OF pj SKIP LOCKED` garante que, quando dois workers disputam o
mesmo job, o perdedor simplesmente não vê aquela linha — sem bloquear
esperando (testado em P1/P14).

Optei por SQL bruto só para o `SELECT ... FOR UPDATE SKIP LOCKED`
(Prisma não expressa isso via ORM) e mantive todo o resto do claim (updates,
create do `ProcessingRun`) em chamadas normais do Prisma Client, dentro da
mesma transação — não criei um repositório genérico só para esconder o SQL.

## 4. Por que o provider roda fora da transação

A transação de claim termina antes da chamada ao provider
(`ProcessingService.processOnce` só chama `provider.process(...)` **depois**
que `claimNextEligibleJob` já retornou, ou seja, depois do commit). O
provider real do ambiente pode levar até 40s — manter um lock de banco
durante esse tempo bloquearia outros workers e outras operações na mesma
tabela sem necessidade (`docs/architecture.md` §10, ADR-002). Testado
diretamente em P4: um provider de teste lê o `ProcessingJob` numa consulta
independente, fora de qualquer transação, no momento em que é chamado, e
confirma que o claim já está commitado e visível nesse ponto.

## 5. `claimToken` e fencing

Cada claim real gera um `claimToken` novo (`randomUUID()`), nunca reaproveita
o anterior. A finalização (`FinalizationService.finalize`,
`src/processing/finalization.service.ts`) só grava algo se, numa leitura
fresca dentro da própria transação de finalização:

- o job existe;
- `claimToken` gravado é exatamente igual ao apresentado;
- `Document.status` ainda é `PROCESSING`;
- `leaseExpiresAt` ainda está no futuro.

Se qualquer uma dessas condições falhar, a finalização é abandonada
(`'STALE'`), sem escrever `ProcessingRun`, `DocumentResult` ou
`Document.status`. Testado em P3 (finalização com token antigo é rejeitada)
e P13 (um worker que perdeu o lease não sobrescreve o que o worker
recuperador já fez).

## 6. Lease

Duração: `LEASE_DURATION_MS = 60_000` (60s) —
`src/processing/processing.constants.ts`.

- máximo informado para o provider real do ambiente: 40s;
- margem de segurança escolhida: 20s;
- é uma configuração da Fase 1, não uma garantia futura — se o timeout real
  do provider mudar, este valor precisa ser revisto junto.

O lease é comparado no banco (`leaseExpiresAt` lido dentro da transação de
finalização e da transação de claim), nunca só em memória.

## 7. Recuperação de lease expirado

Não existe reaper separado. A própria busca de trabalho
(`claimNextEligibleJob`) é o gatilho: quando encontra um job em `PROCESSING`
com `leaseExpiresAt` vencido, ela mesma:

1. localiza a `ProcessingRun` que ficou parada em `STARTED` para aquele
   `attemptCount` e a fecha como `TECHNICAL_FAILURE` /
   `technicalErrorType: "LEASE_EXPIRED"`;
2. calcula `nextAttempt = attemptCount + 1`;
3. se `nextAttempt` ultrapassar o limite de 3, finaliza o documento em
   `FAILED` e libera o job (sem chamar o provider — testado em P12);
4. senão, faz o claim de uma nova tentativa normalmente (novo
   `claimToken`, novo `ProcessingRun`, `Document` volta a `PROCESSING`).

Como esse passo inteiro acontece dentro da mesma transação com
`FOR UPDATE SKIP LOCKED`, dois workers não conseguem recuperar e reiniciar o
mesmo lease expirado ao mesmo tempo (testado em P14: dos dois workers que
disputam a recuperação, só um consegue e só uma nova tentativa é criada).

## 8. Fake provider

`FakeDocumentAiProvider` (`src/processing/provider/fake-document-ai-provider.ts`)
implementa a interface `DocumentAiProvider`
(`src/processing/provider/document-ai-provider.ts`) e nunca lê o conteúdo
real do arquivo. Um campo interno `mode` (`SUCCESS` por padrão) controla o
cenário devolvido; `setMode()` permite reconfigurar a mesma instância nos
testes. Os três modos:

- `SUCCESS`: `IDENTITY_DOCUMENT` fictício com confiança alta (0.95) e os
  cinco campos exigidos (`fullName`, `parentage`, `birthDate`,
  `documentNumber`, `issuingAuthority`), todos com dados inventados;
- `NEEDS_REVIEW`: mesma estrutura, mas confiança baixa (0.4), para exercitar
  a revisão semântica;
- `TECHNICAL_FAILURE`: lança `ProviderTechnicalError`, para exercitar retry.

**Nota de correção durante a implementação:** a primeira versão recebia o
modo como parâmetro de construtor (`constructor(mode = 'SUCCESS')`). Isso
quebrou a injeção de dependência do NestJS fora dos testes que fazem
override manual — o Nest tentava resolver esse parâmetro como uma
dependência injetável e falhava ao montar o `AppModule` completo (confirmado
por `npm run test:e2e` rodando a suíte inteira, não só a de processamento
isoladamente). Corrigido: o campo `mode` agora é interno, com valor padrão
`SUCCESS`, e só é alterado via `setMode()` — o construtor não recebe
parâmetros.

## 9. Validação do resultado

`validateResult` (`src/processing/validation/result-validator.ts`), pura e
síncrona:

1. `documentType` precisa ser `IDENTITY_DOCUMENT`;
2. os cinco campos precisam existir e ser strings não vazias;
3. `birthDate` precisa bater com o formato `AAAA-MM-DD`;
4. `confidence` precisa ser `>= CONFIDENCE_THRESHOLD` (0.7 — configuração
   determinística da Fase 1, sem base estatística real, só para separar os
   dois cenários fictícios do provider fake).

Qualquer falha nessas checagens retorna `NEEDS_REVIEW` em vez de `VALID`.
Não valida CPF/RG real, não faz nenhuma análise visual — a "etapa 2" contra o
documento é simulada nesta fase, como previsto em `docs/architecture.md`
§15.

## 10. `ProcessingRun`

Decisão: criar o `ProcessingRun` **no momento do claim** (`status: STARTED`)
e atualizá-lo **uma única vez**, na finalização, para o status terminal
(`SUCCEEDED`, `SEMANTIC_MISMATCH` ou `TECHNICAL_FAILURE`) — não criar um novo
run só no final da tentativa.

Preferi essa abordagem (uma das duas aceitáveis pelo prompt) porque bate
literalmente com ADR-002 ("cada tentativa iniciada também gera um
`ProcessingRun` com o mesmo número") e com o enum `ProcessingRunStatus`, que
já tem `STARTED` como valor esperado — criar o run só no final deixaria esse
valor sem uso real. Isso não viola a imutabilidade do ADR-005: cada run é
escrito exatamente duas vezes (criação em `STARTED`, depois uma única
atualização para o status terminal), nunca reescrito depois de já estar
terminal.

`attemptNumber` só registra o histórico; `ProcessingJob.attemptCount`
continua sendo a única fonte operacional do limite de tentativas (testado em
P7).

## 11. `DocumentResult`

Criado na finalização para `SUCCESS` **e** para `NEEDS_REVIEW` — o resultado
da IA é preservado mesmo quando o documento precisa de revisão humana,
porque ele é útil para quem for revisar (`docs/architecture.md` §17,
prompt §13). Nunca criado para `TECHNICAL_FAILURE` (não haveria resultado
real para guardar).

Conteúdo de `data` (JSON): `{ fields: {...}, confidence: number }`.
`documentType` e `schemaVersion` (`identity-document-v1`) também são
gravados. `Document.status` continua sendo a única fonte do estado do
documento — `DocumentResult` não duplica isso.

## 12. Transições de estado

Centralizadas em `assertValidTransition`
(`src/processing/state-transition.ts`), que reproduz exatamente a tabela de
`docs/architecture.md` §12 e lança se alguém tentar uma transição fora dela.
Usada tanto no claim quanto na finalização, então nenhuma mudança de
`Document.status` no módulo de processamento contorna essa regra central.

- Sucesso: `RECEIVED -> PROCESSING -> COMPLETED`.
- Revisão semântica: `RECEIVED -> PROCESSING -> NEEDS_REVIEW` (não consome
  retry).
- Falha técnica com tentativa restante: a finalização grava
  `PROCESSING -> RETRYING` (validado); a volta para `PROCESSING` acontece no
  próximo claim, quando o job é reivindicado de novo.
- Falha técnica esgotada: a finalização valida `PROCESSING -> RETRYING` e
  depois `RETRYING -> FAILED` antes de gravar `FAILED` diretamente — a
  passagem por `RETRYING` é validada conceitualmente (não fica persistida
  como um estado intermediário separado), sem pular a checagem da state
  machine.
- Recuperação de lease esgotada: mesmo padrão, dentro do claim.

## 13. Testes

15 casos exigidos pelo prompt (P1–P15), todos em
`test/processing.e2e-spec.ts` contra PostgreSQL real (mesmo padrão dos
testes de ingestão), exceto onde indicado:

| Caso | Cobre |
|---|---|
| P1 | Claim exclusivo entre dois workers concorrentes |
| P2 | `claimToken` novo a cada tentativa real |
| P3 | Fencing rejeita finalização com token desatualizado |
| P4 | Provider chamado só depois do commit da transação de claim |
| P5 | Sucesso termina em `COMPLETED` |
| P6 | `DocumentResult` criado e ligado ao `ProcessingRun` correto |
| P7 | `ProcessingRun` preserva histórico/proveniência sem virar fonte operacional |
| P8 | Baixa confiança termina em `NEEDS_REVIEW` sem consumir retry técnico |
| P9 | Falha técnica com tentativa restante vai para `RETRYING` |
| P10 | Esgota 3 tentativas e termina em `FAILED` |
| P11 | Lease expirado é recuperado como falha técnica e libera nova tentativa |
| P12 | Lease expirado esgotado termina em `FAILED` sem nova chamada ao provider |
| P13 | Resultado stale não sobrescreve o que o worker recuperador já fez |
| P14 | Corrida de recuperação de lease não duplica a nova tentativa |
| P15 | Fluxo vertical completo: upload real pela API até `DocumentResult` persistido |

Controle de tempo/lease: nenhum teste espera o lease vencer de verdade — o
`leaseExpiresAt` é escrito diretamente no passado via Prisma
(`test/processing.e2e-spec.ts`, função `expireLease`), conforme prompt §19.

Controle do worker: `PROCESSING_WORKER_ENABLED=false` é definido para toda a
suíte `test:e2e` via `test/setup-e2e.ts` (`vitest.config.e2e.ts`,
`setupFiles`) — sem isso, o loop em segundo plano processaria os documentos
criados pelos testes de ingestão de forma imprevisível durante as asserções
deles. Os testes de processamento chamam `claimNextEligibleJob` /
`processOnce` diretamente, de forma determinística.

Isolamento entre arquivos e2e: `vitest.config.e2e.ts` passou a rodar os
arquivos `*.e2e-spec.ts` em série (`fileParallelism: false`) — os specs
compartilham o mesmo PostgreSQL real, e um job elegível criado por um spec
poderia ser disputado por outro rodando ao mesmo tempo.

**Bug real encontrado e corrigido durante a implementação:** a primeira
versão de `FakeDocumentAiProvider` recebia o modo padrão via parâmetro de
construtor, o que quebrava a resolução de dependências do NestJS ao montar
o `AppModule` completo (fora do teste que faz override manual do provider).
Isso só apareceu ao rodar `npm run test:e2e` com a suíte inteira — rodando
`test/processing.e2e-spec.ts` isoladamente eu não teria pego esse problema,
porque esse arquivo sempre substitui o provider manualmente. Corrigido
conforme seção 8.

**Falso positivo descartado:** a primeira execução de P1 (claim exclusivo)
falhou porque o banco de desenvolvimento local ainda tinha um documento
`RECEIVED` órfão de um teste manual da tarefa de ingestão (sessão anterior),
tornando dois jobs elegíveis ao mesmo tempo em vez de um. Não é um problema
de produção nem de CI (que sempre sobe um PostgreSQL vazio) — limpei os
dados residuais do banco local e a suíte passou de forma consistente nas
execuções seguintes.

Resultado final: `npm test` → 2/2 arquivos, 2/2 testes PASS.
`npm run test:e2e` → 3/3 arquivos, 23/23 testes PASS (15 desta tarefa + 7 da
ingestão + 1 da foundation).

## 14. CI

Nenhuma alteração no workflow foi necessária — `test:e2e` já roda contra o
PostgreSQL de serviço desde a tarefa de ingestão, e os novos testes de
processamento entram automaticamente nessa mesma suíte.

## 15. Audit

`npm audit` e `npm audit --omit=dev` continuam reportando as mesmas 3
vulnerabilidades `high` em `deepmerge-ts` (tooling do Prisma, não runtime),
já registradas nos relatórios anteriores, sem mudança de status. Nenhuma
dependência nova foi adicionada nesta tarefa.

## 16. Limitações conhecidas

- O worker atual roda com concorrência baixa/simples (um `processOnce` por
  vez, por instância de `ProcessingWorker`) — suficiente para esta fase,
  mas não otimizado para alto throughput.
- A metadata de proveniência do provider (`provider`, `model`,
  `modelVersion`, `promptId/Version/Hash`, `outputSchemaVersion`) é gravada
  a partir de constantes estáticas no momento do claim, não devolvida pelo
  provider em tempo de chamada — adequado para um provider fake e estático
  desta fase; um provider real dinâmico provavelmente exigiria mover esses
  campos para depois da chamada, dentro da finalização.
- O limiar de confiança (0.7) é uma configuração determinística da Fase 1,
  sem base estatística — só separa os dois cenários fictícios do provider
  fake.
- Um crash exatamente entre a finalização de sucesso e a resposta ao worker
  não foi especificamente testado (cenário raro, de infraestrutura, não de
  lógica de negócio).

## 17. O que ficou fora

Conforme o prompt (§22): `GET /documents/:id`, listagem, endpoint de
conteúdo/preview, fila de revisão HTTP, correção humana, autenticação, PDF,
provider real, frontend, deploy, microservices, broker externo, cron/reaper
separado, observabilidade completa. Nenhum desses entrou nesta tarefa.

## 18. Assistência do Claude nesta implementação

Todo o módulo `src/processing/`, a alteração em `src/app.module.ts`, a
suíte de testes `test/processing.e2e-spec.ts` (e seus arquivos de suporte
`test/support/processing-fixtures.ts`, `test/setup-e2e.ts`), o ajuste em
`vitest.config.e2e.ts` e este relatório foram gerados por mim (Claude)
nesta tarefa, a partir dos prompts em
`docs/ai/prompts/claude/04-claude-document-processing-prompt.md` e
`docs/ai/prompts/claude/04A-claude-document-processing-scope-clarification-pormpt.md`.
Não fiz revisão humana desta implementação — essa revisão ainda não
aconteceu e não é responsabilidade minha realizá-la.

## 19. Schema e migrations

Nenhuma migration nova foi necessária. A implementação usa exatamente os
campos já aprovados em `prisma/schema.prisma` (`ProcessingJob.claimToken`,
`attemptCount`, `claimedBy`, `claimedAt`, `leaseExpiresAt`;
`ProcessingRun.status`, `attemptNumber`, `provider`, `model`,
`modelVersion`, `promptId`, `promptVersion`, `promptHash`,
`outputSchemaVersion`, `technicalErrorType`, `startedAt`, `finishedAt`;
`DocumentResult.documentType`, `schemaVersion`, `data`).

## 20. Divergência de escopo tratada — nome padronizado

O prompt 04 (§13 e §14) pedia que o `DocumentResult` já incluísse uma
proposta de nome padronizado sem PII. Antes de implementar, identifiquei que
isso conflita com `docs/specification.md` §24 e `PROJECT_CONTEXT.md` §16,
que colocam explicitamente "sugestão de nome padronizado" na Fase 3
(futura), não na Fase 1 atual. Nenhum ADR trata desse item como aprovado
para esta fase.

Segui `CLAUDE.md` ("se houver conflito com documentos humanos de
especificação/arquitetura/ADR, pare e peça confirmação") e parei antes de
implementar. A decisão registrada (confirmada em
`docs/ai/prompts/claude/04A-claude-document-processing-scope-clarification-pormpt.md`):
**não implementar** o nome padronizado nesta tarefa. Os documentos humanos
versionados prevaleceram sobre o prompt; o item permanece na Fase 3. Não
criei migration, campo ou lógica adicional por causa disso — o
`DocumentResult` desta tarefa guarda só `documentType`, `schemaVersion` e
`data` (campos extraídos + confiança), como já suportado pelo schema atual.
