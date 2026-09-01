# 06 — Review humana — consulta do documento e vertical slice

## 1. Resultado

**APROVADO PARA MERGE**

Revisei a implementação da consulta individual do documento e a vertical slice completa do backend.

A implementação está tecnicamente correta para o escopo atual e fecha o fluxo mínimo esperado:

```text
receber
→ processar
→ persistir
→ consultar
```

Não encontrei finding novo confirmado nem motivo técnico para impedir o merge.

A aprovação não se baseia apenas na CI verde. Conferi diretamente:

- contrato HTTP;
- comportamento por status;
- tratamento de ID inválido;
- ausência de vazamento de infraestrutura;
- leitura de `DocumentResult`;
- vertical slice ponta a ponta;
- regressões de ingestão e processing;
- schema/migrations;
- relatório 006;
- rastreabilidade do prompt 06.

Resultado final da revisão:

```text
Nenhum finding novo confirmado.

PODE FAZER MERGE
```

---

## 2. Estado revisado

### Branch

`feat/document-query`

### HEAD revisado

`c76554fb58519ac7d8207afbf622c1fd6f8b0e3e`

### Base

`a168c4d`

### Commits revisados

- `e3f874f` — implementação da consulta;
- `65056cc` — testes;
- `c76554f` — relatório da implementação.

### CI

- run: `33460596579`
- resultado: `SUCCESS`
- `headSha`: confirmado como correspondente ao HEAD revisado
- unit: `9/9`
- E2E: `33/33`

### Working tree

Limpa durante a revisão.

### Observação do teste manual

Na primeira tentativa de teste manual ao vivo, as chamadas retornaram `500`.

O problema não estava no endpoint novo. Havia um processo antigo:

```text
node dist/main.js
```

ainda ocupando a porta 3000 com uma versão anterior da aplicação, sem a nova rota.

Depois de encerrar esse processo e repetir o teste com a versão correta, os resultados esperados apareceram imediatamente.

Esse incidente não gerou finding de código, mas vale como observação operacional: processos antigos de smoke test podem confundir validações manuais locais.

---

## 3. O que eu conferi

A revisão cobriu a consulta e a integração dela com o restante da vertical slice.

Conferi:

- `GET /documents/:id`;
- comportamento de `404`;
- tratamento de UUID inválido;
- resposta em `RECEIVED`;
- resposta em `PROCESSING`;
- resposta em `RETRYING`;
- resposta em `COMPLETED`;
- resposta em `NEEDS_REVIEW`;
- resposta em `FAILED`;
- omissão de campos internos;
- ausência de PII em logs novos;
- ausência de erro técnico bruto na resposta;
- regra de escolha do `DocumentResult`;
- consistência entre `Document.status` e `DocumentResult`;
- comportamento somente leitura;
- DTO e mapeamento explícito;
- testes Q1–Q9;
- vertical slice completa Q9;
- regressões T1–T10;
- regressões P1–P15;
- regressão de `PROC-002`;
- ausência de mudança em schema/migrations;
- relatório `006-document-query.md`;
- CI do HEAD revisado;
- rastreabilidade do prompt 06.

Também confirmei que a etapa ficou restrita ao escopo da consulta individual.

Não foram implementados:

- listagem;
- filtros;
- paginação;
- preview/download;
- revisão humana;
- autenticação;
- PDF;
- provider real;
- frontend;
- nome padronizado.

---

## 4. Findings confirmados

**Nenhum finding novo confirmado.**

Apesar disso, alguns pontos mereceram checagem específica.

### ID inválido

Foi testado:

```http
GET /documents/not-a-uuid
```

Resultado:

```http
400 Bad Request
```

com mensagem de validação de UUID v4 e sem exposição de stack trace ou detalhe de banco.

Isso é adequado ao contrato atual.

### Documento inexistente

Foi testado um UUID válido sem registro correspondente.

Resultado:

```http
404 Not Found
```

com mensagem simples:

```json
{
  "message": "Documento não encontrado.",
  "error": "Not Found",
  "statusCode": 404
}
```

Sem vazamento de detalhes internos.

### Campos internos

A resposta não expõe:

- `storageKey`;
- `claimToken`;
- `claimedBy`;
- `claimedAt`;
- `leaseExpiresAt`;
- `attemptCount`;
- `sha256`;
- estrutura de `ProcessingJob`;
- erro técnico bruto;
- stack trace.

O serviço mapeia explicitamente os campos retornados em vez de devolver o objeto Prisma inteiro.

---

## 5. Decisões técnicas relevantes

### Endpoint somente leitura

`GET /documents/:id` realiza somente leitura.

A implementação usa operações equivalentes a:

```text
findUnique
findFirst
```

e não executa:

- update;
- create;
- delete;
- claim;
- retry;
- chamada ao provider;
- acesso ao storage físico.

Isso também foi confirmado em teste manual: após chamadas GET, o banco não sofreu escrita relacionada à consulta.

### Estados em andamento

Para:

```text
RECEIVED
PROCESSING
RETRYING
```

a resposta retorna:

```json
"result": null
```

sem fabricar resultado.

### COMPLETED

Quando o documento está `COMPLETED`, a consulta retorna o resultado realmente persistido.

O retorno inclui:

- `documentType`;
- os cinco campos extraídos;
- `confidence`.

Não há reconstrução do resultado a partir de memória ou do provider.

### NEEDS_REVIEW

Quando o documento está em `NEEDS_REVIEW`, o endpoint retorna o resultado original da IA preservado pelo processamento.

Isso é importante para a próxima fase de revisão humana, porque a consulta não inventa uma correção nem descarta o resultado original.

### FAILED

Quando o documento está `FAILED`, a resposta continua sendo:

```http
200 OK
```

com:

```json
"result": null
```

e sem expor:

- tipo de erro técnico interno;
- detalhes do provider;
- stack trace;
- metadata de retry.

### Regra do DocumentResult

A implementação usa:

```ts
findFirst({
  where: { documentId },
  orderBy: { createdAt: 'desc' }
})
```

A regra foi documentada no relatório 006.

Hoje isso não gera ambiguidade prática porque o fluxo atual só cria resultado quando leva o documento a um estado terminal:

```text
COMPLETED
ou
NEEDS_REVIEW
```

Depois disso, o documento não volta a ser elegível para processing.

Portanto, no fluxo atual, existe no máximo um resultado útil por documento.

O schema não impõe `@unique` em `DocumentResult.documentId`, então essa garantia é operacional, não estrutural.

Considerei isso aceitável nesta fase.

### Q9 fecha a vertical slice

O teste Q9 realmente percorre:

```text
POST /documents
        ↓
Document
        ↓
ProcessingJob
        ↓
processing real
        ↓
fake provider
        ↓
ProcessingRun
        ↓
DocumentResult
        ↓
COMPLETED
        ↓
GET /documents/:id
        ↓
resultado persistido
```

Pontos confirmados:

- upload HTTP real via `supertest`;
- PNG fictício gerado em memória;
- `Document` não inserido manualmente;
- `ProcessingJob` criado pela ingestão real;
- `ProcessingService.processOnce` executa a mesma lógica chamada pelo worker;
- provider fake injetado pelo mecanismo normal de DI;
- `ProcessingRun` criado pelo fluxo real;
- `DocumentResult` criado pela finalização real;
- consulta feita por HTTP real;
- PostgreSQL real;
- resultado validado no corpo.

Nenhum elo material da vertical slice foi pulado.

---

## 6. Riscos não bloqueantes

### Resultado mais recente depende de garantia operacional

O schema permite, tecnicamente, mais de um `DocumentResult` por documento.

Hoje isso não acontece pelo fluxo normal porque documentos terminais não são reprocessados.

Se uma fase futura introduzir reprocessamento, essa regra deverá ser revista.

Possíveis opções futuras:

- unicidade estrutural;
- versionamento explícito;
- relação com tentativa atual;
- regra de resultado ativo.

Não é bloqueador nesta fase.

### Query confia na presença do resultado

A consulta decide se retorna `result` com base no resultado existente.

Hoje `Document.status` e `DocumentResult` são gravados atomicamente no processing, então isso é consistente.

Se uma fase futura permitir reprocessamento ou alteração de resultado, essa suposição deverá ser revista.

### JSON sem validação adicional na leitura

`DocumentResult.data` é lido usando cast de tipo em runtime.

Isso é aceitável porque o dado é produzido pela própria aplicação e validado antes da persistência.

Ainda assim, uma fase futura pode optar por validar novamente o JSON na leitura para maior defesa.

### Audit conhecido

`npm audit` continua reportando 3 vulnerabilidades `high` relacionadas a `deepmerge-ts` via tooling do Prisma.

O finding já era conhecido e não foi introduzido pela consulta.

---

## 7. Validações / CI

### Estados consultados

| Estado | HTTP | Result | Resultado |
|---|---:|---|---|
| `RECEIVED` | 200 | `null` | PASS |
| `PROCESSING` | 200 | `null` | PASS |
| `RETRYING` | 200 | `null` | PASS |
| `COMPLETED` | 200 | presente | PASS |
| `NEEDS_REVIEW` | 200 | presente | PASS |
| `FAILED` | 200 | `null` | PASS |

### Q1–Q9

| Caso | Resultado |
|---|---|
| Q1 — documento inexistente | PASS |
| Q2 — RECEIVED | PASS |
| Q3 — PROCESSING | PASS |
| Q4 — RETRYING | PASS |
| Q5 — COMPLETED | PASS |
| Q6 — NEEDS_REVIEW | PASS |
| Q7 — FAILED | PASS |
| Q8 — não expõe infraestrutura | PASS |
| Q9 — vertical slice completa | PASS |

Todos são E2E com PostgreSQL real.

### Regressões

| Área | Resultado |
|---|---|
| ingestão T1–T10 | PASS |
| processing P1–P15 | PASS |
| regressão PROC-002 | PASS |

### Validações gerais

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 9/9 |
| E2E | PASS — 33/33 |
| Docker Compose | PASS |
| `npm audit` | FAIL — finding conhecido em `deepmerge-ts` |
| `npm audit --omit=dev` | FAIL — mesmo finding conhecido |
| CI | PASS |

### CI

Run:

`33460596579`

Resultado:

`SUCCESS`

HEAD:

`c76554fb58519ac7d8207afbf622c1fd6f8b0e3e`

O `headSha` foi conferido e corresponde ao código revisado.

---

## 8. Decisão de merge

**PODE FAZER MERGE**

Não encontrei bloqueador técnico.

A consulta:

- respeita o contrato;
- trata corretamente ID inexistente e inválido;
- não altera estado;
- não expõe infraestrutura;
- retorna os resultados esperados por status;
- mantém `FAILED` sem vazamento técnico;
- preserva o resultado de `NEEDS_REVIEW`;
- não altera schema ou migrations;
- mantém ingestão e processing sem regressão;
- fecha a vertical slice completa;
- passa na CI do HEAD revisado.

A decisão final não depende apenas dos testes automatizados. O comportamento também foi conferido diretamente no código e em chamadas HTTP manuais.

---

## 9. Próximo passo

Versionar esta review humana e fechar a branch da consulta.

Fluxo recomendado:

```text
review 06 versionada
        ↓
push feat/document-query
        ↓
CI verde
        ↓
merge --ff-only em main
        ↓
push main
        ↓
CI main verde
```

Com esse merge, considero **funcionalmente concluída a vertical slice mínima da Fase 1**:

```text
receber
→ processar
→ persistir
→ consultar
```

Depois disso, antes de iniciar uma nova feature, o próximo trabalho deve ser o fechamento da própria Fase 1:

- revisar README;
- validar execução a partir de ambiente limpo/fresh clone;
- conferir documentação final;
- conferir rastreabilidade de prompts/reviews;
- confirmar que a entrega mínima está reproduzível sem contexto externo.
