# Review — correção do lease fencing da foundation

## 1. Resultado

**APROVADO**

Revisei a correção do `F-001` e não encontrei novo bloqueador. O `ProcessingJob` agora possui um `claimToken`, o que permite diferenciar um claim antigo de um claim atual mesmo quando o mesmo `workerId` é reutilizado.

A mudança ficou pequena e dentro do escopo da correção.

## 2. Estado revisado

- **Branch:** `feat/project-foundation`
- **HEAD:** `966ccc131ffb612b791188dc93b0e3f204f671e2`
- **Commits revisados:**
  - `1a789d2` — `fix: add lease fencing token to processing jobs`
  - `966ccc1` — `docs: record foundation fencing correction`
- **CI:** run `33443144325` — `SUCCESS`
- **Working tree:** sem alterações rastreadas

Existe apenas o arquivo não rastreado já esperado:

`docs/ai/prompts/claude/02-claude-foundation-lease-fencing-fix-prompt.md`

Ele não faz parte da correção revisada.

## 3. O que eu conferi

Conferi o schema do Prisma, a migration nova, o relatório `002`, o diff da correção e as validações executadas.

Também validei o cenário que originou o `F-001`: um worker perde o lease, o mesmo `workerId` é usado em um novo claim e o worker antigo tenta finalizar depois.

Com `claimToken`, cada aquisição pode receber um valor diferente. Assim, um worker antigo com token `A` pode ser rejeitado quando o job já estiver com token `B`.

## 4. Finding confirmado

### F-001 — fencing de lease

**Status:** CORRIGIDO

O campo adicionado foi:

`ProcessingJob.claimToken`

Características confirmadas:

- `String?` no Prisma;
- `TEXT` no PostgreSQL;
- nullable;
- sem `@default(uuid())`;
- sem `@unique`.

A ausência de `@unique` não bloqueia o fencing, porque a validação acontece contra o token atual da mesma linha do job. A unicidade global não é necessária para resolver o problema original.

Usar `TEXT` também é aceitável nesta fase. Isso deixa a validação do formato UUID para a aplicação, mas não impede a comparação necessária para o fencing.

## 5. Decisões técnicas relevantes

O `claimToken` fica no `ProcessingJob`, porque ele representa a posse operacional atual do job.

O token não foi colocado no `ProcessingRun`. Para esta fase, isso é aceitável: `ProcessingRun` continua sendo histórico e não participa do mecanismo de ownership.

Também confirmei que:

- `ProcessingJob.attemptCount` continua sendo a fonte operacional das tentativas;
- `ProcessingRun.attemptNumber` continua sendo histórico;
- a migration inicial não foi alterada;
- a correção foi feita em uma migration incremental nova.

A migration criada foi:

`20260831214321_add_processing_job_claim_token`

Ela adiciona somente:

```sql
ALTER TABLE "ProcessingJob" ADD COLUMN "claimToken" TEXT;
```

## 6. Riscos não bloqueantes

Ainda existem alguns pontos para acompanhar nas próximas etapas:

- quando o worker for implementado, a finalização precisa conferir `claimToken`, lease válido e estado compatível;
- `npm audit` continua reportando `deepmerge-ts` pelo tooling do Prisma;
- o formato UUID do `claimToken` será garantido pela aplicação, já que a coluna é `TEXT`.

Nenhum desses pontos bloqueia a foundation neste momento.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Migration desde banco vazio | PASS |
| Build | PASS |
| Lint | PASS |
| Tests | PASS |
| E2E | PASS |
| Docker Compose | PASS |
| `npm audit` | FAIL — risco conhecido no tooling do Prisma |
| `npm audit --omit=dev` | FAIL — mesmo risco conhecido |
| CI do HEAD | PASS |

A migration foi validada desde um banco vazio e as duas migrations foram aplicadas em ordem.

O relatório `docs/implementation/002-foundation-lease-fencing-fix.md` está coerente com o schema, a migration e as validações.

## 8. Decisão de merge

**PODE FAZER MERGE.**

Não encontrei novo finding confirmado e o `F-001` foi resolvido sem introduzir feature fora do escopo.

A foundation está aprovada para seguir para a próxima etapa.

## 9. Próximo passo

Fazer o merge de `feat/project-foundation` em `main`.

Depois do merge, iniciar a primeira parte da vertical slice: **ingestão de documentos**, com `POST /documents`, validação do arquivo, SHA-256, storage local, deduplicação e criação de `Document + ProcessingJob`.
