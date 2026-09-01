# Relatório de Implementação — Fase 2.2: suporte a PDF

## 1. Objetivo da slice

Ampliar `POST /documents` para aceitar `PDF` além de `JPEG`/`JPG`/`PNG`,
segunda fatia da Fase 2 (`docs/specification.md` §23,
`PROJECT_CONTEXT.md` §4/§15). Escopo definido em
`docs/ai/prompts/claude/09-claude-phase2-pdf-support-prompt.md`. Nenhuma
funcionalidade além do suporte ao formato PDF no pipeline já existente
entrou nesta tarefa — sem API key, Swagger/OpenAPI, `Idempotency-Key`,
provider real ou revisão humana.

## 2. Tipos aceitos: antes/depois

| | Antes | Depois |
|---|---|---|
| `POST /documents` | `JPEG`/`JPG`/`PNG` | `JPEG`/`JPG`/`PNG`/`PDF` |

Sem endpoint novo. O mesmo `POST /documents` decide o tipo pelo conteúdo
real do arquivo, não por rota separada.

## 3. Detecção por magic bytes

`src/documents/file-signature.ts` já continha a detecção de JPEG/PNG por
assinatura de bytes — não por extensão nem pelo `Content-Type` declarado
pelo cliente (specification.md §6). Estendi essa mesma função em vez de
criar uma lógica paralela (o prompt pede isso explicitamente na seção 5):

- renomeei `detectImageSignature`/`DetectedImageType` para
  `detectFileSignature`/`DetectedFileType` — o nome anterior citava
  "imagem", que deixaria de ser preciso ao incluir PDF;
- adicionei a assinatura de PDF: `%PDF-` (bytes `25 50 44 46 2D`), a
  mesma exigida pelo prompt desta tarefa.

`DocumentsService.ingest` (`src/documents/documents.service.ts`) só trocou
o nome da função chamada e a mensagem de erro (`400`) para mencionar PDF —
o resto do fluxo (hash, deduplicação, storage, transação) já era genérico
o suficiente para não precisar de nenhuma ramificação por tipo de arquivo.

## 4. Regra `%PDF-`

Confirmada e usada exatamente como especificado: um buffer só é aceito
como PDF se os 5 primeiros bytes forem `25 50 44 46 2D`. Testado ao vivo
(PDF1) e o caso negativo — extensão/Content-Type de PDF com bytes que não
começam com essa assinatura — rejeitado com `400` (PDF2/PDF3).

## 5. Limite de tamanho

Preservado em 10 MB (`MAX_UPLOAD_SIZE_BYTES`,
`src/documents/documents.constants.ts`) — `PROJECT_CONTEXT.md` §4 não
define um limite diferente para PDF, então não alterei o valor. O limite
continua sendo aplicado pelo Multer/Busboy durante o próprio parsing
multipart (`MulterExceptionsFilter`), antes de qualquer buffering
arbitrário — nenhuma mudança nesse mecanismo. PDF acima do limite retorna
`413` (PDF5).

## 6. MIME type e metadata

`Document.mimeType` (schema já existente, `String` genérico) passa a
receber `application/pdf` quando o conteúdo detectado é PDF — a mesma
coluna que já guardava `image/jpeg`/`image/png`. `documentType`
(`IDENTITY_DOCUMENT`, o tipo de negócio) não muda por causa do formato do
arquivo — são conceitos diferentes, confirmado por teste dedicado (PDF8).

## 7. Storage

Nenhuma mudança em `DocumentStorage`/`LocalDocumentStorage`
(`src/storage/`). `buildKey(extension)` já gerava a chave a partir de um
UUID interno mais a extensão recebida como parâmetro — passar `'pdf'`
nesse parâmetro (vindo do tipo detectado, nunca do nome enviado pelo
cliente) foi suficiente. `storageKey` de um documento PDF termina em
`.pdf`, confirmado por teste (PDF4).

## 8. SHA-256 e deduplicação

Sem mudança na lógica (ADR-004): o hash continua sobre os bytes crus,
sem normalização por tipo de arquivo. Dois PDFs com os mesmos bytes
deduplicam (`deduplicated: true`, mesmo `documentId`, nenhum segundo
`ProcessingJob` — PDF6). Bytes diferentes (mesmo que seja o "mesmo
documento" regenerado como PDF) não deduplicam — comportamento herdado e
documentado como limitação conhecida (ADR-004 §"Limitações").

### Race

A mesma proteção por constraint única (`sha256`) e compensação de storage
já testada para imagem (T9) foi testada agora para PDF (PDF7): das duas
requisições concorrentes com os mesmos bytes, só uma cria o `Document`;
a outra reconhece a corrida perdida, recupera o documento vencedor e
remove apenas o arquivo físico que ela própria salvou. O diretório de
storage ganha exatamente uma entrada nova (a do vencedor).

## 9. Processing

Nenhuma mudança em `src/processing/` (worker, `JobClaimService`,
`FinalizationService`, `state-transition.ts`, `processing.constants.ts`).
Confirmei, lendo o código antes de alterar qualquer coisa, que nada ali
assumia JPEG/PNG:

- `JobClaimService`/`FinalizationService` só leem/gravam `documentId`,
  `documentType` (de negócio) e `storageKey` como valores opacos — nunca
  interpretam o conteúdo do arquivo;
- `ProviderInput` (`src/processing/provider/provider.types.ts`) já
  carregava só `documentId`/`documentType`/`storageKey` — nenhum campo de
  bytes/mimetype de arquivo.

Não houve, portanto, nenhum acoplamento a imagem para generalizar — PDF
entra no mesmo `ProcessingJob`, mesma fila, mesmo claim/lease/fencing,
sem nenhuma mudança nesses arquivos.

## 10. Fake provider

`FakeDocumentAiProvider` (`src/processing/provider/fake-document-ai-provider.ts`)
já ignorava o conteúdo do `ProviderInput` (parâmetro `_input`, nunca lido)
e sempre devolvia os mesmos dados fictícios determinísticos do
`IDENTITY_DOCUMENT`. Isso já cobria PDF sem qualquer alteração — o fake
processa um documento PDF com sucesso pelo mesmo motivo que processa uma
imagem: ele nunca olha para o arquivo real. Nenhum OCR, parser PDF real
ou provider multimodal externo foi adicionado.

## 11. Validação semântica

`validateResult` (`src/processing/validation/result-validator.ts`) não
mudou — continua validando campos obrigatórios, formato de `birthDate` e
limiar de confiança do resultado, independentemente do formato do arquivo
de origem. Um documento PDF passa pelos mesmos dois checks (estrutural +
"contra o documento", simulado) que uma imagem.

## 12. Consulta e listagem

Nenhuma mudança em `DocumentQueryService`/`DocumentListService` nem nos
DTOs de resposta. Um documento PDF processado aparece em `GET
/documents/:id` (PDF10) e em `GET /documents` (PDF11) exatamente como um
documento de imagem — mesmos campos, nenhum campo novo de tipo de arquivo
exposto (nem `mimeType`, nem `storageKey`, confirmado testando que a
resposta serializada não contém essas strings).

## 13. Erros HTTP

| Caso | Status |
|---|---|
| PDF válido | `202` (preservado) |
| PDF inválido (bytes não correspondem a `%PDF-`) | `400` (preservado, mesma exceção usada para JPEG/PNG inválidos) |
| PDF acima de 10 MB | `413` (preservado, mesmo `MulterExceptionsFilter`) |
| campo `file` ausente | `400` (preservado, sem mudança) |
| erro interno | `500` sem stack/path/PII (preservado, sem mudança) |

Nenhum código HTTP novo foi criado para PDF.

## 14. Testes (PDF1–PDF14)

Todos em `test/pdf-support.e2e-spec.ts` (novo arquivo), contra PostgreSQL
real, com o worker desabilitado (`PROCESSING_WORKER_ENABLED=false`) e
`processingService.processOnce()` chamado manualmente onde a tarefa exige
processamento — mesmo padrão de `test/processing.e2e-spec.ts`.

| Teste | Cobre |
|---|---|
| PDF1 | Upload de PDF válido → `202` |
| PDF2 | Extensão `.pdf` com bytes inválidos → `400`, nenhum `Document` criado |
| PDF3 | `Content-Type: application/pdf` declarado com conteúdo que não é PDF → `400` |
| PDF4 | PDF válido com nome/`Content-Type` de imagem (`pdf4-enganoso.png`, `image/png`) → aceito pelo tipo real detectado (`202`, `mimeType=application/pdf`, `storageKey` termina em `.pdf`) |
| PDF5 | PDF acima de 10 MB → `413`, nenhum `Document` criado |
| PDF6 | Mesmo PDF duas vezes → segunda resposta `deduplicated: true`, mesmo `documentId`/status, um único `ProcessingJob` |
| PDF7 | Duas requisições concorrentes com os mesmos bytes → exatamente 1 `Document`/1 `ProcessingJob`, só o arquivo físico vencedor permanece |
| PDF8 | `Document.mimeType = 'application/pdf'`, `documentType` continua `IDENTITY_DOCUMENT` |
| PDF9 | PDF ingerido → `processOnce` → `COMPLETED` → `DocumentResult` criado |
| PDF10 | `GET /documents/:id` retorna `status`/`result` coerentes para um documento PDF processado |
| PDF11 | Documento PDF aparece em `GET /documents`, sem `storageKey`/`mimeType`/`sha256`/campos extraídos na resposta |
| PDF12 | Vertical slice completa: `POST` PDF → persistência → `ProcessingJob` → `processOnce` → `DocumentResult` → `GET /documents/:id` = `COMPLETED` |
| PDF13 | JPG e PNG válidos continuam aceitos depois da extensão para PDF (regressão de imagem, no mesmo arquivo de teste) |
| PDF14 | Regressão completa — não é um teste novo; coberta pela execução de `npm run test:e2e`, que roda as 5 suítes anteriores (ingestão, processamento, consulta, listagem) sem nenhuma mudança de comportamento nelas, junto com esta nova suíte |

### Achado corrigido durante a implementação

Na primeira execução, PDF9/PDF10/PDF12 falharam: `processOnce()`
reivindica o job elegível mais antigo do PostgreSQL real
(`ORDER BY pj."createdAt" ASC`, `docs/architecture.md` §10), e os
`ProcessingJob`s criados pelos testes de ingestão anteriores (PDF1, PDF4,
PDF6, PDF7, PDF8) ainda estavam na fila — só eram limpos no `afterAll`.
O job mais antigo da fila (de um teste de ingestão anterior, não o do
próprio teste de processamento) acabava sendo o reivindicado. Corrigi
trocando a limpeza de "só no fim do arquivo" para "a cada teste"
(`afterEach`, mesma técnica já usada em `test/processing.e2e-spec.ts`),
garantindo fila vazia entre um teste e outro. Nenhum código de produção
precisou mudar por causa disso — era um problema do isolamento do teste,
não do pipeline.

## 15. Regressões

`npm test` → 3/3 arquivos, 9/9 PASS (sem mudança nos testes existentes).
`npm run test:e2e` → 6/6 arquivos, 57/57 PASS (44 anteriores + 13 novas
desta tarefa: PDF1–PDF13). Nenhum teste pré-existente foi alterado.

## 16. Schema e migrations

Nenhuma migration nova. `npm run prisma:migrate:deploy` confirmou "No
pending migrations to apply" depois da implementação. `Document.mimeType`
já era `String` genérico desde o schema inicial da Fase 1 — suficiente
para guardar `application/pdf` sem qualquer alteração estrutural.

## 17. README

Atualizei duas seções que citavam explicitamente "só JPEG/JPG/PNG":

- a introdução da seção "Enviando e consultando um documento", que agora
  menciona PDF e a assinatura `%PDF-`;
- "Limitações da Fase 1", que citava "só JPEG/JPG/PNG" e "sem suporte a
  PDF" como limitação — atualizei a lista de tipos aceitos e removi essa
  entrada. Removi também, na mesma lista, a entrada "sem listagem (`GET
  /documents`)...", que já estava desatualizada desde a Fase 2.1 (mergeada
  antes desta tarefa) — não fazia sentido deixar essa imprecisão logo ao
  lado do texto que eu já estava corrigindo.

Nenhum outro rewrite do README.

## 18. Validações

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 9/9 |
| E2E | PASS — 57/57 |
| Docker Compose (`config`) | PASS |
| `npm audit` | FAIL — finding conhecido (`deepmerge-ts`, tooling do Prisma) |
| `npm audit --omit=dev` | FAIL — mesmo finding |

Nenhum `npm audit fix --force` foi executado.

## 19. Dependências

Nenhuma dependência nova. A detecção de PDF usa a mesma abstração de
magic bytes já existente (comparação de bytes em `Buffer`), sem
biblioteca de parsing de PDF — suficiente para o escopo desta fase
(assinatura + tamanho + buffer não vazio, sem interpretar a estrutura
interna do arquivo).

## 20. Riscos

- Os mesmos riscos já registrados no relatório 003 (arquivo órfão em uma
  janela muito estreita entre salvar no storage e o processo cair antes
  da compensação) se aplicam a PDF, sem mudança — é uma limitação da
  abstração de storage, não específica de tipo de arquivo.
- `npm audit`/`npm audit --omit=dev` continuam reportando as mesmas 3
  vulnerabilidades `high` conhecidas em `deepmerge-ts` (tooling do
  Prisma), sem mudança — nenhuma dependência nova foi adicionada.
- A detecção por assinatura (`%PDF-`) confirma só o início do arquivo —
  um PDF corrompido ou truncado depois dos primeiros bytes passa na
  validação desta fase (comportamento intencional; `docs/ai/prompts/claude/
  09-claude-phase2-pdf-support-prompt.md` §5 exclui explicitamente
  validação estrutural completa desta tarefa).

## 21. O que ficou fora

Conforme o prompt: API key, Swagger/OpenAPI, `Idempotency-Key`, provider
real, revisão humana, parser/OCR real de PDF, validação de assinatura
digital/criptografia/PDF-A/estrutura completa de páginas, endpoint novo,
alteração de limite de tamanho, alteração de schema/migration, nova regra
de coerência entre extensão e conteúdo detectado. Nenhum desses entrou
nesta tarefa.

## 22. Assistência do Claude nesta implementação

Todo o código desta tarefa — as alterações em
`src/documents/file-signature.ts` e `src/documents/documents.service.ts`,
a fixture `test/support/pdf-fixtures.ts`, a suíte
`test/pdf-support.e2e-spec.ts`, as duas seções atualizadas do `README.md`
e este relatório — foi gerado por mim (Claude) nesta tarefa, a partir do
prompt em
`docs/ai/prompts/claude/09-claude-phase2-pdf-support-prompt.md`. Não fiz
revisão humana desta implementação — essa revisão ainda não aconteceu e
não é responsabilidade minha realizá-la.
