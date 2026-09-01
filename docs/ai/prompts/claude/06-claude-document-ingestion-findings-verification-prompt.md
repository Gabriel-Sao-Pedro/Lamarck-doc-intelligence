# 06 — Checagem final dos findings da ingestão

## 1. Ação

Faça uma checagem curta para confirmar se os dois pontos encontrados na revisão da ingestão foram corrigidos.

Quero validar apenas:

- `ING-001`: T9 agora prova que o arquivo físico vencedor continua íntegro e que a cópia perdedora não ficou no storage;
- `ING-002`: o relatório `003` agora mostra a contagem E2E correta.

Não refaça toda a revisão da feature.

## 2. Contexto

Branch:

`feat/document-ingestion`

HEAD esperado:

`38062858e59f2c7386b33713d952825fcca8e19d`

Commits da correção:

- `f32f82f`
- `3806285`

CI esperada:

- run `33449569118`
- `SUCCESS`

Há itens locais conhecidos que não pertencem a esta correção:

- alteração em `docs/ai/prompts/claude/03-claude-document-ingestion-prompt.md`;
- `docs/implementation/reviews/03-document-ingestion-review.md` não rastreado;
- `docs/doc-intelligence-phase-0-ai-reviews.zip` não rastreado.

Não toque nesses arquivos.

Antes de revisar:

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log --oneline -10
```

## 3. Papel

Atue como revisor técnico somente leitura.

Sua função é confirmar se os dois findings foram fechados com evidência suficiente.

A decisão final de merge será feita por mim.

## 4. Dados de entrada e referências

Leia:

- `test/documents.e2e-spec.ts`;
- `docs/implementation/003-document-ingestion.md`.

No T9, confirme que o teste agora verifica:

- 1 `Document`;
- 1 `ProcessingJob`;
- `storageKey` do vencedor;
- arquivo vencedor existe;
- bytes do arquivo vencedor são iguais aos enviados;
- não ficou uma segunda cópia permanente da request perdedora.

Confira se a comparação do diretório antes/depois realmente é suficiente no isolamento atual do teste.

Para o relatório, confirme que:

- `9/9` foi corrigido;
- a contagem final registrada é `8/8`;
- essa contagem corresponde à execução real.

Revise também:

```bash
git diff e42e7ae..3806285 --stat
git diff e42e7ae..3806285 -- test/documents.e2e-spec.ts docs/implementation/003-document-ingestion.md
```

## 5. Formato de saída

Responda com:

### ING-001
- corrigido?:
- arquivo vencedor existe?:
- bytes conferem?:
- cópia perdedora removida?:
- T9 agora é suficiente?:

### ING-002
- corrigido?:
- contagem no relatório:
- contagem real:
- divergência restante?:

### Validações

| Check | Resultado |
|---|---|
| E2E | PASS / FAIL / NÃO EXECUTADO |
| Lint | |
| CI do HEAD | |

### Escopo
- código de produção alterado?:
- schema/migrations alterados?:
- processing implementado?:

### Findings novos
Liste somente problemas reais.

Se não houver:

`Nenhum finding novo confirmado.`

### Conclusão
Use:

`APROVADO PARA MERGE`

ou

`NÃO APROVADO PARA MERGE`

Explique rapidamente o motivo.

## 6. Restrições e limites

Não:

- altere arquivos;
- corrija código;
- faça commit;
- faça push;
- faça merge;
- reabra toda a revisão;
- invente finding;
- trate preferência como erro;
- mexa nos arquivos locais conhecidos fora da correção.

A decisão final de merge continua sendo minha.

Pare depois da checagem.
