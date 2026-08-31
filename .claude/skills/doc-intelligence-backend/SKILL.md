---
name: doc-intelligence-backend
description: Regras de trabalho para o backend DOC Intelligence (NestJS/Prisma/PostgreSQL) — escopo, state machine, atomicidade, PII e checklist de conclusão de tarefa. Usar em toda tarefa de implementação ou revisão neste projeto.
---

# DOC Intelligence Backend

Esta skill não é um tutorial genérico de NestJS. Ela define como o agente deve
se comportar especificamente neste projeto.

## Antes de implementar qualquer tarefa

1. Leia `docs/specification.md`.
2. Leia `docs/architecture.md`.
3. Leia os ADRs relacionados à tarefa.
4. Leia o contrato/API relacionado à mudança.
5. Confirme o escopo solicitado.
6. Não implemente funcionalidades fora do escopo.
7. Não altere decisões arquiteturais silenciosamente.
8. Se houver conflito entre código e especificação, sinalize antes de alterar.
9. Não introduza dependência externa sem justificativa.
10. Consulte documentação atual quando uma decisão depender de APIs,
    comportamento ou versão de framework/biblioteca.

## Regras de domínio

- Respeite a state machine do documento:
  - `RECEIVED → PROCESSING → COMPLETED`
  - `PROCESSING → NEEDS_REVIEW`
  - `PROCESSING → RETRYING → PROCESSING`
  - `RETRYING → FAILED`
- Nenhuma transição de estado pode ser feita arbitrariamente — toda transição
  deve corresponder exatamente a uma aresta válida acima.
- Diferencie falha técnica (→ retry) de falha semântica (→ `NEEDS_REVIEW`).
- `ProcessingRun` é imutável; preserve o histórico de reprocessamentos —
  nunca sobrescreva ou apague um `ProcessingRun` anterior.
- Considere atomicidade e concorrência em operações de job: claim de fila,
  incremento de contador de retries e transição de estado devem ocorrer de
  forma atômica (mesma transação / locking apropriado), nunca como
  leituras e escritas separadas sujeitas a corrida.
- Deduplicação exata utiliza SHA-256 do conteúdo do documento; documento
  duplicado retorna o documento existente — trate também o caso de dois
  uploads concorrentes do mesmo arquivo (constraint única + tratamento de
  conflito, não apenas "checar antes de inserir").
- Não introduza Redis/RabbitMQ/Kafka nesta fase — a fila é persistida no
  PostgreSQL.
- Somente quando os dois checks de validação (determinístico e verificação
  contra o documento) passarem, o estado pode ser `COMPLETED`.

## Segurança e dados pessoais

- Nunca registre CPF em logs.
- Nunca registre nome do cliente/titular em logs.
- Nunca registre campos extraídos do documento em logs.
- Nunca registre conteúdo do documento em logs.
- Nunca exponha secrets (variáveis de ambiente, connection strings, chaves).
- Nunca utilize o nome de arquivo enviado pelo usuário como path direto no
  filesystem — trate uploads como entrada não confiável (path traversal,
  extensão/MIME forjados).
- Toda validação de upload assume que o cliente pode enviar qualquer coisa,
  independentemente do que o front-end declare.

## Antes de concluir qualquer tarefa

- Execute o build.
- Execute o lint relacionado.
- Execute os testes relevantes.
- Informe qualquer teste que não conseguiu executar (e por quê).

## Relatório final de tarefa

Ao finalizar, produza um relatório contendo:

1. Escopo realizado
2. Arquivos criados/modificados
3. Decisões tomadas
4. Divergências da especificação
5. Testes executados
6. Resultado do build/lint
7. Riscos encontrados
8. Itens deliberadamente não feitos
9. Considerações de segurança
10. Sugestão de mensagem de commit
