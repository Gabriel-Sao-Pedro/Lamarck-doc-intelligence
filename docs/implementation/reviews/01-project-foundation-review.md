# Revisão da foundation

Esta revisão foi feita por mim, responsável pelo projeto. Usei o checklist de revisão humana para conferir o estado da foundation, as decisões do schema e as evidências das validações já executadas.

## 1. Resultado

**Ainda não aprovada para merge.**

A foundation está coerente como scaffolding e as validações principais passaram, mas confirmei um bloqueador no controle de lease do `ProcessingJob`.

O problema é o `F-001`: o schema ainda não consegue identificar de forma única qual claim está ativo quando um mesmo `workerId` pode ser reutilizado.

## 2. Estado revisado

Branch:

`feat/project-foundation`

Merge-base:

`2856289237c8ae7d0d80e62bf18d8401bf206392`

HEAD revisado:

`55cabc01695a2bce826279af6da76b65717e69ba`

CI do HEAD:

`33426414347` — **PASS**

A branch continuava limitada à foundation/scaffolding. Não encontrei implementação antecipada da vertical slice.

## 3. O que eu conferi

Conferi o schema, migration, configuração do Prisma, Docker, README, configuração do Node, segurança básica e as evidências das validações já executadas.

| Área | Resultado | Observação |
|---|---|---|
| Escopo | PASS | Apenas scaffolding/GET raiz; sem vertical slice |
| Node | PASS | `.nvmrc` 24.16.0, `engines` 24.x e CI usando `.nvmrc` |
| NestJS | PASS | Bootstrap mínimo e `DatabaseModule` |
| Prisma | PASS | Prisma 7.10.0 com adapter PostgreSQL |
| Schema geral | PASS | Modelos e relações coerentes para a foundation |
| Migration | PASS | Corresponde ao schema e aplicou em banco limpo |
| `ProcessingJob` / tentativas | PASS | `attemptCount` continua como fonte operacional |
| Lease / fencing | **FAIL** | `claimedBy` + `leaseExpiresAt` não identificam um claim de forma única |
| `ProcessingRun` | PASS | Histórico 1:N com `Document` |
| `DocumentResult` | PASS | Relações coerentes com `Document` e `ProcessingRun` |
| Docker | PASS | PostgreSQL saudável |
| README | PASS | Comandos coerentes com o projeto |
| Segurança | PASS | Sem PII, secrets ou blob de documento no banco |
| CI | PASS | HEAD revisado passou |
| Documentação humana | PASS | Não foi alterada na implementação da foundation |

## 4. Finding confirmado

### F-001 — fencing de lease não é robusto

**Severidade:** BLOQUEADOR

**Local principal:** `prisma/schema.prisma`

O `ProcessingJob` possui:

- `claimedBy`;
- `claimedAt`;
- `leaseExpiresAt`.

Esses campos ajudam a saber quem pegou o job e até quando o lease vale, mas não identificam de forma única **qual claim está ativo**.

O cenário que confirma o problema é:

1. um worker pega o job usando `workerId=worker-1`;
2. o lease expira;
3. o job é adquirido novamente;
4. o novo processo também usa `workerId=worker-1`;
5. o worker antigo retorna atrasado;
6. uma checagem baseada apenas em `claimedBy` ainda pode aceitar esse worker antigo.

O impacto é que um processamento antigo pode tentar persistir resultado depois de já ter perdido a posse válida do job.

Por isso considero o `F-001` um bloqueador antes de começar a implementação do worker.

### Correção esperada

Adicionar um mecanismo de fencing por claim, como:

`claimToken`

O token deve mudar a cada nova aquisição do job.

Na finalização futura, o worker deve apresentar o mesmo token recebido quando fez o claim. Se o job tiver sido adquirido novamente, o token antigo deixa de ser válido.

## 5. Decisões técnicas que continuam válidas

### `ProcessingJob` 1:1 com `Document`

Considero aceitável para a Fase 1.

As tentativas reutilizam a linha operacional do job, enquanto o histórico fica no `ProcessingRun`.

Uma funcionalidade futura de reprocessamento pode exigir evolução desse modelo, mas isso não bloqueia a foundation atual.

### `attemptCount`

Continua corretamente no `ProcessingJob` como fonte operacional das tentativas.

### `ProcessingRun.attemptNumber`

Serve para registrar historicamente qual tentativa gerou cada execução.

Não considero uma segunda fonte de verdade operacional.

O único ponto do schema que impede o avanço para o worker é o fencing do claim.

## 6. Riscos não bloqueantes

### Possível flakiness nos testes

O `npm test` apresentou um timeout quando foi executado junto com outras verificações pesadas, mas passou quando rodado isoladamente depois.

Vou tratar isso como um risco de flakiness para acompanhar, não como um finding confirmado da foundation.

### Dependências

O `npm audit` apontou vulnerabilidades `high` em `deepmerge-ts`, ligadas ao tooling do Prisma.

Não foi confirmada vulnerabilidade runtime relevante no projeto.

Também não considero correto usar `npm audit fix --force` apenas para eliminar esse aviso e correr o risco de desestabilizar a versão atual do Prisma.

## 7. Validações e CI

Conferi as evidências das validações abaixo:

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Migration em banco limpo | PASS |
| Docker Compose | PASS |
| Build | PASS |
| Lint | PASS |
| Tests | PASS após repetição |
| E2E | PASS |
| CI do HEAD | PASS |
| Audit | FAIL por dependência de tooling |

Os documentos humanos também permaneceram sem alteração durante a implementação da foundation:

- `docs/specification.md`;
- `docs/architecture.md`;
- ADRs;
- `PROJECT_CONTEXT.md`;
- `CLAUDE.md`;
- `AGENTS.md`.

## 8. Decisão de merge

**Não fazer merge ainda.**

O único bloqueador confirmado é:

`F-001 — falta de fencing robusto por claim no ProcessingJob`

O schema já é suficiente para continuar a parte de ingestão/API, mas não considero seguro começar o worker usando o mecanismo atual de claim.

## 9. Próximo passo

Corrigir o `ProcessingJob` adicionando um mecanismo de fencing por claim e criar uma migration incremental sem alterar a migration inicial.

Depois da correção, quero conferir novamente:

- Prisma validate/generate;
- migrations aplicadas desde banco vazio;
- build;
- lint;
- testes;
- E2E;
- audit;
- CI do novo HEAD.

Depois disso, farei uma nova revisão humana apenas da correção do `F-001`, sem revisar toda a foundation novamente.

Nesta revisão eu não alterei arquivos, não fiz commit, push, merge, rebase ou correção.
