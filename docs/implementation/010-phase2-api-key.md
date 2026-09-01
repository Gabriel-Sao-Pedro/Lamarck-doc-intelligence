# Relatório de Implementação — Fase 2.3: API key simples

## 1. Objetivo

Proteger a superfície funcional de documentos (`POST /documents`, `GET
/documents`, `GET /documents/:id`) com uma autenticação simples por API key,
sem alterar domínio, processing, storage, schema ou state machine. Escopo
definido em
`docs/ai/prompts/claude/10-claude-phase2-api-key-prompt.md`. Nem
`docs/specification.md` nem `docs/architecture.md` definem header, status
code ou escopo mais específicos além de "API key simples" — as decisões
abaixo vieram do prompt desta tarefa.

## 2. Rotas protegidas

| Rota | Protegida? |
|---|---|
| `POST /documents` | Sim |
| `GET /documents` | Sim |
| `GET /documents/:id` | Sim |
| `GET /` (smoke, `AppController`) | Não — fora da superfície funcional de documentos |

A proteção é aplicada uma única vez, no nível da classe
(`@UseGuards(ApiKeyGuard)` em `DocumentsController`) — cobre as três rotas
automaticamente, sem repetir o decorator em cada handler.

## 3. Header e variável de ambiente

- Header: `X-API-Key` (Node/Express já normaliza nomes de header para
  minúsculas; `request.headers['x-api-key']` cobre qualquer capitalização
  enviada pelo cliente).
- A chave só é aceita por header. Query string, body, cookie e path nunca
  são lidos como fonte da credencial.
- Variável de ambiente: `API_KEY`, lida sob demanda por
  `getConfiguredApiKey()` (`src/auth/api-key.config.ts`) — não como
  constante de módulo, para permitir o bootstrap falhar de forma
  independente de qualquer ordem de import (ver seção 6).

## 4. Comportamento HTTP

| Cenário | Resposta |
|---|---|
| Sem header `X-API-Key` | `401 Unauthorized` |
| Header presente mas vazio | `401 Unauthorized` |
| Chave incorreta | `401 Unauthorized` |
| Chave correta | segue para o controller normalmente |

O corpo de erro é o padrão do `UnauthorizedException` do NestJS —
`{"statusCode":401,"message":"Unauthorized"}` — sem necessidade de filtro
customizado, exatamente como o prompt aceitava.

## 5. Ordem: autenticação antes de validação

`ApiKeyGuard` é um Guard, e Guards rodam antes de Pipes no ciclo de vida do
Nest. Isso garante, sem código adicional, que:

- `GET /documents/not-a-uuid` sem API key → `401` (o `ParseUUIDPipe` do
  parâmetro `:id` nunca chega a rodar);
- `GET /documents/not-a-uuid` com API key correta → `400` (comportamento
  anterior preservado).

Pelo mesmo motivo, `POST /documents` sem API key nunca chega a acionar o
`FileInterceptor`/Multer — a rejeição acontece antes de qualquer parsing do
multipart, então nenhum arquivo é lido ou bufferizado numa request não
autenticada.

## 6. Guard e configuração

`ApiKeyGuard` (`src/auth/api-key.guard.ts`) é um `CanActivate` simples,
registrado como provider em `DocumentsModule` e aplicado só no controller de
documents — não há lógica de autenticação em `DocumentsService`, processing,
storage ou Prisma.

A comparação usa `crypto.timingSafeEqual`, com uma checagem de comprimento
antes (`timingSafeEqual` lança se os buffers tiverem tamanhos diferentes;
comprimentos diferentes retornam `false` diretamente, sem exceção).

### Falha de configuração

Preferi falhar cedo, não silenciosamente aceitar tudo:

- `main.ts` chama `getConfiguredApiKey()` antes de `NestFactory.create()` —
  se `API_KEY` estiver ausente/vazia, o processo lança e não sobe.
- Como reforço, o próprio Guard chama a mesma função a cada request; se de
  alguma forma a aplicação estiver rodando sem `API_KEY` configurada (ex.:
  em testes que montam a aplicação via `TestingModule` sem passar por
  `main.ts`), a exceção lançada por `getConfiguredApiKey()` também impede
  qualquer autorização silenciosa.
- Não existe chave padrão de produção escondida no código — o `.env.example`
  só tem `change-me`, claramente fictício.

## 7. Segurança

- A chave nunca é logada — nem em `logger.log`, nem em erro, nem em log de
  request genérico (o projeto não tem middleware de log de headers).
- Não vai para o banco, storage ou `DocumentResult` — o Guard só compara em
  memória e retorna `true`/lança exceção.
- A resposta de erro não expõe a chave esperada, a chave recebida, parte da
  chave, stack trace ou nome da variável de ambiente.
- `.env` continua fora do Git (`.gitignore` já cobria isso desde a
  foundation).

## 8. Testes (KEY1–KEY12)

Todos em `test/api-key-auth.e2e-spec.ts` (novo arquivo), contra PostgreSQL
real:

| Teste | Cobre |
|---|---|
| KEY1 | `POST /documents` sem `X-API-Key` → `401` |
| KEY2 | `POST /documents` com chave errada → `401` |
| KEY3 | `POST /documents` com chave correta → `202`, comportamento de ingestão preservado |
| KEY4 | Depois de KEY1/KEY2 (duas falhas de auth): 0 `Document`, 0 `ProcessingJob`, nenhum arquivo físico novo no storage |
| KEY5 | `GET /documents` sem chave → `401` |
| KEY6 | `GET /documents` com chave errada → `401` |
| KEY7 | `GET /documents` com chave correta → `200`, paginação/filtro continuam funcionando |
| KEY8 | `GET /documents/:id` sem chave → `401` |
| KEY9 | `GET /documents/:id` com chave errada → `401` |
| KEY10 | `GET /documents/:id` com chave correta → `200`/`404` preservados |
| KEY11 | `GET /documents/not-a-uuid` sem chave → `401` (não `400`); com chave correta → `400` |
| KEY12 | Regressão completa — não é um teste novo; coberta pela execução de `npm run test:e2e`, que roda as 7 suítes (ingestão, processamento, consulta, listagem, PDF, auth) sem alteração de comportamento nas 6 anteriores |

Os testes antigos que chamam `/documents` foram ajustados para enviar
`X-API-Key: test-api-key` (constante em `test/support/api-key.ts`), definida
como `API_KEY` do ambiente em `test/setup-e2e.ts` — nenhuma cobertura
antiga foi reduzida, só passou a incluir o header necessário.

### Testes unitários do Guard

`src/auth/api-key.guard.spec.ts` cobre, isolado (sem subir o Nest inteiro):
ausência de header, header vazio, chave errada (incluindo comprimento
diferente da configurada), chave correta, e `API_KEY` ausente no ambiente
(deve lançar, não deixar passar silenciosamente).

## 9. Regressões

`npm test` → 4/4 arquivos, 15/15 PASS (9 anteriores + 6 novos do Guard).
`npm run test:e2e` → 7/7 arquivos, 68/68 PASS (57 anteriores + 11 novas:
KEY1–KEY11). Nenhum teste pré-existente foi removido ou teve comportamento
alterado — só passou a enviar o header.

## 10. Schema e migrations

Nenhuma migration nova. `npm run prisma:migrate:deploy` confirmou "No
pending migrations to apply" depois da implementação. A API key não é
persistida em nenhuma tabela — vive só em variável de ambiente e é
comparada em memória a cada request.

## 11. Dependências

Nenhuma dependência nova. `crypto.timingSafeEqual` é built-in do Node; o
projeto não usa `@nestjs/config` hoje, então segui o mesmo padrão já
existente de ler `process.env` diretamente (mesmo padrão de
`PROCESSING_WORKER_ENABLED`/`PROCESSING_WORKER_POLL_INTERVAL_MS` em
`src/processing/processing.constants.ts`).

## 12. README e `.env.example`

- `.env.example`: adicionada `API_KEY=change-me`, com comentário explicando
  que a aplicação recusa subir sem essa variável.
- `README.md`: bullet de status atualizado; nova linha na tabela de
  variáveis de ambiente explicando que `API_KEY` é obrigatória; frase
  explicando o header antes dos exemplos de uso; os três exemplos de `curl`
  (upload, consulta, listagem) passaram a incluir `-H "X-API-Key:
  change-me"`; a entrada "sem autenticação" na lista de limitações foi
  substituída por uma descrição do que a API key cobre (e não cobre — sem
  login/sessão/JWT/OAuth/usuários); nota sobre a chave fictícia usada pela
  suíte e2e. Nenhuma outra seção foi reescrita.

## 13. Validações

| Check | Resultado |
|---|---|
| `npm ci` | PASS |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Build | PASS |
| Lint | PASS |
| Unit | PASS — 15/15 |
| E2E | PASS — 68/68 |
| Docker Compose | PASS |
| `npm audit` | FAIL — finding conhecido (`deepmerge-ts`, tooling do Prisma), sem mudança |
| `npm audit --omit=dev` | FAIL — mesmo finding |

Nenhum `npm audit fix --force` foi executado.

## 14. Riscos

- A API key é única e compartilhada — não há rotação, expiração nem
  identificação de qual chamador está usando a chave. Adequado para
  comunicação service-to-service simples desta fase, não para múltiplos
  consumidores com necessidades de revogação individual.
- `timingSafeEqual` mitiga ataques de timing na comparação byte a byte, mas
  o `return false` antecipado quando os comprimentos diferem ainda vaza,
  em teoria, se o comprimento da chave configurada é igual ao da chave
  enviada — risco teórico, não considerado relevante para o escopo desta
  fase (a chave não é pública nem teve seu tamanho documentado).
- `npm audit`/`npm audit --omit=dev` continuam reportando as mesmas 3
  vulnerabilidades `high` conhecidas em `deepmerge-ts`, sem mudança.

## 15. O que ficou fora

Conforme o prompt: Swagger/OpenAPI, `Idempotency-Key`, provider real,
revisão humana, login/sessão/JWT/OAuth/refresh token/RBAC/banco de
usuários, hashing/criptografia da API key, persistência da chave no banco.
Nenhum desses entrou nesta tarefa.

## 16. Assistência do Claude nesta implementação

Todo o código desta tarefa — `src/auth/api-key.config.ts`,
`src/auth/api-key.guard.ts`, `src/auth/api-key.guard.spec.ts`, as alterações
em `src/documents/documents.controller.ts`,
`src/documents/documents.module.ts` e `src/main.ts`, a fixture
`test/support/api-key.ts`, a suíte `test/api-key-auth.e2e-spec.ts`, os
ajustes nos testes e2e existentes, as duas linhas do `.env.example`, as
alterações do `README.md` e este relatório — foi gerado por mim (Claude)
nesta tarefa, a partir do prompt em
`docs/ai/prompts/claude/10-claude-phase2-api-key-prompt.md`. Não fiz
revisão humana desta implementação — essa revisão ainda não aconteceu e
não é responsabilidade minha realizá-la.
