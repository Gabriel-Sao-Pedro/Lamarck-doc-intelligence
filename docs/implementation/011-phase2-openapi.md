# Relatório de Implementação — Fase 2.4: Swagger / OpenAPI

## 1. Objetivo

Documentar com precisão o contrato HTTP já existente (`POST /documents`,
`GET /documents`, `GET /documents/:id`) via Swagger/OpenAPI, sem alterar
comportamento de negócio. Escopo definido em
`docs/ai/prompts/claude/11-claude-phase2-openapi-prompt.md`. Nenhum campo,
status, header, resposta ou endpoint foi inventado — cada afirmação do
documento gerado foi conferida contra o código e os testes existentes antes
de ser escrita.

## 2. Dependências adicionadas

Apenas `@nestjs/swagger@12.0.1` (versão exata, sem `^`), compatível com
`@nestjs/core`/`@nestjs/common ^12.0.1` já instalados (peer deps `^12.0.0`
de ambos). Seus peers opcionais (`class-validator`, `class-transformer`,
`@fastify/static`) não foram instalados — nenhum é necessário: o projeto
usa Express (não Fastify) e nunca adotou `class-validator`/`class-transformer`
em nenhum outro DTO, então não havia motivo para introduzi-los agora só
para o Swagger.

## 3. `/docs` e `/docs-json`

Ambos registrados via `SwaggerModule.setup('docs', app, document)`
(`src/openapi.ts`), que é o mecanismo padrão do Nest — `/docs-json` é
gerado automaticamente pelo próprio `setup()`, sem configuração extra.

Ficam públicos, conforme decidido pelo prompt: não expõem dados
processados nem executam operação de negócio, e o botão "Try it out" das
rotas de `/documents` continua exigindo `X-API-Key` real (o Guard roda na
camada HTTP do `DocumentsController`, não em `main.ts`/Swagger). Os assets
da Swagger UI não foram protegidos com `ApiKeyGuard`.

## 4. Metadata

- title: `DOC Intelligence API`
- description: `API de ingestão, processamento assíncrono e consulta de documentos.`
- version: `1.0`

## 5. Security scheme

```json
{
  "api-key": { "type": "apiKey", "in": "header", "name": "X-API-Key" }
}
```

Nome do scheme (`api-key`) centralizado em
`src/auth/api-key.constants.ts` (`API_KEY_SECURITY_SCHEME`) — usado tanto
no registro do scheme (`src/openapi.ts`) quanto no `@ApiSecurity()` do
controller, para as duas pontas nunca divergirem. Confirmado por smoke test
real que as três operações de `/documents` declaram
`"security": [{"api-key": []}]`.

## 6. Rotas documentadas

`POST /documents`, `GET /documents`, `GET /documents/:id` — os únicos três
endpoints funcionais do projeto.

`GET /` (`AppController`) foi **excluído** da documentação de negócio via
`@ApiExcludeEndpoint()` — é smoke/health, nunca fez parte do contrato de
`/documents`, e mantê-lo fora evita que o índice OPENAPI3/OPENAPI5 (rotas
documentadas + segurança) precise de uma exceção especial para uma rota
sem relação com o domínio. Confirmado por smoke test: `/` não aparece em
`paths` no `/docs-json` gerado.

## 7. `POST /documents`

- `multipart/form-data`, campo `file` (nome real usado no
  `FileInterceptor('file', ...)` do controller — não inventei outro nome);
- arquivo documentado como `{ type: 'string', format: 'binary' }`;
- descrição reflete exatamente o pipeline real: JPEG/JPG/PNG/PDF, 10 MB,
  validação por assinatura/magic bytes (não extensão/Content-Type),
  SHA-256 para deduplicação exata, processamento assíncrono depois da
  resposta;
- resposta `202` documentada com `IngestDocumentResponseDto`
  (`documentId`, `status` como enum real do Prisma, `deduplicated`) — o
  mesmo DTO que o controller já retornava, só com `@ApiProperty` adicionado;
- erros documentados: `400` (arquivo ausente ou conteúdo inválido — ambos
  confirmados no código: `BadRequestException` no controller e no
  `DocumentsService`), `401` (`ApiKeyGuard`), `413` (`MulterExceptionsFilter`
  para `LIMIT_FILE_SIZE`).
- **`415` não foi documentado.** Busquei em todo `src/`/`test/` por
  `415`/`UnsupportedMediaType` antes de decidir — não existe nenhuma
  ocorrência. Conteúdo que não é JPEG/PNG/PDF cai em `400`
  (`BadRequestException`), nunca em `415`. Documentar `415` seria inventar
  um código que o runtime não usa.

## 8. `GET /documents`

- `page` (opcional, `>= 1`, default `1`), `pageSize` (opcional, `1`–`100`,
  default `20`), `status` (opcional, enum) — os mesmos limites de
  `document-list-query.dto.ts`, sem reescrever a validação;
- o enum de `status` usado no `@ApiQuery` é o `DocumentStatus` importado de
  `src/generated/prisma/enums.js` — o mesmo enum runtime que
  `parseDocumentListQuery` já valida contra, não um enum manual paralelo
  que pudesse divergir;
- resposta `200` documentada com `DocumentListResponseDto`/
  `DocumentListItemDto`/`DocumentListPaginationDto` (as duas últimas
  eram `interface`, convertidas para `class` só para permitir os
  decorators `@ApiProperty` — sem qualquer mudança de shape ou de como o
  serviço as preenche);
- `400` (parâmetro fora do intervalo/formato) e `401` documentados.

## 9. `GET /documents/:id`

- `id` documentado como path parameter `format: uuid`;
- resposta `200` com `DocumentQueryResponseDto` (os mesmos campos que o
  endpoint já retornava: `documentId`, `documentType`, `status`,
  `createdAt`, `updatedAt`, `result`), `result` marcado `nullable: true`
  com a mesma explicação que a implementação já segue (`null` até existir
  resultado persistido);
- `400` (UUID inválido via `ParseUUIDPipe`), `401`, `404` documentados.

## 10. DTOs

`DocumentResultFieldsDto` e `DocumentResultResponseDto`
(`document-query-response.dto.ts`) também eram `interface`, convertidas
para `class` pelo mesmo motivo — decorator do `@nestjs/swagger` só
funciona em propriedade de classe, via metadata de reflexão. Nenhum dos
quatro `interface→class` alterou o shape dos dados: os serviços continuam
retornando objetos literais que satisfazem a mesma estrutura, e
`document-query.service.ts` continua usando os tipos só em posição de
tipo/assertion (`as DocumentResultFieldsDto`), sem `new`. Nenhuma entidade
Prisma foi usada diretamente como contrato HTTP — os DTOs continuam sendo
a camada de tradução que já existia.

## 11. Privacidade do `/docs-json`

Busquei no JSON gerado (smoke test real, não só leitura de código) por:
`storageKey`, `sha256`, `claimToken`, `ProcessingRun` — nenhuma ocorrência.
`ProcessingJob` apareceu inicialmente dentro do texto de uma descrição
(`deduplicated`: "...nenhum Document/ProcessingJob novo foi criado") —
não era um campo nem valor operacional exposto, só prosa explicativa, mas
reescrevi a frase para não citar nomes de entidade interna mesmo assim
("...nada novo foi criado — documentId aponta para o registro
existente"), deixando a checagem de privacidade estrita sem exceção.
Também confirmei ausência do valor real de `API_KEY`/`.env` e de qualquer
path de storage local. Nenhum example fictício usa dado de pessoa real.

## 12. Comportamento de runtime

Nenhuma rota mudou de comportamento. `ApiKeyGuard` continua sendo o único
mecanismo de autorização, aplicado do mesmo jeito (`@UseGuards` na classe
do controller) — os decorators do Swagger são metadata para geração de
documentação, não interceptam nem alteram a request. Confirmado pela
regressão completa (68 testes anteriores continuam verdes) e por smoke
test manual real do fluxo de auth.

## 13. `src/processing/` e `src/storage/`

Nenhuma alteração. `git diff --stat` desta tarefa não toca nenhum arquivo
dessas pastas.

## 14. Testes (OPENAPI1–OPENAPI10)

Todos em `test/openapi.e2e-spec.ts` (novo arquivo), contra uma aplicação
Nest real (`TestingModule` + `setupOpenApi()`, a mesma função usada em
`main.ts` — sem duplicar a configuração do documento num segundo lugar
que pudesse divergir):

| Teste | Cobre |
|---|---|
| OPENAPI1 | `GET /docs` → `200`, `Content-Type` HTML, contém "swagger" |
| OPENAPI2 | `GET /docs-json` → `200`, documento com `openapi`/`info`/`paths` |
| OPENAPI3 | `paths` contém `POST /documents`, `GET /documents`, `GET /documents/{id}` |
| OPENAPI4 | `components.securitySchemes` tem exatamente 1 scheme, `type: apiKey`, `in: header`, `name: X-API-Key` |
| OPENAPI5 | as três operações de `/documents` declaram `security` não vazio |
| OPENAPI6 | `POST /documents` tem `requestBody` `multipart/form-data` com `file: { type: string, format: binary }` |
| OPENAPI7 | `GET /documents` documenta `page`/`pageSize`/`status`, todos `in: query` |
| OPENAPI8 | `GET /documents/{id}` documenta `id` como `in: path`, `format: uuid` |
| OPENAPI9 | documento serializado não contém `storageKey`/`sha256`/`claimToken`/`ProcessingJob`/`ProcessingRun` |
| OPENAPI10 | Regressão completa — não é um teste novo; coberta pela execução de `npm run test:e2e`, que roda as 7 suítes anteriores sem alteração de comportamento nelas |

## 15. Smoke/manual

Rodei a aplicação de verdade (`node dist/main.js`, com `API_KEY` temporária
só para o teste, restaurada ao `.env` original depois) e confirmei:

- `GET /docs` → `200`;
- `GET /docs-json` → `200`, JSON válido;
- `info.title`/`description`/`version` corretos;
- `paths` só com `/documents` e `/documents/{id}` (sem `/`);
- `components.securitySchemes` com o scheme esperado;
- `security` presente em `POST`/`GET /documents` e `GET /documents/{id}`;
- schema de multipart com `file: string/binary`;
- query params de `GET /documents` documentados;
- `id` de `GET /documents/{id}` como `path`/`uuid`;
- busca por termos sensíveis no JSON gerado, sem ocorrência.

## 16. Regressões e um achado de processo (não de código)

`npm test` → 4/4 arquivos, 15/15 PASS. `npm run test:e2e` → 8/8 arquivos,
77/77 PASS (68 anteriores + 9 novas: OPENAPI1–OPENAPI9).

Durante a validação, a primeira rodada de `test:e2e` falhou de forma
intermitente (P11/P12/P15 em `processing.e2e-spec.ts`, sem relação com
nenhum arquivo desta tarefa). Investiguei antes de assumir flake: a causa
raiz foi um processo `node dist/main.js` órfão, deixado pelo meu próprio
smoke test manual (seção 15), que o `pkill` não conseguiu encerrar de
verdade neste ambiente Windows — esse processo tinha o worker de
processamento habilitado (não usei `PROCESSING_WORKER_ENABLED=false` no
smoke test manual) e ficou reivindicando jobs da mesma fila usada pelos
testes, em segundo plano. Identifiquei pela porta 3000 ainda ocupada
(`netstat`), encerrei via `taskkill /F`, limpei as tabelas órfãs no
Postgres de teste e a suíte voltou a passar de forma consistente. Não é
um bug em nenhum código desta tarefa nem das anteriores — é uma nota de
higiene de processo para quem repetir esse tipo de smoke test manual
neste ambiente.

## 17. README

Adicionada a seção curta "Documentação da API" (links para `/docs` e
`/docs-json`, nota de que as rotas de documentos exigem `X-API-Key`).
Nenhuma outra seção foi reescrita.

## 18. Schema e migrations

Nenhuma alteração. `npm run prisma:migrate:deploy` confirmou "No pending
migrations to apply".

## 19. CI

Nenhuma alteração no workflow — a nova suíte é coletada automaticamente
por `test:e2e`.

## 20. `npm audit`

| Check | Antes desta tarefa | Depois |
|---|---|---|
| `npm audit` | 3 `high` (`deepmerge-ts`, tooling do Prisma) | mesmos 3, nenhum novo |
| `npm audit --omit=dev` | mesmos 3 | mesmos 3, nenhum novo |

`@nestjs/swagger` não introduziu nenhum finding novo — confirmado
comparando a saída antes e depois da instalação.

## 21. Riscos

- `/docs`/`/docs-json` são públicos por decisão desta fase — alguém pode
  ler o contrato da API sem autenticação (não os dados, só a forma dos
  endpoints/schemas). Aceitável conforme o prompt: não é operação de
  negócio nem dado processado.
- O mesmo finding conhecido de `deepmerge-ts` permanece, sem mudança.

## 22. O que ficou fora

Conforme o prompt: feature de domínio nova, `Idempotency-Key`, provider
real, revisão humana, biblioteca paralela de documentação, ADR novo,
alteração de schema/migration, alteração de `processing`/`storage` além
de zero. Nenhum desses entrou nesta tarefa.

## 23. Assistência do Claude nesta implementação

Todo o código desta tarefa — `src/openapi.ts`, `src/auth/api-key.constants.ts`,
as alterações em `src/main.ts`, `src/app.controller.ts`,
`src/documents/documents.controller.ts` e nos DTOs de
`src/documents/dto/`, a suíte `test/openapi.e2e-spec.ts`, a seção do
`README.md` e este relatório — foi gerado por mim (Claude) nesta tarefa,
a partir do prompt em
`docs/ai/prompts/claude/11-claude-phase2-openapi-prompt.md`. Não fiz
revisão humana desta implementação — essa revisão ainda não aconteceu e
não é responsabilidade minha realizá-la.
