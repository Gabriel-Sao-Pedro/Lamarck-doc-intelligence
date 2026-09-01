# Histórico de prompts — Fases 1 e 2

Índice de rastreabilidade dos prompts em `docs/ai/prompts/claude/`. Cada
linha aponta para o arquivo bruto (evidência); este índice só interpreta —
não copia o conteúdo integral dos prompts.

Convenção: **USADO** significa que o prompt foi de fato enviado ao Claude
para instruir uma tarefa de implementação/correção. **VERSIONADO MAS NÃO
USADO** significa que o arquivo existe no repositório (por rastreabilidade
ou por ter sido salvo automaticamente durante a sessão), mas não foi a
instrução operativa de nenhuma tarefa.

| # | Arquivo | Status | Finalidade | Observação |
|---|---|---|---|---|
| 01 | [`01-claude-project-foundation-prompt.md`](prompts/claude/01-claude-project-foundation-prompt.md) | USADO | Scaffold NestJS/Prisma/PostgreSQL da foundation | Revisado em `docs/implementation/reviews/01-project-foundation-review.md` |
| 02 | [`02-claude-foundation-lease-fencing-fix-prompt.md`](prompts/claude/02-claude-foundation-lease-fencing-fix-prompt.md) | USADO | Correção do F-001 (fencing): campo `claimToken` | Revisado em `docs/implementation/reviews/02-foundation-lease-fencing-review.md` |
| 03 | [`03-claude-document-ingestion-prompt.md`](prompts/claude/03-claude-document-ingestion-prompt.md) | USADO | Implementação da ingestão (`POST /documents`) | Revisado em `docs/implementation/reviews/03-document-ingestion-review.md`; dois findings (ING-001/002) corrigidos na mesma branch |
| 04 | [`04-claude-document-processing-prompt.md`](prompts/claude/04-claude-document-processing-prompt.md) | USADO | Implementação do processamento (worker, claim, lease, provider fake) | Revisado em `docs/implementation/reviews/04-document-processing-review.md` — reprovado até correção |
| 04A | [`04A-claude-document-processing-scope-clarification-prompt.md`](prompts/claude/04A-claude-document-processing-scope-clarification-prompt.md) | VERSIONADO MAS NÃO USADO | Registro de uma divergência de escopo (nome padronizado) esclarecida ao vivo, na conversa | Ficou versionado desde o commit `ee76395` (parte da implementação do processing). A decisão real veio de uma troca direta na conversa, não de um novo prompt enviado separadamente para instruir uma tarefa. Mantido no repositório por transparência — não apague evidência de sessão — mas não deve ser lido como uma tarefa distinta que o Claude executou. Arquivo renomeado (só o nome, sem mudar conteúdo) durante a consolidação documental da Fase 2.2, para remover um typo do nome original; este link foi corrigido no fechamento da Fase 2 (tarefa 12), que encontrou a referência antiga quebrada. |
| 05 | [`05-claude-document-processing-findings-fix-prompt.md`](prompts/claude/05-claude-document-processing-findings-fix-prompt.md) | USADO | Correção dos findings `PROC-001`/`PROC-002`/`PROC-003` da revisão do processing | Revisado em `docs/implementation/reviews/05-document-processing-findings-review.md` — aprovado |
| 06 | [`06-claude-document-result-query-prompt.md`](prompts/claude/06-claude-document-result-query-prompt.md) | USADO | Implementação da consulta (`GET /documents/:id`) e fechamento da vertical slice | Revisado em `docs/implementation/reviews/06-document-query-review.md` — aprovado |
| 07 | [`07-claude-phase1-closure-audit-prompt.md`](prompts/claude/07-claude-phase1-closure-audit-prompt.md) | USADO | Fechamento e auditoria final da Fase 1 | Relatório em `docs/implementation/007-phase1-closure.md` |
| 08 | [`08-claude-phase2-document-list-prompt.md`](prompts/claude/08-claude-phase2-document-list-prompt.md) | USADO | Listagem paginada com filtro por status (`GET /documents`) | Revisado em `docs/implementation/reviews/08-phase2-document-list-review.md` — aprovado; achado documental `LIST-001` (nome do próprio arquivo de prompt) corrigido antes do merge |
| 09 | [`09-claude-phase2-pdf-support-prompt.md`](prompts/claude/09-claude-phase2-pdf-support-prompt.md) | USADO | Suporte a PDF no pipeline de ingestão/processamento já existente | Revisado em `docs/implementation/reviews/09-phase2-pdf-support-review.md` — aprovado |
| 10 | [`10-claude-phase2-api-key-prompt.md`](prompts/claude/10-claude-phase2-api-key-prompt.md) | USADO | Autenticação simples por API key (`X-API-Key`) nas rotas de `/documents` | Revisado em `docs/implementation/reviews/10-phase2-api-key-review.md` — aprovado; hipótese `AUTH-001` (ordem de carregamento do `.env` no bootstrap) investigada com smoke test real em processo novo e descartada |
| 11 | [`11-claude-phase2-openapi-prompt.md`](prompts/claude/11-claude-phase2-openapi-prompt.md) | USADO | Documentação Swagger/OpenAPI do contrato HTTP já existente (`/docs`, `/docs-json`) | Revisado em `docs/implementation/reviews/11-phase2-openapi-review.md` — aprovado |
| 12 | [`12-claude-phase2-closure-prompt.md`](prompts/claude/12-claude-phase2-closure-prompt.md) | USADO | Fechamento formal da Fase 2: fresh clone, smoke real de API key/imagem/PDF/listagem/consulta/Swagger, fechamento desta própria tabela e do `ADR-007` | Relatório em `docs/implementation/012-phase2-closure.md` |

## Outros prompts versionados (Fase 1, ciclo de revisão da ingestão)

Três arquivos adicionais existem em `docs/ai/prompts/claude/` cobrindo o
ciclo de revisão/correção da ingestão (achados `ING-001`/`ING-002`), sem
entrada própria nesta tabela ainda:

- `04-claude-document-ingestion-review-prompt.md`
- `05-claude-document-ingestion-findings-fix-prompt.md`
- `06-claude-document-ingestion-findings-verification-prompt.md`

Ficaram versionados desde a consolidação documental da Fase 2.2, mas o
fechamento da Fase 2 (tarefa 12) não teve escopo para indexá-los — o
prompt desta tarefa listava explicitamente só `08`–`12`. Registrado como
pendência em `docs/implementation/012-phase2-closure.md` (seção
Divergências), para decisão humana sobre incluir ou não nesta tabela.

## O que não entra nesta pasta

Roteiros técnicos usados **só** para orientar uma revisão ou checagem
humana (não para instruir uma tarefa de implementação do Claude) não
pertencem a `docs/ai/prompts/claude/` — eles ficam registrados dentro do
conteúdo da própria review em `docs/implementation/reviews/`, quando
aplicável. Nenhum roteiro de revisão foi encontrado indevidamente
versionado nesta pasta durante a auditoria da Fase 1
(`docs/implementation/007-phase1-closure.md`).
