# 06 — Review — consulta do documento e vertical slice

## 1. Resultado

**APROVADO PARA MERGE**

A consulta individual ficou coerente com o restante da Fase 1 e o teste Q9
fecha a vertical slice principal:

```text
upload
→ processamento
→ resultado persistido
→ GET /documents/:id
```

Não encontrei finding novo.

## 2. Estado revisado

- branch: `feat/document-query`
- HEAD: `c76554fb58519ac7d8207afbf622c1fd6f8b0e3e`
- CI: `33460596579` — `SUCCESS`
- unit: `9/9`
- E2E: `33/33`

Durante o smoke manual apareceu um `500`, mas a causa era um processo antigo
ocupando a porta 3000. Depois de encerrar o processo antigo, a API respondeu
corretamente. Não era bug do código.

## 3. O que eu conferi

Revisei:

- `GET /documents/:id`;
- UUID inválido;
- documento inexistente;
- estados em andamento;
- `COMPLETED`;
- `NEEDS_REVIEW`;
- `FAILED`;
- resposta sem campos internos;
- relação com `DocumentResult`;
- Q1–Q9;
- regressões de ingestão e processing;
- schema e migrations.

## 4. Findings confirmados

**Nenhum finding novo confirmado.**

O endpoint retorna:

- `400` para ID inválido;
- `404` para documento inexistente;
- `200` para documento existente, independente do estado.

Enquanto ainda não existe resultado persistido, `result` fica `null`.

Quando o documento termina em `COMPLETED` ou `NEEDS_REVIEW`, o resultado
persistido aparece na resposta.

## 5. Decisões técnicas relevantes

### Endpoint somente leitura

A consulta não muda status, não chama provider e não toca no worker.

### Resultado

A implementação busca o resultado mais recente do documento.

Hoje isso é suficiente porque o fluxo atual só cria um resultado antes do
documento chegar ao estado terminal.

Se existir reprocessamento no futuro, essa regra deve ser revista.

### Vertical slice

O Q9 usa o fluxo real da aplicação com PostgreSQL:

```text
POST /documents
→ ProcessingJob
→ processOnce
→ Fake provider
→ ProcessingRun
→ DocumentResult
→ GET /documents/:id
```

O provider é fake, mas a orquestração e a persistência são reais.

## 6. Riscos não bloqueantes

- a regra de “resultado mais recente” depende da garantia operacional atual;
- `DocumentResult` usa JSON sem validação adicional na leitura;
- o finding conhecido de `deepmerge-ts` permanece no audit;
- smoke tests locais podem ser confundidos por processos antigos usando a mesma porta.

Nenhum desses pontos bloqueia esta etapa.

## 7. Validações / CI

| Check | Resultado |
|---|---|
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 9/9 |
| E2E | PASS — 33/33 |
| Q1–Q9 | PASS |
| Regressões de ingestão | PASS |
| Regressões de processing | PASS |
| CI | PASS — `33460596579` |
| `npm audit` | FAIL — finding conhecido |

## 8. Decisão de merge

**PODE FAZER MERGE**

O endpoint é pequeno, somente leitura e não quebrou os invariantes da Fase 1.

## 9. Próximo passo

Versionar esta review, fazer o merge da consulta e rodar a CI de `main`.

Depois disso, fazer o fechamento da Fase 1 com fresh clone e README atualizado.
