# AGENTS.md — Lamarck DOC Intelligence

Leia `PROJECT_CONTEXT.md` antes de qualquer trabalho no projeto.

Leia também, quando existirem:
- `docs/specification.md`
- `docs/architecture.md`
- ADRs relevantes em `docs/decisions/`
- `docs/ai/AI_WORKFLOW.md`

Se houver conflito com os documentos humanos, pare e peça confirmação.

## Papel

Este arquivo contém regras gerais de trabalho para o Claude neste projeto.

O Claude pode ajudar em implementação, análise ou revisão, mas não decide
sozinho mudanças de arquitetura, escopo ou contratos compartilhados.

## Regras de trabalho

Antes de alterar código:
1. entenda o escopo;
2. identifique o que está fora do escopo;
3. leia as decisões relevantes;
4. identifique contratos compartilhados;
5. pare se uma mudança arquitetural precisar de aprovação.

Durante a implementação:
- não amplie escopo sem necessidade;
- não reescreva documentos humanos;
- não adicione infraestrutura sem justificativa;
- preserve a state machine definida;
- mantenha `ProcessingRun` histórico;
- diferencie falha técnica de inconsistência semântica;
- respeite o limite de três tentativas;
- mantenha locks e transações curtos;
- não segure lock enquanto espera provider externo;
- não coloque PII ou conteúdo documental em logs.

## Contratos compartilhados

Não altere silenciosamente:
- `prisma/schema.prisma`;
- migrations;
- enums compartilhados;
- DTOs/contratos da API;
- interfaces entre módulos;
- state machine.

Se uma mudança for necessária:
1. explique o motivo;
2. proponha a menor mudança;
3. mostre o impacto;
4. aguarde aprovação humana.

## Revisão

Quando a tarefa for revisão, a primeira passada é somente leitura.

Priorize:
- divergência da especificação;
- bug de regra de negócio;
- segurança;
- concorrência;
- transações;
- contrato da API;
- testes;
- falhas silenciosas.

Não invente finding para preencher relatório.

A decisão final de aceitar, pedir correção ou fazer merge é humana.

## Validação

Rode os testes e scripts relevantes.
Nunca reporte PASS sem executar.

## Git

Não faça commit sem autorização quando a tarefa não permitir explicitamente.
Não altere timestamps nem fabrique histórico.
