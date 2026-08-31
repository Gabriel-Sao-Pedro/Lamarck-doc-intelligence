# Relatório de Implementação — Correção do F-001 (lease fencing)

## 1. Escopo

### Implementado
- Campo `claimToken` em `ProcessingJob` (schema Prisma).
- Migration incremental `add_processing_job_claim_token`.
- Validação completa (schema, build, lint, testes, e2e, Docker Compose, audit) e migrations aplicadas desde um PostgreSQL vazio.

### Deliberadamente não implementado
- Query de claim, `FOR UPDATE SKIP LOCKED`, worker, lógica de finalização, retry, state machine em código, qualquer parte da vertical slice — fora do escopo desta correção.

## 2. Por que isso existe

O `F-001` foi confirmado na revisão humana da foundation
(`docs/implementation/reviews/01-project-foundation-review.md`): o
`ProcessingJob` guardava `claimedBy`, `claimedAt` e `leaseExpiresAt`, mas
esses campos não identificam de forma única **qual claim está ativo**.

Por que `claimedBy` sozinho não é fencing: `claimedBy` guarda um identificador
de worker, não um identificador de *aquisição* do job. Se o mesmo `workerId`
for reutilizado entre duas aquisições diferentes (comum em pools de workers
com nomes fixos, ou processos reiniciados), uma checagem que só compara
`claimedBy` não consegue distinguir a aquisição antiga da nova — as duas têm
o mesmo valor.

Cenário concreto: um worker adquire o job com `workerId=worker-1`; o lease
expira; o job é adquirido de novo, e o novo processo também usa
`workerId=worker-1` (mesmo nome/slot); o worker antigo, que só estava lento
e não realmente morto, volta e tenta finalizar o processamento — uma
checagem baseada só em `claimedBy` aceitaria essa finalização como válida,
mesmo o job já pertencendo a outra aquisição.

## 3. Fluxo de execução

Nesta tarefa, o "fluxo" é de schema, não de runtime:

`schema.prisma (novo campo) -> prisma migrate dev (gera SQL) -> prisma migrate deploy (valida desde banco vazio) -> prisma generate`

Nenhum código de aplicação foi alterado.

## 4. Arquivos

| Arquivo | Criado/Modificado | Finalidade |
|---|---|---|
| `prisma/schema.prisma` | Modificado | Adiciona `claimToken` ao `ProcessingJob` com o comentário explicando o mecanismo de fencing |
| `prisma/migrations/20260831214321_add_processing_job_claim_token/migration.sql` | Criado | `ALTER TABLE "ProcessingJob" ADD COLUMN "claimToken" TEXT;` |
| `docs/implementation/002-foundation-lease-fencing-fix.md` | Criado | Este relatório |

## 5. Imports/dependências importantes

Nenhuma dependência nova. Nenhum import de código alterado.

## 6. Regras de negócio implementadas

Nenhuma regra de negócio em código — só o campo de schema que a regra de
fencing vai precisar quando a finalização for implementada (fora desta
tarefa).

## 7. Decisões de arquitetura envolvidas

Referências: `docs/architecture.md` §11 (fencing), ADR-002 (fila
PostgreSQL/claim), ADR-005 (histórico imutável). Nenhuma decisão
arquitetural nova foi criada — esta correção só torna o schema capaz de
suportar a regra de fencing que a arquitetura já exigia.

### O que é `claimToken`

Um identificador (string, formato UUID) que representa uma **aquisição**
específica do job, não o worker que a fez.

### Por que não usa `@default(uuid())`

O token não deve nascer junto com o job — ele só passa a existir quando um
worker de fato adquire o job pela lógica de claim (ainda não implementada).
Um `@default(uuid())` geraria um token no momento da criação do
`ProcessingJob`, antes de qualquer claim acontecer, o que é semanticamente
errado: haveria um "token de posse" sem ninguém possuindo o job ainda. Por
isso o campo é `String?` sem default — nasce `null` e só a lógica de claim
(futura) o preenche.

### Quando o token será gerado

Pela lógica de claim, no momento em que um worker reivindica o job
(substituindo o valor anterior a cada nova aquisição, inclusive quando um
lease expirado é retomado por outro worker).

### Como a futura finalização deverá validá-lo

Antes de gravar qualquer resultado, a finalização (fora do escopo desta
tarefa) deve conferir, no mínimo: o job correto; que o `claimToken`
apresentado pelo worker bate com o valor atual da coluna; que o lease ainda
é válido; que o estado do documento é compatível. Se o `claimToken` não
bater — porque outro worker já reivindicou o job depois de um lease expirado
— a finalização deve ser rejeitada, mesmo que o `workerId` apresentado seja
igual ao antigo.

### Por que `attemptCount` continua com outra responsabilidade

`ProcessingJob.attemptCount` responde "quantas tentativas já foram
consumidas" e segue sendo a fonte operacional do limite de 3 tentativas
(ADR-002). `claimToken` responde uma pergunta diferente: "quem é o dono
válido do claim agora". As duas coisas não se sobrepõem — uma tentativa
técnica falhada continua incrementando `attemptCount` independentemente de
qual token estava ativo.

### Análise da constraint `@unique`

Avaliei adicionar `@unique` em `claimToken` e decidi **não adicionar**.
O mecanismo de fencing não depende de unicidade global do token entre
`ProcessingJob`s diferentes — a comparação que importa é sempre "o token que
o worker apresenta bate com o valor atual **desta linha específica**?", uma
checagem por linha, não uma checagem global. Um UUID já tem colisão
global desprezível por si só. Adicionar `@unique` não fortalece a garantia
de fencing e seria modelagem em excesso para um invariante que não existe
de verdade neste projeto — por isso mantive `claimToken` sem `@unique`.

## 8. Transações e concorrência

Não aplicável a esta tarefa — nenhuma query de claim, transação ou lock foi
implementado. Só a coluna que a futura lógica de claim/finalização vai usar
para a comparação de fencing.

## 9. Falhas e edge cases

| Cenário | Comportamento esperado (schema já suporta, lógica futura) |
|---|---|
| Worker antigo volta depois do lease expirar e job já foi readquirido | `claimToken` apresentado não bate com o valor atual → finalização deve ser rejeitada |
| Job nunca foi reivindicado | `claimToken` é `null` — não há "dono" a ser confundido |

## 10. Validação

| Check | Comando/Teste | Resultado |
|---|---|---|
| Prisma validate | `npm run prisma:validate` | PASS |
| Prisma generate | `npm run prisma:generate` | PASS |
| Migration (banco vazio) | `docker compose down -v && docker compose up -d && npx prisma migrate deploy` | PASS — as duas migrations (`20260831183416_init`, `20260831214321_add_processing_job_claim_token`) aplicaram em ordem, sem erro, em um PostgreSQL recém-criado |
| Build | `npm run build` | PASS |
| Lint | `npm run lint` | PASS |
| Tests | `npm test` | PASS (1/1) |
| E2E | `npm run test:e2e` | PASS (1/1) |
| Docker Compose | `docker compose config` | PASS |
| npm audit | `npm audit` | FAIL — 3 vulnerabilidades `high` em `deepmerge-ts` |
| npm audit --omit=dev | `npm audit --omit=dev` | FAIL — mesmo resultado |

Nenhum teste falhou e depois passou em repetição nesta tarefa — todos
passaram já na primeira execução.

## 11. Como testar manualmente

1. `docker compose down -v && docker compose up -d` (banco limpo).
2. `npm run prisma:migrate:deploy` (aplica as duas migrations em ordem).
3. `npx prisma studio` ou uma query direta — confirmar que `ProcessingJob.claimToken` existe, é nullable e não tem valor default.

## 12. O que o responsável deve saber explicar em entrevista

- Por que uma coluna extra (`claimToken`) é necessária além de `claimedBy`: são dois conceitos diferentes — "quem" (identidade do worker, pode repetir) vs. "qual aquisição" (token de posse, único por aquisição).
- Alternativa considerada e descartada: `@unique` no token — decidi não usar porque a garantia de fencing é por linha, não global; ver seção 7.
- Trade-off: o schema já reflete a decisão de fencing, mas a lógica de verificação em si (query de claim, finalização) ainda não existe — isso é intencional, para manter esta correção isolada e pequena.
- O que quebraria em maior escala: sem `claimToken`, em produção com múltiplos workers e leases curtos, resultados de processamentos "zumbis" (workers que já perderam a posse) poderiam sobrescrever resultados válidos de reprocessamentos legítimos — exatamente o cenário do F-001.

## 13. Proveniência de IA

### Gerado pelo Claude
O campo `claimToken`, a migration `add_processing_job_claim_token` e este
relatório foram gerados por mim (Claude) nesta tarefa, a partir do prompt em
`docs/ai/prompts/claude/02-claude-foundation-lease-fencing-fix-prompt.md`.

### Modificações humanas posteriores
Nenhuma até o momento deste relatório.

### Revisão humana
- Revisor: pendente — próxima revisão humana, só desta correção.
- Findings: N/A ainda.
- Correções: N/A ainda.

O `F-001` foi confirmado na revisão humana registrada em
`docs/implementation/reviews/01-project-foundation-review.md`, antes desta
tarefa. Esta implementação não fez essa revisão nem a descobriu — só
corrigiu o que já havia sido confirmado.

## 14. Divergências da especificação

### Nenhuma

## 15. Segurança/PII

- Nenhum dado pessoal ou documental foi tratado nesta tarefa — é uma
  mudança de schema, sem dados reais envolvidos.
- Nenhum secret foi exposto; `.env` não commitado.
- Não aplicável para entradas externas — nenhuma entrada de usuário
  processada nesta tarefa.

## 16. Riscos conhecidos / pendências

- **`npm audit` continua reportando 3 vulnerabilidades `high` em
  `deepmerge-ts`**, alcançadas via `prisma` (CLI, devDependency) →
  `@prisma/config` → `deepmerge-ts`. O mesmo resultado apareceu em
  `npm audit --omit=dev` — não identifiquei um caminho de vulnerabilidade
  separado em dependências de runtime (`@prisma/client`,
  `@prisma/adapter-pg`, `pg` não aparecem como vulneráveis isoladamente).
  Não apliquei `npm audit fix --force` nem troquei a versão do Prisma,
  conforme instruído — risco de tooling/dev, não de runtime, já registrado
  na revisão anterior e sem mudança de status aqui.
- A lógica de fencing em si (comparação de `claimToken` na finalização)
  ainda não existe em código — é trabalho futuro, fora do escopo desta
  correção, que só prepara o schema.
- Sem `@unique` em `claimToken`, nada no banco impede que dois
  `ProcessingJob`s diferentes tenham o mesmo valor de token por coincidência
  — decisão deliberada (seção 7), mas registrando para transparência: se
  no futuro surgir um caso de uso onde unicidade global importe, isso
  precisaria ser revisitado.

## 17. Git

Ver seção "Git" do relatório de resposta (fora deste arquivo).

## 18. Próximo passo recomendado

Aguardar nova revisão humana, apenas desta correção do `F-001`.

Não executei essa revisão.
