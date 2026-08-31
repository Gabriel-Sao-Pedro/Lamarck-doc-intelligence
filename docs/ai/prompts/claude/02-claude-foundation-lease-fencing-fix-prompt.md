# Claude — corrigir o lease fencing da foundation

## 1. Ação

Corrija o bloqueador `F-001` da foundation adicionando suporte a fencing por claim no `ProcessingJob`.

Quero corrigir somente o schema, criar a migration necessária, validar a mudança e registrar o que foi feito.

Não comece o worker nem outra parte da vertical slice.

## 2. Contexto

Na minha revisão da foundation, confirmei que `claimedBy`, `claimedAt` e `leaseExpiresAt` não identificam de forma única cada claim.

O problema aparece quando um lease expira e o mesmo `workerId` é reutilizado em um novo claim. Um worker antigo pode voltar atrasado e ainda parecer válido se a checagem usar apenas `claimedBy`.

A branch atual é:

`feat/project-foundation`

Antes de alterar qualquer coisa, leia:

- `CLAUDE.md`
- `PROJECT_CONTEXT.md`
- `docs/architecture.md`
- ADR-002 e ADR-005
- `docs/implementation/001-project-foundation.md`
- `docs/implementation/reviews/01-project-foundation-review.md`
- schema e migrations atuais

Confira também:

```bash
git status --short
git branch --show-current
git log --oneline -8
```

Se houver alteração inesperada na working tree, pare antes de editar.

## 3. Papel

Atue como implementador do backend.

Siga as decisões já tomadas no projeto e limite a mudança ao `F-001`.

A revisão da correção e a decisão de merge serão feitas por mim depois. Não faça revisão final do próprio trabalho.

## 4. Dados de entrada e referências

Adicione ao `ProcessingJob`:

`claimToken`

Ele deve:

- ser opcional quando não houver claim ativo;
- armazenar UUID;
- mudar a cada novo claim;
- não usar `@default(uuid())`, porque o token não deve nascer junto com o job.

Analise se `@unique` faz sentido no PostgreSQL/Prisma sem criar efeito colateral. Se não fizer, não adicione só por adicionar e explique a decisão.

No futuro, a finalização deverá conferir o `claimToken`, o lease e o estado do job. Assim, mesmo que o mesmo `workerId` seja reutilizado, um worker antigo não poderá finalizar um claim novo.

Veja também se vale guardar o token no `ProcessingRun` apenas para auditoria. Se não trouxer benefício claro, não adicione.

`ProcessingJob.attemptCount` continua sendo a fonte operacional das tentativas.

Não altere a migration inicial:

`prisma/migrations/20260831183416_init/migration.sql`

Crie uma migration nova, por exemplo:

`add_processing_job_claim_token`

Valide as migrations partindo de um PostgreSQL vazio, aplicando primeiro a migration inicial e depois a nova.

## 5. Formato de saída

Depois que a correção existir, crie:

`docs/implementation/002-foundation-lease-fencing-fix.md`

Explique de forma simples:

- qual era o problema;
- como `claimToken` resolve;
- por que não foi usado `@default(uuid())`;
- se `ProcessingRun` recebeu ou não o token;
- qual migration foi criada;
- como a migration foi testada em banco vazio;
- quais validações foram executadas;
- resultado do audit e da CI;
- riscos que ainda ficaram.

Registre que o `F-001` foi confirmado na revisão humana antes desta tarefa. Não diga que você descobriu o finding ou fez a revisão humana.

Antes do commit, mostre:

```bash
git status --short
git diff --stat
git diff
```

Faça um commit para código/migration:

`fix: add lease fencing token to processing jobs`

Depois faça outro para o relatório:

`docs: record foundation fencing correction`

Faça push para:

`origin/feat/project-foundation`

Depois acompanhe a CI do novo HEAD e informe:

- HEAD;
- run id;
- resultado;
- falha, se houver.

Ao terminar, pare para uma nova revisão humana da correção.

## 6. Restrições e limites

Não:

- altere `docs/specification.md`;
- altere `docs/architecture.md`;
- altere ADRs;
- altere `PROJECT_CONTEXT.md`, `CLAUDE.md` ou `AGENTS.md`;
- altere `docs/implementation/reviews/01-project-foundation-review.md`;
- edite ou reescreva a migration inicial;
- use `@default(uuid())` no `claimToken`;
- implemente worker;
- implemente query de claim;
- implemente `FOR UPDATE SKIP LOCKED`;
- implemente retry;
- implemente state machine;
- implemente finalização;
- implemente outras features;
- faça merge;
- faça force-push;
- use `npm audit fix --force`;
- troque a versão do Prisma apenas para zerar o audit.

Execute de verdade:

```bash
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
npm run test:e2e
docker compose config
npm audit
npm audit --omit=dev
```

A migration deve ser validada desde banco vazio, não apenas em um banco já migrado.

Se houver falha real em teste ou CI, registre e não esconda.
