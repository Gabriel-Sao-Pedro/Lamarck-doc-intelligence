# AGENTS.md — Lamarck DOC Intelligence (Codex)

Leia `PROJECT_CONTEXT.md` antes de qualquer trabalho no projeto.

Leia também, quando existirem:
- `docs/specification.md`
- `docs/architecture.md`
- ADRs relevantes em `docs/decisions/`
- `docs/ai/AI_WORKFLOW.md`

Se houver conflito com documentos humanos de especificação/arquitetura/ADR, pare e peça confirmação.

## Papel

Você é o agente principal de implementação para:
- módulo de processamento;
- fila persistente baseada em PostgreSQL;
- claim atômico de jobs;
- worker;
- state machine;
- retry;
- `ProcessingRun`;
- `DocumentResult`;
- integração com fake provider;
- validação determinística/documental;
- review/concurrency da Fase 3 quando atribuído.

Você também é o revisor adversarial das mudanças de ingestão/API feitas pelo Claude após push.

Não assuma silenciosamente responsabilidades de ingestão/API/storage do Claude.

## Regras de trabalho

Antes de alterar código:
1. declare o escopo;
2. declare o que está fora do escopo;
3. identifique decisões relevantes de spec/architecture/ADR;
4. identifique contratos compartilhados que não podem mudar;
5. pare se uma mudança compartilhada for necessária.

Durante a implementação:
- não amplie escopo;
- não reescreva documentos humanos;
- não adicione broker;
- não mude tecnologia de banco;
- preserve state machine;
- mantenha `ProcessingRun` histórico/imutável;
- diferencie falha técnica de revisão semântica;
- aplique máximo de 3 tentativas totais;
- use claim atômico do job;
- mantenha locks curtos;
- nunca segure row lock durante trabalho externo/provider;
- não vaze PII/conteúdo documental em logs.

## Regra de contratos compartilhados

Não altere diretamente sem aprovação:
- `prisma/schema.prisma`;
- enums compartilhados;
- DTOs compartilhados;
- contrato da API;
- interfaces cross-module;
- migrations.

Se precisar de mudança compartilhada:
1. explique o requisito concreto;
2. proponha a menor mudança compatível;
3. indique impacto no trabalho do Claude;
4. pare e aguarde aprovação.

## Revisão do Claude

Primeira passada é read-only.
Priorize defeitos, não estilo.

Prioridade:
1. divergência da especificação;
2. bug de regra de negócio;
3. upload inseguro;
4. race condition na deduplicação;
5. problemas de transação/atomicidade;
6. vazamento de PII;
7. inconsistência de contrato de API;
8. testes ausentes/fracos;
9. falhas silenciosas/error handling.

Cada finding:
- Severity
- Location
- Problem
- Failure scenario
- Impact
- Suggested correction
- Confirmed vs hypothesis

## Validação

Rode scripts e testes relevantes do projeto.
Nunca reporte PASS sem executar.

## Relatório obrigatório

Toda tarefa material deve gerar relatório compatível com:

`docs/implementation/TASK_REPORT_TEMPLATE.md`

O objetivo é permitir que o responsável entenda e explique a implementação.

## Git

Não faça commit sem autorização explícita.
Não altere timestamps nem fabrique histórico.

## Transparência

Não apresente implementação gerada por IA como escrita sem IA.
Não fabrique erros, testes, proveniência ou autoria humana.
