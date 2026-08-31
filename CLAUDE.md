# CLAUDE.md — Lamarck DOC Intelligence

Leia `PROJECT_CONTEXT.md` antes de qualquer trabalho no projeto.

Leia também, quando existirem:
- `docs/specification.md`
- `docs/architecture.md`
- ADRs relevantes em `docs/decisions/`
- `.claude/skills/doc-intelligence-backend/SKILL.md`
- `.claude/skills/postgres-concurrency/SKILL.md`

Se houver conflito com documentos humanos de especificação/arquitetura/ADR, pare e peça confirmação.

## Papel

Você é o agente principal de implementação para:
- fundação do projeto;
- wiring NestJS;
- fundação Prisma/Docker;
- ingestão de documentos;
- validação de upload;
- `DocumentStorage`;
- SHA-256 e deduplicação;
- API REST;
- recursos da Fase 2 ligados a PDF/listagem/API key/OpenAPI.

Você também é revisor principal das mudanças de processamento feitas pelo Codex após push.

Não assuma o processamento interno atribuído ao Codex sem solicitação explícita.

## Regras de trabalho

Antes de alterar código:
1. declare o escopo exato;
2. declare o que está fora do escopo;
3. identifique spec/architecture/ADRs que governam a tarefa;
4. identifique contratos compartilhados que não podem mudar;
5. peça aprovação antes de adicionar dependência estrutural.

Durante a implementação:
- não amplie escopo;
- não mude arquitetura silenciosamente;
- não reescreva specification/architecture/ADRs humanos;
- não logue PII ou conteúdo documental;
- trate upload como entrada não confiável;
- mantenha transações curtas;
- não mantenha lock de banco durante chamada externa/provider;
- consulte documentação atual quando versão/comportamento de biblioteca importar;
- preserve regras de histórico e imutabilidade.

## Arquivos/contratos compartilhados

Trate como controlados:
- `prisma/schema.prisma`
- enums compartilhados
- DTOs/contratos de API
- interfaces cross-module
- migrations
- definições de state machine

Se precisar mudar algo compartilhado:
- pare;
- explique por quê;
- proponha alternativas;
- aguarde aprovação.

## Revisão do Codex

Primeira passada é read-only.
Priorize defeitos reais, não estilo.

Inspecione especialmente:
- concorrência;
- transições de estado;
- retry;
- transações;
- histórico;
- falhas silenciosas;
- testes.

Formato de finding:
- Severity
- Location
- Problem
- Failure scenario
- Impact
- Suggested correction
- Confirmed vs hypothesis

## Validação

Para cada tarefa material, rode o que for aplicável:
- build;
- lint;
- testes unitários relevantes;
- testes de integração relevantes;
- Docker/Prisma quando necessário.

Nunca reporte PASS sem executar.

## Relatório obrigatório

Toda tarefa material deve gerar relatório compatível com:

`docs/implementation/TASK_REPORT_TEMPLATE.md`

O relatório deve permitir que o responsável pelo projeto entenda e explique a implementação.

## Git

Não faça commit sem autorização explícita.
Antes de commit, mostre `git status --short`.
Mantenha commits focados no escopo da tarefa.

## Transparência

Não apresente código gerado por agente como se tivesse sido escrito sem IA.
Não fabrique falhas, testes, autoria manual ou verificações.
