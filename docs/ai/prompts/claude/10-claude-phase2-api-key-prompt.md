# 10 — Fase 2.3: API key simples

## 1. Ação

A Fase 2.2 foi mergeada em `main` (HEAD `e3894fd`, CI `33483713135` verde).

Agora implemente somente:

autenticação simples por API key

Proteja `POST /documents`, `GET /documents` e `GET /documents/:id` sem
alterar domínio, processing, storage, schema ou state machine.

Não implemente Swagger/OpenAPI, Idempotency-Key, provider real ou revisão
humana nesta tarefa.

Antes de começar, confirme `main`, working tree limpa e CI verde, e crie:

`feat/api-key-auth`

## 2. Contexto

Leia specification, architecture, ADRs, relatórios 007–009, reviews atuais,
README, `.env.example`, `src/main.ts`, o módulo/controller de documents e a
configuração atual do NestJS antes de implementar.

A Fase 2 prevê uma API key simples, mas nem specification nem architecture
definem header, status code ou escopo mais específico — use as decisões
abaixo na ausência de regra mais concreta.

## 3. Papel

Atue como implementador do backend.

Proteja só a superfície funcional de documentos. Não crie autenticação por
usuário — sem login, sessão, JWT, OAuth, refresh token, RBAC ou banco de
usuários.

A revisão e a decisão de merge serão feitas por mim.

## 4. Dados de entrada e referências

Header, na ausência de regra diferente nas fontes de verdade:

`X-API-Key: <valor>`

Somente header — nunca aceite a chave por query string, body, cookie ou
path.

A chave vem de variável de ambiente:

`API_KEY`

Atualize `.env.example` com um valor claramente fictício (`change-me`). Não
hardcode chave de produção nem versione `.env`.

Comportamento:

- sem header → `401`;
- header vazio → `401`;
- chave errada → `401`;
- chave correta → segue normalmente.

Não use `403` para credencial ausente/incorreta. Resposta de erro simples,
sem expor chave esperada/recebida, stack trace ou variável de ambiente —
o formato padrão do NestJS já é suficiente.

Prefira um Guard reutilizável (`ApiKeyGuard`), sem espalhar comparação
manual pelos controllers. Autenticação é preocupação da camada HTTP — não
coloque essa lógica em `DocumentsService`, processing, storage ou Prisma.

A comparação não deve logar a credencial. Se usar `timingSafeEqual`, trate
comprimentos diferentes sem lançar exceção. Não é obrigatório hash/criptografia
da chave nesta fase. Não salve a API key no banco.

Defina comportamento explícito para `API_KEY` ausente: prefira falhar na
inicialização/configuração, nunca aceitar silenciosamente qualquer request.
Nos testes, defina uma chave fictícia controlada — a CI precisa rodar sem
segredo de produção configurado manualmente.

Nunca logue `API_KEY`, o header recebido ou o header completo de
autenticação.

Com API key correta, todo o comportamento anterior de `POST /documents`,
`GET /documents` e `GET /documents/:id` deve permanecer idêntico (magic
bytes, SHA-256, deduplicação, race, paginação, filtro, 400/404/200). Sem
chave/chave errada, a autenticação precisa acontecer antes da lógica de
negócio — nada de `Document`/`ProcessingJob`/storage criados, e a validação
de UUID de `:id` não deve rodar antes da autenticação (`GET
/documents/not-a-uuid` sem chave → `401`, não `400`).

Quero testes para, no mínimo: POST sem chave, POST chave errada, POST chave
correta, ausência de persistência após falha de auth, GET list sem/com
chave errada/com chave correta, GET detail sem/com chave errada/com chave
correta, ordem autenticação x validação de UUID, e regressão completa da
suíte anterior. Ajuste os testes antigos para enviarem a chave fictícia —
não reduza cobertura antiga.

## 5. Formato de saída

Depois de implementar e testar, crie:

`docs/implementation/010-phase2-api-key.md`

Explique: rotas protegidas, header, env var, comportamento 401, ordem
autenticação x validação, Guard, comportamento com configuração ausente,
segurança/logs, testes, regressões, README, `.env.example`, schema,
dependências, CI, riscos, o que ficou fora.

Execute:

```bash
npm ci
npm run prisma:validate
npm run prisma:generate
npm run build
npm run lint
npm test
npm run test:e2e
docker compose config
npm audit
npm audit --omit=dev
```

Antes do commit:

```bash
git status --short
git diff --stat
git diff
```

Commits pequenos, push para `origin/feat/api-key-auth`, acompanhe a CI.

Depois pare para minha revisão.

## 6. Restrições e limites

Não:

- implemente Swagger/OpenAPI;
- implemente Idempotency-Key;
- implemente provider real;
- implemente revisão humana;
- crie login, sessão, JWT, OAuth, refresh token, RBAC ou banco de usuários;
- altere schema ou crie migration (a API key não pertence ao banco nesta
  fase — se achar necessário persistir, pare e reporte antes);
- instale dependência nova sem justificar antes;
- reescreva upload, processing, storage, Prisma ou state machine;
- regrida PDF ou listagem;
- faça merge.

Se o schema não suportar algo indispensável, ou se uma dependência nova
parecer necessária, pare e explique antes de agir.
