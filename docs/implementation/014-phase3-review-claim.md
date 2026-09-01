# Relatório de Implementação — Fase 3.2: claim + lease de revisor

## 1. Objetivo

Nesta etapa eu implementei o claim exclusivo de documentos em `NEEDS_REVIEW`.

A nova rota é:

```http
POST /reviews/:documentId/claim
```

Ela permite que um revisor assuma temporariamente um documento para revisão, usando um lease de 15 minutos.

Também implementei:

- model `ReviewClaim`;
- migration correspondente;
- `claimToken` para fencing;
- concorrência protegida com `SELECT ... FOR UPDATE`;
- testes RC1–RC9 e um caso extra de validação do body.

Ainda não implementei correção humana, optimistic locking, filename padronizado ou reprocessamento. Mantive essas responsabilidades fora desta slice para não misturar claim com edição do resultado.

## 2. Por que isso existe

A Fase 3.1 criou a fila de revisão, mas ainda havia um problema importante: dois revisores poderiam abrir a fila e começar a trabalhar no mesmo documento.

O claim resolve isso.

Com esta etapa, apenas um revisor pode manter a posse ativa de um documento durante o período do lease.

## 3. Fluxo

```text
POST /reviews/:documentId/claim
  → ApiKeyGuard
  → valida reviewerId
  → inicia transação
  → SELECT Document FOR UPDATE
  → valida existência e status
  → verifica claim atual
  → rejeita claim ainda ativo
  → cria ou substitui claim expirado
  → gera novo claimToken
  → define leaseExpiresAt
  → commit
  → retorna os dados do claim
```

A resposta contém:

```text
documentId
claimedBy
claimToken
leaseExpiresAt
```

## 4. Arquivos alterados

| Arquivo | O que alterei |
|---|---|
| `prisma/schema.prisma` | adicionei `ReviewClaim` e a relação com `Document` |
| `prisma/migrations/20260901122211_add_review_claim/migration.sql` | criei a migration |
| `src/reviews/reviews.constants.ts` | defini a duração do lease |
| `src/reviews/review-claim.service.ts` | implementei a regra de claim |
| `src/reviews/dto/review-claim-body.dto.ts` | validação do body |
| `src/reviews/dto/review-claim-response.dto.ts` | contrato de resposta |
| `src/reviews/reviews.controller.ts` | nova rota |
| `src/reviews/reviews.module.ts` | registro do service |
| `test/review-claim.e2e-spec.ts` | RC1–RC9 + caso extra |
| `test/openapi.e2e-spec.ts` | ajuste no contrato OpenAPI |
| `test/support/processing-fixtures.ts` | cleanup de `ReviewClaim` |
| `README.md` | exemplo da nova operação |

Não adicionei dependências ao `package.json`.

## 5. Persistência

Criei `ReviewClaim` como entidade separada de `Document`.

Escolhi essa estrutura porque o claim é um estado operacional e temporário: ele representa quem está com o documento e até quando, não uma característica permanente do documento.

`documentId` é único em `ReviewClaim`, então não existem dois claims persistidos ao mesmo tempo para o mesmo documento.

## 6. Concorrência

A parte central desta implementação é o lock em `Document`.

Usei:

```sql
SELECT ... FOR UPDATE
```

dentro da transação.

Escolhi travar `Document`, e não `ReviewClaim`, porque na primeira disputa ainda pode não existir nenhuma linha de `ReviewClaim`. `Document`, por outro lado, sempre existe para um `documentId` válido.

Na prática:

```text
requisição A
→ trava Document
→ cria claim
→ commit

requisição B
→ espera
→ continua depois do commit
→ enxerga claim ativo
→ recebe 409
```

O RC7 testa exatamente essa situação com duas requisições concorrentes.

## 7. Fencing

Cada claim bem-sucedido recebe um novo `claimToken`.

Usei o mesmo raciocínio de fencing já adotado no processamento: uma ação atrasada relacionada a um claim antigo não deve conseguir agir como se ainda tivesse a posse atual.

O token também é renovado quando um lease expirado é assumido novamente.

## 8. Lease

Defini o lease em 15 minutos.

Não implementei scheduler nem reaper. Quando o lease expira, ele é considerado inválido e pode ser substituído pela próxima tentativa de claim.

Preferi esse comportamento porque mantém esta slice simples sem adicionar outro processo em background.

## 9. Regras de negócio

Implementei:

```text
documento inexistente
→ 404

status diferente de NEEDS_REVIEW
→ 409

claim ativo
→ 409

sem claim
→ concede claim

lease expirado
→ concede novo claim

novo claim
→ novo claimToken

reviewerId ausente/vazio
→ 400

API key ausente/incorreta
→ 401
```

Também decidi que o mesmo `reviewerId` não renova o próprio lease enquanto ele ainda está ativo. Isso evita resetar token e lease acidentalmente no meio de uma revisão.

Se esse comportamento for ruim para revisões longas, posso revisitar a decisão quando a edição humana entrar no fluxo.

## 10. OpenAPI

Documentei a nova rota e ajustei o teste que antes proibia `claimToken` em qualquer ponto do OpenAPI.

Agora `claimToken` continua proibido onde é interno, mas aparece no DTO específico de claim, onde faz parte do contrato público desta operação.

## 11. Testes

Implementei RC1–RC9 e um caso extra de validação.

Os principais cenários cobrem:

- claim bem-sucedido;
- documento inexistente;
- status inválido;
- claim ativo;
- lease expirado;
- geração de novo token;
- duas requisições simultâneas;
- API key;
- validação de `reviewerId`.

O RC7 é o teste principal desta etapa: duas requisições são disparadas ao mesmo tempo e apenas uma recebe `200`.

Também verifico no banco que o `ReviewClaim` final pertence exatamente à requisição vencedora.

## 12. Validação

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 96/96 |
| Migration no PostgreSQL real | PASS |
| Smoke manual | não executado nesta tarefa |

A suíte E2E passou de 86 para 96 testes.

## 13. Segurança e PII

Esta rota não manipula o conteúdo pessoal extraído do documento.

Ela trabalha apenas com:

```text
documentId
reviewerId
claimToken
timestamps
```

Não introduzi novos secrets.

O `reviewerId` é validado como entrada não confiável e não é interpolado em SQL bruto.

O `documentId` usado no `$queryRaw` passa pelo tagged template do Prisma, mantendo parametrização segura.

## 14. Decisões que tomei

Algumas decisões não estavam completamente fechadas no contrato inicial e eu precisei defini-las durante a implementação:

- resposta de sucesso em `200 OK`;
- mesmo reviewer não renova claim ativo;
- lease de 15 minutos;
- `ReviewClaim` como entidade separada;
- lock em `Document`;
- ausência de reaper nesta fase.

Mantive essas decisões registradas porque são pontos importantes para explicar e revisar depois.

## 15. O que eu preciso saber explicar

### Por que `FOR UPDATE` em `Document`?

Porque `Document` sempre existe antes da disputa. `ReviewClaim` pode não existir ainda.

### Por que uma entidade separada?

Porque posse temporária da revisão é estado operacional, não identidade permanente do documento.

### Por que `claimToken`?

Para fencing. Um claim antigo não deve conseguir agir sobre um claim mais novo.

### Por que não existe reaper?

Porque um lease expirado pode ser reaproveitado no próximo claim. Não havia necessidade de adicionar outro processo em background nesta slice.

### O que muda em maior escala?

O lock é por documento, não pela tabela toda. O primeiro ponto que provavelmente precisaria evoluir seria a recuperação ou visibilidade proativa de leases expirados.

## 16. Riscos e pendências

Continuam conhecidos:

- o mesmo reviewer não consegue renovar um lease ativo;
- não existe reaper;
- não fiz teste de carga além da concorrência de duas requisições;
- o smoke manual da rota não foi executado nesta tarefa.

Nenhum desses pontos invalida a implementação atual.

## 17. O que ficou fora

Ainda não implementei:

```text
PATCH de correção humana
reviewVersion
optimistic locking
409 por conflito de versão
resultado efetivo da correção humana
filename padronizado
provider real
reprocessamento
```

Preferi concluir claim e lease de forma isolada e validada antes de misturar essa responsabilidade com alteração dos dados extraídos.

## 18. Autoria e uso de IA

A implementação desta Fase 3.2 foi feita por mim.

Isso inclui:

- model e migration de `ReviewClaim`;
- service e DTOs;
- alterações no controller e módulo;
- testes E2E;
- ajustes de OpenAPI;
- fixtures;
- README;
- decisões e correções desta etapa.

Usei IA como apoio para orientação e revisão técnica. A implementação desta fase é de autoria humana.

## 19. Commit sugerido

```text
feat(reviews): add claim and lease for human review (phase 3.2)
```
