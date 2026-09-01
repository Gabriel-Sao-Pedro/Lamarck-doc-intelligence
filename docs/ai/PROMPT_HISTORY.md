# Histórico de prompts — Fases 1, 2 e 3

Índice de rastreabilidade dos prompts em `docs/ai/prompts/claude/`. Cada
linha aponta para o arquivo bruto (evidência); este índice só interpreta —
não copia o conteúdo integral dos prompts.

Convenção: **USADO** significa que o prompt foi de fato enviado ao Claude
para instruir uma tarefa de implementação/correção. **VERSIONADO MAS NÃO
USADO** significa que o arquivo existe no repositório (por rastreabilidade
ou por ter sido salvo automaticamente durante a sessão), mas não foi a
instrução operativa de nenhuma tarefa. **INCERTO** significa que o arquivo
existe e é coerente com o que foi entregue, mas não há evidência direta
(transcript, commit correspondente ou registro cruzado) suficiente para
classificá-lo com segurança como um dos dois status acima — usado só para
os itens 13-16, encontrados pela auditoria técnica end-to-end registrada em
`docs/implementation/reviews/` e cuja procedência exata não pôde ser
confirmada com a mesma certeza que os itens 01-12.

| # | Arquivo | Status | Finalidade | Observação |
|---|---|---|---|---|
| 01 | [`01-claude-project-foundation-prompt.md`](prompts/claude/01-claude-project-foundation-prompt.md) | USADO | Scaffold NestJS/Prisma/PostgreSQL da foundation | Revisado em `docs/implementation/reviews/01-project-foundation-review.md` |
| 02 | [`02-claude-foundation-lease-fencing-fix-prompt.md`](prompts/claude/02-claude-foundation-lease-fencing-fix-prompt.md) | USADO | Correção do F-001 (fencing): campo `claimToken` | Revisado em `docs/implementation/reviews/02-foundation-lease-fencing-review.md` |
| 03 | [`03-claude-document-ingestion-prompt.md`](prompts/claude/03-claude-document-ingestion-prompt.md) | USADO | Implementação da ingestão (`POST /documents`) | Revisado em `docs/implementation/reviews/03-document-ingestion-review.md`; dois findings (ING-001/002) corrigidos na mesma branch |
| 03A | [`04-claude-document-ingestion-review-prompt.md`](prompts/claude/04-claude-document-ingestion-review-prompt.md) | USADO | Roteiro da revisão técnica somente leitura da ingestão | É um roteiro de revisão (a própria seção 1 do arquivo diz "esta versão é o roteiro da revisão humana"), não um prompt de implementação — mesma natureza dos roteiros descritos em "O que não entra nesta pasta" abaixo. Ficou nomeado `04` no arquivo (coincide com o número do prompt de processing, de família diferente); renumerado `03A` nesta tabela por ordem cronológica real, já que fecha o ciclo da tarefa 03 antes do início da 04. O conteúdo corresponde à evidência técnica reunida em `docs/implementation/reviews/03-document-ingestion-review.md`. |
| 04 | [`04-claude-document-processing-prompt.md`](prompts/claude/04-claude-document-processing-prompt.md) | USADO | Implementação do processamento (worker, claim, lease, provider fake) | Revisado em `docs/implementation/reviews/04-document-processing-review.md` — reprovado até correção |
| 04A | [`04A-claude-document-processing-scope-clarification-prompt.md`](prompts/claude/04A-claude-document-processing-scope-clarification-prompt.md) | VERSIONADO MAS NÃO USADO | Registro de uma divergência de escopo (nome padronizado) esclarecida ao vivo, na conversa | Ficou versionado desde o commit `ee76395` (parte da implementação do processing). A decisão real veio de uma troca direta na conversa, não de um novo prompt enviado separadamente para instruir uma tarefa. Mantido no repositório por transparência — não apague evidência de sessão — mas não deve ser lido como uma tarefa distinta que o Claude executou. Arquivo renomeado (só o nome, sem mudar conteúdo) durante a consolidação documental da Fase 2.2, para remover um typo do nome original; este link foi corrigido no fechamento da Fase 2 (tarefa 12), que encontrou a referência antiga quebrada. |
| 03B | [`05-claude-document-ingestion-findings-fix-prompt.md`](prompts/claude/05-claude-document-ingestion-findings-fix-prompt.md) | VERSIONADO MAS NÃO USADO | Instrução preparada para o Claude corrigir `ING-001`/`ING-002` | `docs/implementation/reviews/03-document-ingestion-review.md` diz explicitamente, em primeira pessoa: "Eu mesmo corrigi esses dois pontos" — a correção foi feita manualmente pelo revisor humano, não pelo Claude a partir deste prompt. Ficou nomeado `05` no arquivo (mesmo número do prompt de correção do processing, de família diferente); renumerado `03B` nesta tabela por ordem cronológica real. Ver também a correção de autoria em `f7378d8` (Fase 1). |
| 03C | [`06-claude-document-ingestion-findings-verification-prompt.md`](prompts/claude/06-claude-document-ingestion-findings-verification-prompt.md) | VERSIONADO MAS NÃO USADO | Instrução preparada para o Claude verificar a correção de `ING-001`/`ING-002` | Mesmo caso do item acima: a review 03 registra "fiz uma checagem focada neles" e "corrigidos por mim e depois validados novamente", em primeira pessoa do revisor humano — a verificação também foi feita diretamente por ele, não a partir deste prompt. Ficou nomeado `06` no arquivo (mesmo número do prompt de consulta, de família diferente); renumerado `03C` nesta tabela por ordem cronológica real. |
| 05 | [`05-claude-document-processing-findings-fix-prompt.md`](prompts/claude/05-claude-document-processing-findings-fix-prompt.md) | USADO | Correção dos findings `PROC-001`/`PROC-002`/`PROC-003` da revisão do processing | Revisado em `docs/implementation/reviews/05-document-processing-findings-review.md` — aprovado |
| 06 | [`06-claude-document-result-query-prompt.md`](prompts/claude/06-claude-document-result-query-prompt.md) | USADO | Implementação da consulta (`GET /documents/:id`) e fechamento da vertical slice | Revisado em `docs/implementation/reviews/06-document-query-review.md` — aprovado |
| 07 | [`07-claude-phase1-closure-audit-prompt.md`](prompts/claude/07-claude-phase1-closure-audit-prompt.md) | USADO | Fechamento e auditoria final da Fase 1 | Relatório em `docs/implementation/007-phase1-closure.md` |
| 08 | [`08-claude-phase2-document-list-prompt.md`](prompts/claude/08-claude-phase2-document-list-prompt.md) | USADO | Listagem paginada com filtro por status (`GET /documents`) | Revisado em `docs/implementation/reviews/08-phase2-document-list-review.md` — aprovado; achado documental `LIST-001` (nome do próprio arquivo de prompt) corrigido antes do merge |
| 09 | [`09-claude-phase2-pdf-support-prompt.md`](prompts/claude/09-claude-phase2-pdf-support-prompt.md) | USADO | Suporte a PDF no pipeline de ingestão/processamento já existente | Revisado em `docs/implementation/reviews/09-phase2-pdf-support-review.md` — aprovado |
| 10 | [`10-claude-phase2-api-key-prompt.md`](prompts/claude/10-claude-phase2-api-key-prompt.md) | USADO | Autenticação simples por API key (`X-API-Key`) nas rotas de `/documents` | Revisado em `docs/implementation/reviews/10-phase2-api-key-review.md` — aprovado; hipótese `AUTH-001` (ordem de carregamento do `.env` no bootstrap) investigada com smoke test real em processo novo e descartada |
| 11 | [`11-claude-phase2-openapi-prompt.md`](prompts/claude/11-claude-phase2-openapi-prompt.md) | USADO | Documentação Swagger/OpenAPI do contrato HTTP já existente (`/docs`, `/docs-json`) | Revisado em `docs/implementation/reviews/11-phase2-openapi-review.md` — aprovado |
| 12 | [`12-claude-phase2-closure-prompt.md`](prompts/claude/12-claude-phase2-closure-prompt.md) | USADO | Fechamento formal da Fase 2: fresh clone, smoke real de API key/imagem/PDF/listagem/consulta/Swagger, fechamento desta própria tabela e do `ADR-007` | Relatório em `docs/implementation/012-phase2-closure.md` |
| 13 | [`13-claude-phase3-review-queue-prompt.md`](prompts/claude/13-claude-phase3-review-queue-prompt.md) | USADO | Roteiro de revisão técnica adversarial somente leitura da Fase 3.1 (`GET /reviews`), incluindo confirmação de `RQ-001`/`RQ-002` | Revisado em `docs/implementation/reviews/13-phase3-review-queue-review.md` |
| 14 | [`14-claude-phase3-review-claim-review-prompt.md`](prompts/claude/14-claude-phase3-review-claim-review-prompt.md) | USADO | Roteiro de revisão técnica adversarial somente leitura da Fase 3.2 (`POST /reviews/:documentId/claim`) — concorrência, lease, fencing, migration | Revisado em `docs/implementation/reviews/14-phase3-review-claim-review.md` |
| 15 | [`15-claude-phase3-human-correction-guidance-prompt.md`](prompts/claude/15-claude-phase3-human-correction-guidance-prompt.md) | INCERTO | Pedido de orientação de design (não de implementação) para a Fase 3.3, antes de o código existir — persistência, optimistic locking, validação de claim, contrato do `PATCH` | O conteúdo é coerente com o desenho efetivamente implementado na Fase 3.3, mas a auditoria técnica end-to-end não encontrou evidência direta (transcript, commit ou registro cruzado) de que este arquivo específico foi a instrução operativa que produziu essa implementação — ver `docs/implementation/reviews/15-phase3-review-correction-review.md` |
| 16 | [`16-claude-phase3-review-correction-review-prompt.md`](prompts/claude/16-claude-phase3-review-correction-review-prompt.md) | USADO | Roteiro de revisão técnica adversarial somente leitura da Fase 3.3 (`PATCH /reviews/:documentId`) e instrução para produzir o relatório de implementação e a review correspondentes | Revisado em `docs/implementation/reviews/15-phase3-review-correction-review.md` (numeração final do arquivo de review fechada em `15`, não `16` como o próprio prompt nomeava, para não deixar lacuna na sequência de `docs/implementation/reviews/`) |

## O que não entra nesta pasta

Roteiros técnicos usados **só** para orientar uma revisão ou checagem
humana (não para instruir uma tarefa de implementação do Claude) não
pertencem a `docs/ai/prompts/claude/` — eles ficam registrados dentro do
conteúdo da própria review em `docs/implementation/reviews/`, quando
aplicável. Nenhum roteiro de revisão foi encontrado indevidamente
versionado nesta pasta durante a auditoria da Fase 1
(`docs/implementation/007-phase1-closure.md`).

Atualização no fechamento da Fase 2: o item `03A` desta tabela é, na
prática, um roteiro de revisão que ficou nesta pasta (adicionado depois
da auditoria da Fase 1, durante a consolidação documental da Fase 2.2) —
uma exceção real à regra acima, registrada aqui em vez de escondida.
