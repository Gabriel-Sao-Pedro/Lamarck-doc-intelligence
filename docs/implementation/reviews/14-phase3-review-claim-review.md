# 15 — Revisão técnica — Fase 3.2: claim + lease de revisor

## 1. Resultado

**APROVADA PARA VERSIONAMENTO E MERGE**

A implementação da Fase 3.2 atende ao escopo definido para claim exclusivo de documentos em `NEEDS_REVIEW`, com lease, fencing e proteção contra concorrência entre revisores.

Os principais invariantes da slice estão cobertos:

- apenas um claim ativo por documento;
- disputa concorrente protegida por `SELECT ... FOR UPDATE`;
- lease expirado pode ser substituído;
- cada novo claim recebe um novo `claimToken`;
- documento fora de `NEEDS_REVIEW` não pode ser reivindicado;
- API key continua obrigatória;
- migration e schema permanecem coerentes;
- OpenAPI foi atualizado para a nova operação.

Não ficou finding bloqueante registrado para esta fase.

## 2. Estado revisado

A revisão considerou a implementação da Fase 3.2 composta por:

- `POST /reviews/:documentId/claim`;
- model `ReviewClaim`;
- migration `20260901122211_add_review_claim`;
- lease de 15 minutos;
- `claimToken` de fencing;
- lock pessimista em `Document`;
- testes RC1–RC9 e caso adicional de validação;
- atualização de OpenAPI;
- cleanup de fixtures;
- atualização do README.

Validações registradas na implementação:

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 96/96 |
| Migration no PostgreSQL real | PASS |
| Smoke manual | não executado nesta tarefa |

## 3. Concorrência e RC7

O desenho de concorrência está coerente com o problema que a slice precisa resolver.

A transação segue a ordem:

```text
SELECT Document FOR UPDATE
→ valida existência
→ valida NEEDS_REVIEW
→ consulta claim atual
→ verifica lease
→ cria ou atualiza ReviewClaim
→ commit
```

O lock em `Document` é apropriado porque a linha de `ReviewClaim` pode não existir na primeira disputa.

O RC7 cobre a condição mais importante da fase:

```text
duas requisições concorrentes
mesmo documentId
reviewers diferentes
→ uma 200
→ uma 409
```

e ainda verifica que o estado persistido corresponde ao vencedor.

**Status:** APROVADO.

## 4. Lease

O lease foi definido em 15 minutos.

Comportamento esperado e implementado:

```text
claim ativo
→ bloqueia novo claim

lease expirado
→ permite novo claim

novo claim
→ novo leaseExpiresAt
```

A ausência de reaper não é problema nesta slice. O lease expirado é tratado de forma lazy na próxima tentativa de claim.

**Status:** APROVADO.

## 5. Fencing / claimToken

Cada claim bem-sucedido recebe um novo `claimToken`.

Isso mantém o mesmo princípio de fencing já utilizado no processamento: uma ação baseada em posse antiga não deve ser tratada como válida depois que um novo claim foi concedido.

O token de revisão é independente do `claimToken` de `ProcessingJob`, porque representam posses diferentes.

**Status:** APROVADO.

## 6. Persistência e migration

`ReviewClaim` foi mantido como entidade separada de `Document`, o que preserva a diferença entre:

```text
identidade permanente do documento
```

e:

```text
estado operacional temporário da revisão
```

`documentId` é único, impedindo mais de uma linha de claim por documento.

A migration foi aplicada e validada em PostgreSQL real.

**Status:** APROVADO.

## 7. Findings confirmados

Nenhum finding bloqueante ou material foi confirmado nesta fase.

## 8. Findings / riscos aceitos

Os pontos abaixo continuam registrados como trade-offs ou riscos futuros, mas não bloqueiam a Fase 3.2:

### Mesmo reviewer não renova lease ativo

Atualmente um novo claim enquanto o lease ainda está válido retorna `409`, inclusive para o mesmo `reviewerId`.

É uma decisão aceitável para esta slice e pode ser revisitada quando o fluxo de correção humana existir.

### Ausência de reaper

Lease expirado só é reaproveitado quando alguém tenta reivindicar o documento novamente.

Não existe requisito atual que justifique um processo adicional em background.

### Teste de carga

A concorrência funcional foi testada com duas requisições simultâneas, mas não houve teste de volume.

### Smoke manual

O smoke manual da rota não foi executado nesta etapa. Os testes E2E cobrem o fluxo funcional implementado, então isso não bloqueia o fechamento.

## 9. Segurança

A rota continua protegida por API key.

O `reviewerId` é validado antes do uso e não é interpolado em SQL bruto.

O `documentId` usado em `$queryRaw` passa pelo tagged template do Prisma, mantendo parametrização.

Nenhuma PII documental é necessária para realizar o claim.

Nenhum secret novo foi introduzido.

**Status:** APROVADO.

## 10. OpenAPI

A nova rota foi documentada no OpenAPI.

O ajuste relacionado a `claimToken` mantém a distinção correta:

```text
claimToken interno de processamento
→ não deve aparecer

claimToken público do ReviewClaim
→ faz parte da resposta da operação de claim
```

**Status:** APROVADO.

## 11. Autoria

A implementação, o código, os testes, as decisões e as correções da Fase 3.2 são de autoria humana.

Isso inclui:

- model e migration de `ReviewClaim`;
- services e DTOs;
- alterações em controller e módulo;
- testes E2E;
- ajustes de OpenAPI;
- fixtures;
- README;
- decisões tomadas durante a implementação.

O Claude atuou como apoio de orientação e revisão técnica, sem autoria sobre a implementação desta fase.

## 12. Decisão

**FASE 3.2 APROVADA PARA COMMIT, PUSH, CI E MERGE.**

Não existe uma etapa adicional de revisão humana prevista depois deste documento.

Fluxo de fechamento:

```text
commit
→ push
→ CI da branch
→ merge
→ CI de main
```

Com a CI de `main` verde, a Fase 3.2 pode ser considerada encerrada e a Fase 3.3 pode começar.
