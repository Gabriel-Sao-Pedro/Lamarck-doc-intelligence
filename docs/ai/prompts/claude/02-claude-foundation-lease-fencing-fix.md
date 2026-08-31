# Claude — correção do lease fencing da foundation

A revisão humana da foundation reprovou a `feat/project-foundation` por um único bloqueador confirmado:

`F-001` — o schema de `ProcessingJob` não possui fencing robusto por claim.

Esta tarefa é uma correção pequena e isolada da foundation.

Não implemente a vertical slice.
Não faça merge em `main`.
Não altere documentação humana.
Não reescreva migrations já publicadas.

## 0. Antes de alterar qualquer arquivo

Confirme que está no repositório correto e leia:

- `CLAUDE.md`
- `PROJECT_CONTEXT.md`
- `docs/architecture.md`
- `docs/decisions/ADR-002-postgresql-como-fila.md`
- `docs/decisions/ADR-005-historico-imutavel-processamento.md`
- `docs/implementation/001-project-foundation.md`
- `docs/implementation/reviews/01-project-foundation-cross-review.md` — o relatório da revisão humana que originou esta correção

Leia também o schema e as migrations atuais:

- `prisma/schema.prisma`
- `prisma/migrations/**/migration.sql`

Antes de escrever:

```
git status --short
git branch --show-current
git log --oneline -8
```

A branch de trabalho deve continuar sendo:

`feat/project-foundation`

Se houver alteração rastreada inesperada, pare e reporte.

## 1. Finding que deve ser corrigido

O schema atual usa informações como:

- `claimedBy`;
- `claimedAt`;
- `leaseExpiresAt`.

Isso não é suficiente para fencing.

Cenário real:

1. worker A faz claim com `workerId=worker-1`;
2. o lease expira;
3. o job é recuperado;
4. o novo claim também usa `workerId=worker-1`;
5. o worker antigo retorna atrasado;
6. uma checagem baseada apenas em `claimedBy` pode aceitar o worker antigo.

A arquitetura já exige que um worker que perdeu o lease não consiga finalizar o processamento como se ainda fosse o dono.

Não altere essa regra. Apenas faça o schema suportá-la corretamente.

## 2. Decisão para esta correção

Use um token de claim único por aquisição de lease.

Nome preferido:

`claimToken`

No `ProcessingJob`, ele deve ser:

- nullable quando não há claim ativo;
- renovado/substituído a cada novo claim;
- adequado para armazenar UUID;
- protegido por unicidade no banco, se isso for compatível com PostgreSQL/Prisma sem criar efeito colateral indesejado.

Não use `@default(uuid())` no `ProcessingJob` para esse campo.

O token não nasce junto com o job.

Ele é criado pela lógica de claim quando um worker realmente adquire o job.

A futura finalização deverá conseguir validar, no mínimo:

- job correto;
- `claimToken` recebido pelo worker;
- lease ainda válido;
- estado compatível.

Assim, mesmo que `claimedBy` se repita, um worker antigo carrega um token antigo e não consegue finalizar depois que o claim foi renovado.

### Importante

NÃO implemente agora:

- query de claim;
- worker;
- finalização;
- `FOR UPDATE SKIP LOCKED`;
- retry;
- state machine em código.

Nesta tarefa, apenas deixe o schema pronto para essa lógica futura.

## 3. ProcessingRun

Analise se faz sentido registrar o `claimToken` que iniciou cada `ProcessingRun`.

Preferência: se isso melhorar a rastreabilidade sem criar uma segunda fonte de verdade operacional, pode adicionar um campo opcional de referência/auditoria no `ProcessingRun`.

Mas:

- `ProcessingJob.claimToken` continua sendo o ownership atual;
- `ProcessingRun` continua sendo histórico;
- não transforme `ProcessingRun` em mecanismo de claim;
- não derive ownership contando runs;
- não altere `attemptCount` como fonte operacional das tentativas.

Se concluir que o token no run não é necessário para a foundation, não adicione apenas por excesso de modelagem. Registre a decisão no relatório.

## 4. Migration

A migration inicial já foi criada, executada, commitada, enviada ao remoto e revisada.

NÃO edite:

`prisma/migrations/20260831183416_init/migration.sql`

Crie uma nova migration incremental para o mecanismo de fencing.

Use um nome claro, por exemplo:

`add_processing_job_claim_token`

O objetivo é preservar o histórico real:

```
foundation inicial
→ revisão humana encontrou F-001
→ nova migration corrige F-001
```

Não faça squash.
Não reescreva o commit anterior.

## 5. Escopo permitido

Você pode alterar somente o necessário para esta correção, esperado principalmente em:

- `prisma/schema.prisma`;
- nova migration;
- eventualmente arquivos técnicos diretamente afetados pelo schema;
- novo relatório de implementação.

Se o Prisma gerar arquivos não versionados esperados, trate normalmente.

Não altere:

- `docs/specification.md`;
- `docs/architecture.md`;
- ADRs;
- `PROJECT_CONTEXT.md`;
- `CLAUDE.md`;
- `AGENTS.md`.

Também não implemente:

- endpoints;
- upload;
- storage;
- SHA-256;
- dedup;
- worker;
- processing;
- fake provider;
- state machine;
- retry;
- review;
- PDF;
- autenticação.

## 6. Validação local

Depois da mudança, execute de verdade:

- `npm run prisma:validate`
- `npm run prisma:generate`
- migration completa em PostgreSQL limpo
- `npm run build`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- `docker compose config`

A validação da migration deve partir de banco vazio e aplicar:

1. migration inicial;
2. nova migration de fencing.

Não valide apenas sobre o banco antigo já migrado.

Depois confira:

`git status --short`

Nenhum arquivo rastreado inesperado deve ter mudado.

## 7. Audit

Rode novamente:

`npm audit`

e:

`npm audit --omit=dev`

NÃO faça:

- `npm audit fix`;
- `npm audit fix --force`;
- upgrade de Prisma;
- troca de versão só para zerar audit.

Se `deepmerge-ts` continuar aparecendo:

- registre o resultado;
- explique o caminho da dependência;
- diferencie runtime de tooling/dev;
- não transforme isso em outra correção sem aprovação.

## 8. Relatório da correção

Crie:

`docs/implementation/002-foundation-lease-fencing-fix.md`

Explique em linguagem clara:

- o que a revisão humana encontrou;
- por que `claimedBy` sozinho não é fencing;
- o cenário do worker antigo;
- o que é `claimToken`;
- quando ele será gerado;
- por que muda a cada claim;
- como a futura finalização deverá usá-lo;
- por que `attemptCount` continua com outra responsabilidade;
- se `ProcessingRun` recebeu ou não o token e por quê;
- por que foi criada uma segunda migration em vez de editar a primeira;
- validações executadas;
- audit;
- riscos restantes;
- autoria da correção assistida por IA.

Não diga que o bug foi descoberto por você.

Registre corretamente: a revisão humana encontrou `F-001` durante a revisão da foundation.

## 9. Antes do commit

Mostre:

```
git status --short
git diff --stat
git diff
```

Confirme explicitamente:

- a migration inicial não foi alterada;
- documentos humanos não foram alterados;
- nenhuma feature da vertical slice entrou;
- o diff está limitado à correção de fencing + relatório.

## 10. Commit e push

Faça um commit de código/migration com mensagem:

`fix: add lease fencing token to processing jobs`

Depois faça um commit separado para o relatório:

`docs: record foundation fencing correction`

Faça push para:

`origin/feat/project-foundation`

Não faça merge em `main`.
Não force-push.

## 11. CI

Depois do push:

identifique a GitHub Actions run associada ao novo HEAD.

Acompanhe até terminar.

Registre:

- HEAD;
- run id;
- resultado;
- etapa que falhou, se houver.

Se a CI passar:

não invente correções.

Se a CI falhar por causa desta correção:

- preserve a falha;
- diagnostique;
- corrija apenas se estiver dentro do escopo;
- novo commit;
- novo push;
- nova CI.

Não manufacture falha.
Não esconda falha real.

## 12. Relatório final da tarefa

Responda com:

```
# Correção — Foundation Lease Fencing

## 1. Finding corrigido

Finding:
Severidade:
Origem da descoberta:

## 2. Alteração

Campo adicionado:
Tipo:
Nullable:
Unique:
Como será usado futuramente:

## 3. ProcessingRun

Token registrado no run?:
Motivo:

## 4. Migration

Migration inicial alterada?: NÃO
Nova migration:
Aplicada em banco limpo?:
Resultado:

## 5. Validações

| Check | Resultado |
|---|---|
| Prisma validate | PASS/FAIL/NÃO EXECUTADO |
| Prisma generate | |
| Migration limpa | |
| Build | |
| Lint | |
| Tests | |
| E2E | |
| Docker compose config | |
| npm audit | |
| npm audit --omit=dev | |
| CI do HEAD | |

## 6. GitHub Actions

HEAD:
Run:
Resultado:

## 7. Documentos humanos

Confirme que não foram alterados.

## 8. Escopo

Confirme que nenhuma feature da vertical slice foi implementada.

## 9. Git

Mostre:

git status --short
git log --oneline -7

## 10. Próximo passo

submeter a correção para nova revisão humana, read-only

NÃO execute essa revisão.
NÃO faça merge.
Pare depois do relatório.
```
