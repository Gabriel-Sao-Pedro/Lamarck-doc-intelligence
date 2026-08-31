# Revisão da foundation

Esta é uma revisão humana, feita por mim, o responsável pelo projeto — não é
um agente revisando outro. Segui o checklist de `REVIEW_CHECKLIST.md`.

## Resultado

**Ainda não aprovada para merge.**

A foundation está funcionando e passou nas validações principais, mas confirmei um problema no controle de lease do `ProcessingJob` que precisa ser resolvido antes de começar a implementação do worker.

## O que eu conferi

Branch revisada:

`feat/project-foundation`

HEAD analisado:

`55cabc01695a2bce826279af6da76b65717e69ba`

CI do HEAD:

`33426414347` — PASS

Também conferi as evidências, já registradas em `docs/implementation/001-project-foundation.md`, de:

- instalação com `npm ci`;
- Prisma validate e generate;
- migration em banco limpo;
- Docker Compose;
- build;
- lint;
- testes;
- testes e2e;
- schema;
- migration;
- README;
- configuração do Node;
- configuração do Prisma;
- documentos humanos (não foram alterados).

A foundation continua limitada ao scaffolding. Não encontrei implementação antecipada da vertical slice.

## Problema encontrado

### F-001 — falta identificar cada claim de forma única

O `ProcessingJob` possui:

- `claimedBy`;
- `claimedAt`;
- `leaseExpiresAt`.

Esses campos mostram quem pegou o job e até quando o lease vale, mas não identificam de forma única **qual claim** está ativo.

O problema aparece neste cenário:

1. um worker pega o job;
2. o lease expira;
3. o job é recuperado;
4. o mesmo identificador de worker é reutilizado;
5. o worker antigo volta atrasado;
6. uma validação baseada só em `claimedBy` pode aceitar esse worker antigo.

Isso pode fazer um processamento antigo salvar resultado depois de já ter perdido a posse do job.

## Correção esperada

Adicionar um token único para cada claim, por exemplo:

`claimToken`

Esse token deve mudar sempre que o job for adquirido novamente.

Na finalização futura, o worker precisa apresentar o mesmo token recebido no claim.

Se o job tiver sido recuperado, o token antigo deixa de ser válido.

## Sobre o restante do schema

O restante está adequado para a Fase 1.

`ProcessingJob` 1:1 com `Document` é aceitável neste momento.

`attemptCount` continua corretamente no `ProcessingJob` como fonte operacional das tentativas.

`ProcessingRun.attemptNumber` funciona como histórico e não cria uma segunda fonte de verdade.

A migration atual corresponde ao schema e foi aplicada corretamente em banco limpo.

## Segurança e dependências

O `npm audit` apontou vulnerabilidade `high` em `deepmerge-ts`, ligada ao tooling do Prisma.

Não foi confirmada vulnerabilidade runtime relevante.

Não deve ser aplicado `npm audit fix --force` só para remover esse aviso.

## Validações

Evidências conferidas (resultado registrado no relatório da foundation):

| Validação | Resultado |
|---|---|
| npm ci | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Migration em banco limpo | PASS |
| Docker Compose | PASS |
| Build | PASS |
| Lint | PASS |
| Tests | PASS |
| E2E | PASS |
| CI do HEAD | PASS |
| Audit | FAIL por dependência de tooling |

## Conclusão

O único bloqueador para merge é o lease fencing.

Depois de adicionar um token único por claim e validar novamente migration, build, testes e CI, quero revisar de novo — só essa correção, não a foundation inteira outra vez.

Não alterei arquivos, não fiz commit, push, merge ou correção durante esta revisão.
