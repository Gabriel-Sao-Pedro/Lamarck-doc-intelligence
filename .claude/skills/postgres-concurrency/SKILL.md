---
name: postgres-concurrency
description: Padrões corretos de concorrência e atomicidade em PostgreSQL (SELECT ... FOR UPDATE SKIP LOCKED para claim de fila, prevenção de deadlock, transações curtas, locks de aplicação e UPSERT atômico). Usar ao implementar ou revisar a fila persistida no PostgreSQL, o claim de jobs pelo worker, retries, e a deduplicação por SHA-256 deste projeto.
license: MIT (conteúdo vendorizado — ver LICENSE e SOURCE.md neste diretório)
---

# PostgreSQL concurrency

Conteúdo técnico vendorizado da skill oficial `supabase-postgres-best-practices`
(Supabase, MIT). Ver `SOURCE.md` para origem exata, commit e hashes de
verificação. Nenhum conteúdo técnico foi alterado — apenas selecionados os
arquivos aplicáveis a este projeto.

## Quando usar

Carregue os arquivos de `references/` ao implementar ou revisar:

- o **claim atômico de jobs** da fila persistida no PostgreSQL (worker
  pegando o próximo documento pendente para processar);
- **retries** (transição `PROCESSING → RETRYING → PROCESSING`/`FAILED`);
- a **deduplicação exata por SHA-256** (upload concorrente do mesmo arquivo);
- qualquer transação que toque mais de uma linha/tabela no fluxo de
  processamento de documento.

## Arquivos

| Arquivo | Aplicação direta neste projeto |
|---|---|
| `references/lock-skip-locked.md` | Claim atômico de job na fila (`UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED)`) — evita dois workers pegarem o mesmo documento |
| `references/lock-deadlock-prevention.md` | Evitar deadlock quando uma transação atualiza `ProcessingRun` + status do documento na mesma operação |
| `references/lock-short-transactions.md` | Nunca segurar lock de linha durante a chamada ao Document Intelligence Provider (chamada externa deve ficar FORA da transação) |
| `references/lock-advisory.md` | Alternativa sem lock de linha para coordenação (ex.: evitar dois workers reprocessando o mesmo documento sem depender só do status) |
| `references/data-upsert.md` | Padrão `INSERT ... ON CONFLICT` para o caso de dois uploads simultâneos do mesmo SHA-256 — evita a race condition de "check-then-insert" |

## Regra de uso

Isto é conhecimento de referência, não uma ordem de implementação. As
decisões de arquitetura já tomadas (ver `docs/specification.md` e a skill
`doc-intelligence-backend`) têm prioridade — use estes padrões para
implementar/revisar essas decisões corretamente, não para propor mudanças de
escopo.
